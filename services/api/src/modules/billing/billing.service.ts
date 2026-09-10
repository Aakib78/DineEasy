import { Injectable } from '@nestjs/common';
import { TaxType } from '@prisma/client';
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
            // `invoice-tax.util.ts` is a pure-logic file with no Prisma dependency (so it
            // stays unit-testable without a generated client — see its header comment), so
            // `t.taxType` is a plain string there. Prisma's generated `TaxType` enum is
            // structurally the same set of literals; this cast is the boundary between the
            // two, same pattern as `OrderStatus` casts elsewhere (order-state-machine.ts).
            taxType: t.taxType as TaxType,
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
    const outlet = await this.prisma.outlet.findFirst({ where: { id: outletId, organizationId } });
    await this.printersService.enqueueForType(
      outletId,
      'RECEIPT',
      this.buildReceiptPayload(order.orderNumber, result, outlet),
    );

    return result;
  }

  /**
   * Re-enqueues the same RECEIPT print job `generateInvoice` sends automatically — for a
   * printer that was off/out of paper/never configured yet at the moment the bill was first
   * generated, or simply because the customer wants a second copy. `generateInvoice` itself is
   * idempotent (see its early-return above) and deliberately does *not* re-print on a repeat
   * call, so without this method there would be no way to get a receipt out of the printer
   * after the first attempt failed — this is that explicit, staff-initiated escape hatch.
   *
   * Scoped by invoice ID alone rather than the caller's active outlet (like `getById`/
   * `getByOrderId` below) — the invoice's own `outletId` is what the print job is enqueued
   * against, not whatever outlet the requesting staff member happens to be signed into.
   */
  async printInvoice(organizationId: string, invoiceId: string, actorUserId: string) {
    const invoice = await this.getById(organizationId, invoiceId);
    const order = await this.ordersService.getById(
      organizationId,
      invoice.outletId,
      invoice.orderId,
    );
    // Scoped by the invoice's own outlet, same reasoning as the doc comment above — not the
    // caller's active outlet.
    const outlet = await this.prisma.outlet.findFirst({
      where: { id: invoice.outletId, organizationId },
    });

    await this.printersService.enqueueForType(
      invoice.outletId,
      'RECEIPT',
      this.buildReceiptPayload(order.orderNumber, invoice, outlet),
    );

    await this.auditLog.record({
      organizationId,
      outletId: invoice.outletId,
      actorUserId,
      action: 'invoice.print_requested',
      entityType: 'Invoice',
      entityId: invoice.id,
      newState: { invoiceNumber: invoice.invoiceNumber },
    });

    return { queued: true };
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

  /**
   * The RECEIPT print-agent payload shape (see `services/print-agent/src/escpos.ts`'s
   * `buildReceiptTicket`) — shared between the automatic print-on-generate above and the
   * explicit `printInvoice` reprint so the two can never drift into producing different-looking
   * tickets for the same invoice.
   *
   * `outlet` is nullable and every field on it it optional on the schema — this deliberately
   * degrades to the pre-existing payload shape (no outlet fields at all) rather than throwing,
   * both callers already re-fetch the outlet in a separate query rather than trust anything
   * cached, and a still-legal-but-incomplete `Outlet` row (name set, GSTIN never filled in) must
   * still produce a printable ticket, just without that one line — see `escpos.ts`'s
   * `ReceiptTicketPayload` doc comment for how the print agent renders an absent field.
   */
  private buildReceiptPayload(
    orderNumber: string,
    invoice: {
      invoiceNumber: string;
      items: { description: string; quantity: number; total: { toString(): string } }[];
      subtotal: { toString(): string };
      taxes: {
        taxType: string;
        ratePercent: { toString(): string };
        taxAmount: { toString(): string };
      }[];
      total: { toString(): string };
    },
    outlet: {
      name: string;
      phone: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
      state: string | null;
      pincode: string | null;
      gstin: string | null;
      fssaiLicense: string | null;
    } | null,
  ): Record<string, unknown> {
    return {
      invoiceNumber: invoice.invoiceNumber,
      orderNumber,
      items: invoice.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        total: i.total.toString(),
      })),
      subtotal: invoice.subtotal.toString(),
      taxes: invoice.taxes.map((t) => ({
        taxType: t.taxType,
        ratePercent: t.ratePercent.toString(),
        taxAmount: t.taxAmount.toString(),
      })),
      total: invoice.total.toString(),
      outletName: outlet?.name,
      outletAddress: outlet ? this.composeAddress(outlet) : undefined,
      outletPhone: outlet?.phone,
      gstin: outlet?.gstin,
      fssaiLicense: outlet?.fssaiLicense,
    };
  }

  /** Joins whichever of `Outlet`'s address fields are actually set (all optional on the schema)
   * into one printable line — `null`/empty pieces are dropped rather than leaving stray ", ,"
   * gaps, and the whole thing is `undefined` (not an empty string) when nothing is set, so
   * `escpos.ts`'s "omit the line entirely when absent" rendering applies cleanly. */
  private composeAddress(outlet: {
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  }): string | undefined {
    const parts = [
      outlet.addressLine1,
      outlet.addressLine2,
      outlet.city,
      outlet.state,
      outlet.pincode,
    ].filter((p): p is string => Boolean(p && p.trim()));
    return parts.length > 0 ? parts.join(', ') : undefined;
  }
}
