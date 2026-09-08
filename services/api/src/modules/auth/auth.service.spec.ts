import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UnauthenticatedDomainError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { RolesService } from '../roles/roles.service';

/**
 * Unit tests against mocked Prisma/JWT/Roles collaborators — no real database needed.
 * Full integration coverage (real Postgres, real transaction behavior for register())
 * belongs in test/auth.e2e-spec.ts once the e2e harness lands (docs/architecture.md §15) —
 * this suite focuses on AuthService's own decision logic: credential matching, error
 * shapes, and the active-outlet resolution heuristic.
 */
describe('AuthService', () => {
  let prisma: any;
  let jwt: any;
  let config: any;
  let rolesService: any;
  let authService: AuthService;

  const hashedPassword = argon2.hash;

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn(), updateMany: jest.fn() },
      userRole: { findMany: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    jwt = { sign: jest.fn(() => 'signed.jwt.token') };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'auth.accessTtl': '15m',
          'auth.refreshTtl': '30d',
        };
        return values[key];
      }),
    };
    rolesService = {
      getEffectivePermissions: jest.fn().mockResolvedValue(['orders.view']),
      seedSystemRolesForOrganization: jest.fn(),
    };

    authService = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      rolesService as unknown as RolesService,
    );
  });

  describe('login', () => {
    it('throws UnauthenticatedDomainError when no user matches the email', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(
        authService.login({ email: 'nobody@test.com', password: 'whatever123' }),
      ).rejects.toThrow(UnauthenticatedDomainError);
    });

    it('throws UnauthenticatedDomainError when the password does not match', async () => {
      const passwordHash = await hashedPassword('correct-password');
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          organizationId: 'org-1',
          email: 'owner@test.com',
          name: 'Owner',
          passwordHash,
        },
      ]);
      prisma.userRole.findMany.mockResolvedValue([]);

      await expect(
        authService.login({ email: 'owner@test.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthenticatedDomainError);
    });

    it('issues a token pair on matching credentials and records lastLoginAt', async () => {
      const passwordHash = await hashedPassword('correct-password');
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          organizationId: 'org-1',
          email: 'owner@test.com',
          name: 'Owner',
          passwordHash,
        },
      ]);
      prisma.userRole.findMany.mockResolvedValue([]); // no outlet-scoped roles -> activeOutletId undefined

      const result = await authService.login({
        email: 'owner@test.com',
        password: 'correct-password',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.expiresIn).toBe(15 * 60);
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1', organizationId: 'org-1' } }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('checks candidates from multiple organizations sharing an email and matches the right one', async () => {
      const wrongOrgHash = await hashedPassword('org-a-password');
      const rightOrgHash = await hashedPassword('org-b-password');
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-a',
          organizationId: 'org-a',
          email: 'shared@test.com',
          name: 'A',
          passwordHash: wrongOrgHash,
        },
        {
          id: 'user-b',
          organizationId: 'org-b',
          email: 'shared@test.com',
          name: 'B',
          passwordHash: rightOrgHash,
        },
      ]);
      prisma.userRole.findMany.mockResolvedValue([]);

      const result = await authService.login({
        email: 'shared@test.com',
        password: 'org-b-password',
      });

      expect(result.accessToken).toBeDefined();
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-b', organizationId: 'org-b' } }),
      );
    });
  });

  describe('active outlet resolution', () => {
    it('leaves activeOutletId undefined when the user has an org-wide role only', async () => {
      const passwordHash = await hashedPassword('pw');
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'owner-1',
          organizationId: 'org-1',
          email: 'owner@test.com',
          name: 'Owner',
          passwordHash,
        },
      ]);
      prisma.userRole.findMany.mockResolvedValue([]); // Owner's role has outletId: null, filtered out by the query

      await authService.login({ email: 'owner@test.com', password: 'pw' });

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ activeOutletId: undefined }),
        expect.anything(),
      );
    });

    it('sets activeOutletId when the user has exactly one outlet-scoped role', async () => {
      const passwordHash = await hashedPassword('pw');
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'cashier-1',
          organizationId: 'org-1',
          email: 'cashier@test.com',
          name: 'Cashier',
          passwordHash,
        },
      ]);
      prisma.userRole.findMany.mockResolvedValue([{ outletId: 'outlet-1' }]);

      await authService.login({ email: 'cashier@test.com', password: 'pw' });

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ activeOutletId: 'outlet-1' }),
        expect.anything(),
      );
    });
  });
});
