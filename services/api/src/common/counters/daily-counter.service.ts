import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type CounterType = 'ORDER' | 'KOT' | 'INVOICE';

const PREFIX: Record<CounterType, string> = {
  ORDER: 'ORD',
  KOT: 'KOT',
  INVOICE: 'INV',
};

/**
 * Issues sequential, human-readable, per-outlet-per-day numbers for orders/KOTs/invoices
 * (spec §31 "orderNumber/kotNumber/invoiceNumber must be sequential and gap-free within a
 * business day, not a raw UUID"). Must always be called with the caller's transaction client
 * so the increment commits atomically with the row it numbers — a rolled-back order never
 * leaves a gap-causing counter bump behind.
 *
 * Concurrency: `upsert` on Postgres compiles to a single `INSERT ... ON CONFLICT DO UPDATE
 * ... RETURNING`, which is atomic at the database level — two concurrent transactions
 * incrementing the same (outletId, type, date) counter serialize on that row's lock rather
 * than racing to read-then-write, so two orders can never receive the same number.
 *
 * v1 simplification: "today" is computed from server UTC, not the outlet's own timezone
 * (`Outlet.timezone`, default Asia/Kolkata). For a single-timezone India launch this only
 * matters within the ~5.5h UTC offset window around local midnight, where a very late-night
 * order could be numbered under the following day. Documented here rather than silently
 * assumed correct — see docs/database.md.
 */
@Injectable()
export class DailyCounterService {
  async next(tx: Prisma.TransactionClient, outletId: string, type: CounterType): Promise<string> {
    const date = todayDateOnly();

    const counter = await tx.outletDailyCounter.upsert({
      where: { outletId_type_date: { outletId, type, date } },
      create: { outletId, type, date, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });

    return formatNumber(type, date, counter.lastValue);
  }
}

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatNumber(type: CounterType, date: Date, seq: number): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${PREFIX[type]}-${y}${m}${d}-${String(seq).padStart(4, '0')}`;
}
