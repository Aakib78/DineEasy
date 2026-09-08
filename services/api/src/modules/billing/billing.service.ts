import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError, ValidationDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { DailyCounterService } from '../../common/counters/daily-counter.service';
import { OrdersService } from '../orders/orders.service';
import { PrintersService } from '../printers/printers.service';
import { computeInvoiceTaxBreakdown, InvoiceTaxableLine } from './invoice-tax.util';

/**
 * Billing (spec §9/§16): turns a SERVED order into an immutable Invoice with a GST-compliant
 * CGST/SGST/IGST breakdown. The order must already be fully SERVED — you bill what was
 * actually delivered, not what was ordered, so a cancelled item never appears on the bill.
 *
 * v1 note: `OrderItem` stores one rolled-up `taxAmount`, not a per-tax-component breakdown,
 * so `InvoiceTax` rows are recomputed here from each item's *current* `MenuItem.taxGroup`
 * rather than a rate frozen at order-placement time. For a single dining session (minutes to
 * a couple of hours) this is a safe approximation — tax rates essentially never change
 * mid-service — but it's a real limitation if a tax group is edited between order and
 * billing; documented rather than silently assumed correct. See docs/database.md.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly dailyCounter: DailyCounterService,
    private readonly ordersService: OrdersService,
    private readonly printersService: PrintersService,
  ) {}

  async generateInvoice(
    organizationId: string,
    outletId: string,
    orderId: string,
    actorUserId: string,
  ) {
    const order = await this.ordersService.getById(organizationId, outletId, orderId);

    const existing = await this.prisma.invoice.findFirst({ where: { organizationId, orderId } });
    if (existing) return this.getById(organizationId, existing.id); // idempotent — never double-invoice

    if (order.status !== 'SERVED') {
      throw new ValidationDomainError(
        `Cannot bill an order that is ${order.status} — it must be SERVED first.`,
      );
    }

    const activeItems = order.items.filter((i) => !i.isCancelled);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.dailyCounter.next(tx, outletId, 'INVOICE');

      // Fetching each line's current tax-group components needs a live Prisma client, so it
      // stays here; the decimal aggregation math that used to live inline in this loop is now
      // `computeInvoiceTaxBreakdown` (see its doc comment) so it can actually be unit tested.
      const taxableLines: InvoiceTaxableLine[] = [];
      for (const item of activeItems) {
        const menuItem = await tx.menuItem.findFirst({
          where: { id: item.menuItemId },
          include: { taxGroup: { include: { components: true } } },
        });
        taxableLines.push({
          subtotal: item.subtotal.toString(),
          taxComponents: (menuItem?.taxGroup?.components ?? []).map(
            (c: { taxType: string; ratePercent: { toString(): string } }) => ({
              taxType: c.taxType,
              ratePercent: c.ratePercent.toString(),
            }),
          ),
        });
      }
      const taxBreakdown = computeInvoiceTaxBreakdown(taxableLines);

      const created = await tx.invoice.create({
        data: {
          organizationId,
          outletId,
          orderId,
          invoiceNumber,
          subtotal: order.subtotal,
          discountTotal: order.discountTotal,
          taxTotal: order.taxTotal,
          serviceChargeTotal: order.serviceChargeTotal,
          roundOff: order.roundOff,
          total: order.total,
        },
      });

      await tx.invoiceItem.createMany({
        data: activeItems.map((item) => ({
          invoiceId: created.id,
          orderItemId: item.id,
          description: item.variantNameSnapshot
            ? `${item.nameSnapshot} (${item.variantNameSnapshot})`
            : item.nameSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          taxAmount: item.taxAmount,
          total: item.total,
        })),
      });

      if (taxBreakdown.length > 0) {
        await tx.invoiceTax.createMany({
          data: taxBreakdown.map((t) => ({
            invoiceId: created.id,
            taxType: t.taxType,
            ratePercent: t.ratePercent,
            taxableAmount: t.taxableAmount,
            taxAmount: t.taxAmount,
          })),
        });
      }

      return created;
    });

    await this.ordersService.setStatusFromDomain(
      organizationId,
      outletId,
      orderId,
      'BILLED',
      actorUserId,
    );

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'invoice.generated',
      entityType: 'Invoice',
      entityId: invoice.id,
      newState: { invoiceNumber: invoice.invoiceNumber, total: invoice.total.toString() },
    });

    const result = await this.getById(organizationId, invoice.id);
    await this.printersService.enqueueForType(outletId, 'RECEIPT', {
      invoiceNumber: result.invoiceNumber,
      orderNumber: order.orderNumber,
      items: result.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        total: i.total.toString(),
      })),
      subtotal: result.subtotal.toString(),
      taxes: result.taxes.map((t) => ({
        taxType: t.taxType,
        ratePercent: t.ratePercent.toString(),
        taxAmount: t.taxAmount.toString(),
      })),
      total: result.total.toString(),
    });

    return result;
  }

  async getById(organizationId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { organizationId, id },
      include: { items: true, taxes: true },
    });
    if (!invoice) throw new NotFoundDomainError('Invoice', id);
    return invoice;
  }

  async getByOrderId(organizationId: string, orderId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { organizationId, orderId },
      include: { items: true, taxes: true },
    });
    if (!invoice) throw new NotFoundDomainError('Invoice for order', orderId);
    return invoice;
  }
}
