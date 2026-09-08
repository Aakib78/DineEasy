import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ReportRangeDto } from './dto/report-range.dto';

/** Orders that represent completed, revenue-bearing sales — everything else (in-flight, voided) is excluded. */
const SETTLED_STATUSES = ['PAID', 'COMPLETED'];

/**
 * Read-only reporting (spec §17). Every query here is a straightforward aggregate over
 * already-committed, already-audited data — reports never write anything, and (deliberately)
 * never re-derive a number some other domain service already computed and stored (e.g. an
 * order's `total`), to avoid a second, possibly-drifting implementation of the same math.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async salesSummary(organizationId: string, outletId: string, range: ReportRangeDto) {
    const { from, to } = resolveRange(range);

    const orders = await this.prisma.order.findMany({
      where: {
        organizationId,
        outletId,
        status: { in: SETTLED_STATUSES },
        createdAt: { gte: from, lte: to },
      },
      select: {
        subtotal: true,
        discountTotal: true,
        taxTotal: true,
        serviceChargeTotal: true,
        total: true,
        type: true,
      },
    });

    const sum = (
      field: 'subtotal' | 'discountTotal' | 'taxTotal' | 'serviceChargeTotal' | 'total',
    ) =>
      orders
        .reduce((acc, o) => acc.plus(o[field].toString()), new Decimal(0))
        .toDecimalPlaces(2)
        .toString();

    return {
      from,
      to,
      orderCount: orders.length,
      dineInCount: orders.filter((o) => o.type === 'DINE_IN').length,
      takeawayCount: orders.filter((o) => o.type === 'TAKEAWAY').length,
      subtotal: sum('subtotal'),
      discountTotal: sum('discountTotal'),
      taxTotal: sum('taxTotal'),
      serviceChargeTotal: sum('serviceChargeTotal'),
      revenue: sum('total'),
      averageOrderValue:
        orders.length > 0
          ? new Decimal(sum('total')).dividedBy(orders.length).toDecimalPlaces(2).toString()
          : '0',
    };
  }

  async topItems(organizationId: string, outletId: string, range: ReportRangeDto, limit = 10) {
    const { from, to } = resolveRange(range);

    const grouped = await this.prisma.orderItem.groupBy({
      by: ['menuItemId', 'nameSnapshot'],
      where: {
        isCancelled: false,
        order: {
          organizationId,
          outletId,
          status: { in: SETTLED_STATUSES },
          createdAt: { gte: from, lte: to },
        },
      },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    return grouped.map((g) => ({
      menuItemId: g.menuItemId,
      name: g.nameSnapshot,
      quantitySold: g._sum.quantity ?? 0,
      revenue: (g._sum.total ?? new Decimal(0)).toString(),
    }));
  }

  async paymentBreakdown(organizationId: string, outletId: string, range: ReportRangeDto) {
    const { from, to } = resolveRange(range);

    const grouped = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { organizationId, outletId, status: 'SUCCEEDED', createdAt: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    return grouped.map((g) => ({
      method: g.method,
      count: g._count._all,
      amount: (g._sum.amount ?? new Decimal(0)).toString(),
    }));
  }
}

function resolveRange(range: ReportRangeDto): { from: Date; to: Date } {
  const to = range.to ? new Date(range.to) : new Date();
  const from = range.from ? new Date(range.from) : startOfDay(to);
  return { from, to };
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
