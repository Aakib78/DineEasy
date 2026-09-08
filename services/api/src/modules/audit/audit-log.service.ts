import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextStore } from '../../common/context/tenant-context';

export interface RecordAuditEntryInput {
  organizationId: string;
  outletId?: string;
  actorUserId?: string;
  /** e.g. "menu.price_changed", "order.cancelled", "staff.role_changed" — spec §23 examples. */
  action: string;
  entityType: string;
  entityId: string;
  previousState?: unknown;
  newState?: unknown;
  deviceInfo?: string;
  ipAddress?: string;
}

/**
 * Append-only audit trail for sensitive operations (spec §23). Distinct from OrderEvent
 * (docs/architecture.md §5), which is the order-domain-specific state-transition trail that
 * also drives KDS — AuditLog is the general-purpose "who changed what" record covering menu
 * prices, discounts, refunds, staff role changes, tax config changes, etc.
 *
 * Writing an audit entry NEVER throws into the caller's request — a failed audit write is
 * logged loudly (so it's not silently lost) but must not block the underlying business
 * operation it's recording, which has usually already committed by the time this runs.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: RecordAuditEntryInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          outletId: entry.outletId,
          actorUserId: entry.actorUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          previousState: toJsonInput(entry.previousState),
          newState: toJsonInput(entry.newState),
          deviceInfo: entry.deviceInfo,
          ipAddress: entry.ipAddress,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log for ${entry.action} on ${entry.entityType}:${entry.entityId}: ${(err as Error).message}`,
      );
    }
  }

  async listForOrganization(organizationId: string, limit = 100) {
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  /** Convenience: records using the current request's tenant context instead of passing IDs explicitly. */
  async recordForCurrentRequest(
    entry: Omit<RecordAuditEntryInput, 'organizationId' | 'outletId' | 'actorUserId'>,
  ): Promise<void> {
    const ctx = TenantContextStore.current;
    if (!ctx?.organizationId) {
      this.logger.warn(
        `recordForCurrentRequest called with no tenant context bound (${entry.action})`,
      );
      return;
    }
    await this.record({
      ...entry,
      organizationId: ctx.organizationId,
      outletId: ctx.outletId,
      actorUserId: ctx.userId,
    });
  }
}

function toJsonInput(value: unknown) {
  if (value === undefined) return undefined;
  // Prisma Decimal/Date instances need plain-JSON conversion before going into a Json column.
  return JSON.parse(JSON.stringify(value));
}
