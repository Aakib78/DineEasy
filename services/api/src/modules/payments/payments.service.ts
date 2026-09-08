import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import Decimal from 'decimal.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextStore } from '../../common/context/tenant-context';
import { NotFoundDomainError, ValidationDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { OrdersService } from '../orders/orders.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { InitiateRefundDto } from './dto/initiate-refund.dto';
import { ProviderWebhookDto } from './dto/provider-webhook.dto';
import {
  sumSucceededPayments,
  evaluatePaymentAttempt,
  determinePaymentStatusAfterRefund,
} from './payment-math.util';

/**
 * Payments (spec §10). The `Payment`/`PaymentTransaction`/`Refund` schema is provider-
 * independent by design, but v1's actual settlement for cash/UPI/card is staff-confirmed at
 * the counter (`recordPayment`) — see ProviderWebhookDto's doc comment for why. A single
 * order can be paid across multiple `recordPayment` calls (split payment, e.g. one guest
 * pays cash for their share and another pays UPI); the order only advances past BILLED once
 * the sum of SUCCEEDED payments covers the total.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly ordersService: OrdersService,
  ) {}

  async recordPayment(
    organizationId: string,
    outletId: string,
    orderId: string,
    dto: RecordPaymentDto,
    actorUserId: string,
  ) {
    const order = await this.ordersService.getById(organizationId, outletId, orderId);
    if (!['BILLED', 'PAID'].includes(order.status)) {
      throw new ValidationDomainError(
        `Cannot take a payment on an order that is ${order.status} — bill it first.`,
      );
    }

    const alreadyPaid = sumSucceededPayments(order.payments);
    const evaluation = evaluatePaymentAttempt({
      orderTotal: order.total.toString(),
      alreadyPaid,
      attemptedAmount: dto.amount.toString(),
    });
    if (evaluation.alreadyFullyPaid) {
      throw new ValidationDomainError('This order is already fully paid.');
    }
    if (evaluation.exceedsRemaining) {
      throw new ValidationDomainError(
        `Payment of ₹${dto.amount} exceeds the remaining balance of ₹${evaluation.remaining}.`,
      );
    }

    const amount = new Decimal(dto.amount);

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          organizationId,
          outletId,
          orderId,
          method: dto.method,
          status: 'SUCCEEDED',
          amount: amount.toString(),
          providerName: 'manual',
          initiatedByUserId: actorUserId,
        },
      });
      await tx.paymentTransaction.create({
        data: {
          paymentId: created.id,
          provider: 'manual',
          providerEventId: nanoid(),
          type: 'charge',
          status: 'succeeded',
        },
      });
      return created;
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'payment.recorded',
      entityType: 'Payment',
      entityId: payment.id,
      newState: { method: dto.method, amount: amount.toString() },
    });

    if (evaluation.fullySettlesOrder) {
      await this.settleOrder(organizationId, outletId, orderId, actorUserId);
    }

    return payment;
  }

  /**
   * The idempotent webhook entry point a real gateway would call. `PaymentTransaction`'s
   * unique `(provider, providerEventId)` constraint means a retried/duplicate delivery is a
   * silent no-op rather than double-applying a payment (spec §10). Runs `runUnscoped`
   * because — like QR token resolution — we don't know the tenant until we've looked up the
   * payment the event refers to; the event's `paymentId` IS the tenant lookup.
   */
  async handleProviderWebhook(provider: string, dto: ProviderWebhookDto) {
    return TenantContextStore.runUnscoped(async () => {
      try {
        await this.prisma.paymentTransaction.create({
          data: {
            paymentId: dto.paymentId,
            provider,
            providerEventId: dto.providerEventId,
            type: 'webhook',
            status: dto.status.toLowerCase(),
            rawPayload: dto.rawPayload,
          },
        });
      } catch (err) {
        if (isUniqueConstraintViolation(err)) return { deduplicated: true };
        throw err;
      }

      const payment = await this.prisma.payment.findFirst({ where: { id: dto.paymentId } });
      if (!payment) throw new NotFoundDomainError('Payment', dto.paymentId);

      await this.prisma.payment.updateMany({
        where: { id: dto.paymentId, organizationId: payment.organizationId },
        data: { status: dto.status, providerName: provider },
      });

      if (dto.status === 'SUCCEEDED') {
        const order = await this.ordersService.getById(
          payment.organizationId,
          payment.outletId,
          payment.orderId,
        );
        // order.payments already reflects this payment as SUCCEEDED (the updateMany above
        // committed before this fetch) — summing it is the full picture on its own. A
        // previous version of this line added `payment.amount` a second time on top of that
        // sum, double-counting this payment and risking settling the order (PAID → COMPLETED)
        // before it was actually fully paid. Currently dormant in practice (v1 has no real
        // payment gateway wired up to call this webhook — see this method's doc comment) but a
        // real bug in the logic itself, caught while extracting this into `payment-math.util.ts`.
        const paid = new Decimal(sumSucceededPayments(order.payments));
        if (paid.gte(new Decimal(order.total.toString()))) {
          await this.settleOrder(
            payment.organizationId,
            payment.outletId,
            payment.orderId,
            undefined,
          );
        }
      }

      return { deduplicated: false };
    });
  }

  async listForOrder(organizationId: string, outletId: string, orderId: string) {
    return this.prisma.payment.findMany({
      where: { organizationId, outletId, orderId },
      include: { refunds: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---------------------------------------------------------------------
  // Refunds
  // ---------------------------------------------------------------------

  async initiateRefund(
    organizationId: string,
    outletId: string,
    paymentId: string,
    dto: InitiateRefundDto,
    actorUserId: string,
  ) {
    const payment = await this.getPaymentOrThrow(organizationId, outletId, paymentId);
    if (!['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
      throw new ValidationDomainError(`Cannot refund a payment that is ${payment.status}.`);
    }

    const refund = await this.prisma.refund.create({
      data: {
        paymentId,
        amount: dto.amount.toString(),
        reason: dto.reason,
        initiatedByUserId: actorUserId,
      },
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'refund.initiated',
      entityType: 'Refund',
      entityId: refund.id,
      newState: dto,
    });

    return refund;
  }

  /**
   * v1 has no real payment gateway settlement step for a refund (see ProviderWebhookDto) —
   * "approve" and "process" collapse into one manager action: they confirm the cash/UPI/card
   * refund was handed back at the counter, and the record updates immediately.
   */
  async approveRefund(
    organizationId: string,
    outletId: string,
    refundId: string,
    actorUserId: string,
  ) {
    const refund = await this.prisma.refund.findFirst({
      where: { id: refundId, payment: { organizationId, outletId } },
      include: { payment: true },
    });
    if (!refund) throw new NotFoundDomainError('Refund', refundId);
    if (refund.status !== 'PENDING')
      throw new ValidationDomainError(`Refund is already ${refund.status}.`);

    await this.prisma.$transaction(async (tx) => {
      await tx.refund.updateMany({
        where: { id: refundId },
        data: { status: 'PROCESSED', approvedByUserId: actorUserId },
      });

      // allRefunds already includes *this* refund (the updateMany above committed it as
      // PROCESSED before this fetch) — summing it is the whole picture on its own. A previous
      // version of this seeded the reduce with `refund.amount` on top of that sum, double-
      // counting this refund and risking flipping a payment to REFUNDED while genuinely only
      // partially refunded — the same double-counting shape as the bug fixed in
      // `handleProviderWebhook` above, caught the same way (extracting this into
      // `payment-math.util.ts` and noticing the aggregate already had the update baked in).
      const allRefunds = await tx.refund.findMany({
        where: { paymentId: refund.paymentId, status: 'PROCESSED' },
      });
      const totalRefunded = allRefunds.reduce(
        (sum: Decimal, r: { amount: { toString(): string } }) => sum.plus(r.amount.toString()),
        new Decimal(0),
      );
      const newStatus = determinePaymentStatusAfterRefund(
        refund.payment.amount.toString(),
        totalRefunded.toString(),
      );
      await tx.payment.updateMany({
        where: { id: refund.paymentId, organizationId },
        data: { status: newStatus },
      });
    });

    const order = await this.ordersService.getById(
      organizationId,
      outletId,
      refund.payment.orderId,
    );
    if (['PAID', 'COMPLETED'].includes(order.status)) {
      await this.ordersService.setStatusFromDomain(
        organizationId,
        outletId,
        refund.payment.orderId,
        'REFUNDED',
        actorUserId,
      );
    }

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'refund.approved',
      entityType: 'Refund',
      entityId: refundId,
    });

    return this.prisma.refund.findFirst({ where: { id: refundId } });
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  /**
   * PAID then immediately COMPLETED — v1 has no separate "mark completed" staff action once
   * fully paid. Routes through `setStatusFromSystem` (actorType SYSTEM) when settlement was
   * triggered by the provider webhook rather than a staff action, so OrderEvent's audit
   * trail doesn't misattribute an automated settlement to a specific person.
   */
  private async settleOrder(
    organizationId: string,
    outletId: string,
    orderId: string,
    actorUserId: string | undefined,
  ) {
    if (actorUserId) {
      await this.ordersService.setStatusFromDomain(
        organizationId,
        outletId,
        orderId,
        'PAID',
        actorUserId,
      );
      await this.ordersService.setStatusFromDomain(
        organizationId,
        outletId,
        orderId,
        'COMPLETED',
        actorUserId,
      );
    } else {
      await this.ordersService.setStatusFromSystem(organizationId, outletId, orderId, 'PAID');
      await this.ordersService.setStatusFromSystem(organizationId, outletId, orderId, 'COMPLETED');
    }
  }

  private async getPaymentOrThrow(organizationId: string, outletId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { organizationId, outletId, id },
    });
    if (!payment) throw new NotFoundDomainError('Payment', id);
    return payment;
  }
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
