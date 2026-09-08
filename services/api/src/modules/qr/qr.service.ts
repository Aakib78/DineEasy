import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextStore } from '../../common/context/tenant-context';
import { UnauthenticatedDomainError } from '../../common/errors/domain-errors';
import { DiningSessionsService } from '../dining-sessions/dining-sessions.service';
import { GuestTokenService } from '../../common/guest-auth/guest-token.service';
import { MenuService } from '../menu/menu.service';

/**
 * The entry point of the whole no-signup customer flow (spec §4/§6/§12) — see
 * docs/qr-ordering.md for the end-to-end sequence diagram.
 */
@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diningSessionsService: DiningSessionsService,
    private readonly guestTokenService: GuestTokenService,
    private readonly menuService: MenuService,
  ) {}

  /**
   * A diner scans the table's printed QR, the browser hits this with the opaque token
   * embedded in the QR URL, and gets back a dining-session bearer token plus enough context
   * to render the ordering UI immediately — no signup, no app install (spec §4). This is the
   * one legitimate "pre-tenant" lookup in the whole system: we don't know the organization/
   * outlet until we've resolved the token, so the token IS the tenant lookup — hence
   * `runUnscoped`. Everything downstream of it (dining session, menu) is looked up with an
   * explicit organizationId/outletId filter, never relying on ambient tenant context.
   */
  async resolveTokenAndJoinSession(token: string) {
    const qrCode = await TenantContextStore.runUnscoped(() =>
      this.prisma.tableQrCode.findFirst({
        where: { token, isActive: true },
        include: { table: { include: { outlet: true, floor: true } } },
      }),
    );

    if (!qrCode || !qrCode.table.outlet.isActive) {
      throw new UnauthenticatedDomainError(
        'This QR code is no longer valid — please ask staff for help.',
      );
    }

    const { table } = qrCode;
    const session = await this.diningSessionsService.findOrCreateOpenSession(
      table.outlet.organizationId,
      table.outletId,
      table.id,
    );

    // Each browser tab/device that scans (or re-scans) the same table QR gets its own
    // guestToken, so multiple diners at one table each hold their own session token without
    // colliding, and without any of them needing an account — see docs/architecture.md §6.
    const guestToken = nanoid(16);

    const sessionToken = this.guestTokenService.sign({
      diningSessionId: session.id,
      organizationId: table.outlet.organizationId,
      outletId: table.outletId,
      tableId: table.id,
      guestToken,
    });

    return {
      sessionToken,
      diningSessionId: session.id,
      guestToken,
      table: { id: table.id, name: table.name, floorName: table.floor.name },
      outletName: table.outlet.name,
    };
  }

  /** Customer-facing menu for the dining session's outlet — active items only (spec §12). */
  async getMenuForSession(outletId: string) {
    return this.menuService.getPublicTree(outletId);
  }
}
