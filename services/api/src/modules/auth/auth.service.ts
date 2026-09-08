import { randomBytes, createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextStore } from '../../common/context/tenant-context';
import { parseDurationToMs } from '../../common/utils/duration.util';
import { UnauthenticatedDomainError, ConflictDomainError } from '../../common/errors/domain-errors';
import { RolesService } from '../roles/roles.service';
import { SYSTEM_ROLES } from '../../common/rbac/permissions.catalog';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { LoginDto } from './dto/login.dto';
import { AccessTokenPayload } from './types/authenticated-user.type';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds, for client convenience
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rolesService: RolesService,
  ) {}

  /**
   * spec §68 step 1: "Restaurant owner creates account" + "Creates restaurant". Creates the
   * Organization, seeds system roles/permissions, creates the Owner user, and assigns them
   * the org-wide Owner role — all in one transaction so a failure partway never leaves an
   * organization with no usable owner account.
   */
  async register(dto: RegisterOrganizationDto): Promise<TokenPair> {
    const passwordHash = await argon2.hash(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: dto.organizationName, phone: dto.phone },
      });

      const roleIdByName = await this.rolesService.seedSystemRolesForOrganization(
        organization.id,
        tx,
      );

      const owner = await tx.user.create({
        data: {
          organizationId: organization.id,
          name: dto.ownerName,
          email: dto.ownerEmail.toLowerCase(),
          passwordHash,
        },
      });

      await tx.userRole.create({
        data: { userId: owner.id, roleId: roleIdByName[SYSTEM_ROLES.OWNER], outletId: null },
      });

      return { organization, owner };
    });

    this.logger.log(`Registered organization ${result.organization.id} (owner ${result.owner.id})`);

    return this.issueTokenPair({
      userId: result.owner.id,
      organizationId: result.organization.id,
      name: result.owner.name,
      email: result.owner.email,
    });
  }

  /**
   * Login is deliberately org-agnostic from the client's point of view — a staff member
   * just enters their email + password. Since `email` is only unique *per organization*
   * (schema.prisma), we look across all organizations for a matching user. This is the one
   * legitimate reason to bypass the tenant guard for a User read: we don't know the tenant
   * yet, that's exactly what login resolves. See TenantContextStore.runUnscoped's contract.
   */
  async login(dto: LoginDto): Promise<TokenPair> {
    const candidates = await TenantContextStore.runUnscoped(() =>
      this.prisma.user.findMany({ where: { email: dto.email.toLowerCase(), status: 'ACTIVE' } }),
    );

    for (const candidate of candidates) {
      const passwordMatches = await argon2
        .verify(candidate.passwordHash, dto.password)
        .catch(() => false);
      if (!passwordMatches) continue;

      await this.prisma.user.updateMany({
        where: { id: candidate.id, organizationId: candidate.organizationId },
        data: { lastLoginAt: new Date() },
      });

      return this.issueTokenPair(
        {
          userId: candidate.id,
          organizationId: candidate.organizationId,
          name: candidate.name,
          email: candidate.email,
        },
        dto.deviceInfo,
      );
    }

    // Deliberately identical error for "no such email" and "wrong password" — do not leak
    // which one it was.
    throw new UnauthenticatedDomainError('Invalid email or password');
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashRefreshToken(refreshToken);

    const stored = await TenantContextStore.runUnscoped(() =>
      this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } }),
    );

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthenticatedDomainError('Refresh token is invalid or expired');
    }

    // Rotate: revoke the used token and issue a fresh pair, so a stolen-but-already-used
    // refresh token is a dead end (spec §21's "refresh token rotation where appropriate").
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(
      {
        userId: stored.user.id,
        organizationId: stored.user.organizationId,
        name: stored.user.name,
        email: stored.user.email,
      },
      stored.deviceInfo ?? undefined,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    await TenantContextStore.runUnscoped(() =>
      this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  private async issueTokenPair(
    user: { userId: string; organizationId: string; name: string; email: string },
    deviceInfo?: string,
  ): Promise<TokenPair> {
    const activeOutletId = await this.resolveActiveOutlet(user.userId);
    const permissions = await this.rolesService.getEffectivePermissions(
      user.userId,
      activeOutletId,
    );

    const payload: AccessTokenPayload = {
      sub: user.userId,
      organizationId: user.organizationId,
      activeOutletId,
      permissions,
      name: user.name,
      email: user.email,
    };

    const accessTtl = this.config.get<string>('auth.accessTtl')!;
    const accessToken = this.jwt.sign(payload, { expiresIn: accessTtl });

    const rawRefreshToken = randomBytes(48).toString('base64url');
    const refreshTtlMs = parseDurationToMs(this.config.get<string>('auth.refreshTtl')!);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.userId,
        tokenHash: this.hashRefreshToken(rawRefreshToken),
        deviceInfo,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: Math.floor(parseDurationToMs(accessTtl) / 1000),
    };
  }

  /**
   * v1 heuristic: a user with an org-wide role (outletId null, e.g. Owner) has no single
   * "active outlet" — they pick one client-side when multi-outlet support ships (spec §20).
   * A user with exactly one outlet-scoped role assignment (the common case for Manager/
   * Cashier/Waiter/Kitchen in a single-outlet v1 restaurant) is scoped to that outlet
   * automatically so they don't have to select one every login.
   */
  private async resolveActiveOutlet(userId: string): Promise<string | undefined> {
    const outletRoles = await this.prisma.userRole.findMany({
      where: { userId, outletId: { not: null } },
      select: { outletId: true },
      distinct: ['outletId'],
    });
    if (outletRoles.length === 1) return outletRoles[0].outletId ?? undefined;
    return undefined;
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async assertEmailAvailable(organizationId: string, email: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { organizationId, email: email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictDomainError(
        `A staff account with email ${email} already exists in this organization`,
      );
    }
  }
}
