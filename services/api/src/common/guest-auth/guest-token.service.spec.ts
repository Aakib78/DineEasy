import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { GuestTokenService } from './guest-token.service';
import { UnauthenticatedDomainError } from '../errors/domain-errors';
import { GuestSessionPayload } from './guest-session.type';

/**
 * `GuestTokenService` has no Prisma dependency at all — just `jsonwebtoken` and a config
 * lookup — so unlike most of this backend it's fully runnable in this sandbox, and yet had
 * never had a test of its own despite being the entire trust boundary for the no-signup guest
 * ordering flow (spec §4/§12): every `/qr/*` request's tenant scoping (organizationId/
 * outletId/diningSessionId) comes from what this file decodes out of the bearer token, nothing
 * else re-derives or re-checks it downstream (see QrService.resolveTokenAndJoinSession's doc
 * comment on why that lookup is the one deliberate "pre-tenant" exception). A forgeable or
 * loosely-verified guest token is a cross-tenant data leak, not just an inconvenience — worth
 * the same scrutiny `payment-math.util.spec.ts`/`invoice-tax.util.spec.ts` gave money math.
 */
function makeService(secret = 'test-secret'): GuestTokenService {
  const fakeConfig = { get: () => secret } as unknown as ConfigService;
  return new GuestTokenService(fakeConfig);
}

const payload: GuestSessionPayload = {
  diningSessionId: 'session-1',
  organizationId: 'org-1',
  outletId: 'outlet-1',
  tableId: 'table-1',
  guestToken: 'guest-abc',
};

describe('GuestTokenService', () => {
  describe('sign + verify round trip', () => {
    it('verify() returns exactly what was signed', () => {
      const service = makeService();
      const token = service.sign(payload);
      const decoded = service.verify(token);
      expect(decoded.diningSessionId).toBe(payload.diningSessionId);
      expect(decoded.organizationId).toBe(payload.organizationId);
      expect(decoded.outletId).toBe(payload.outletId);
      expect(decoded.tableId).toBe(payload.tableId);
      expect(decoded.guestToken).toBe(payload.guestToken);
    });

    it('embeds a 12h expiry, not an unbounded token', () => {
      const service = makeService();
      const token = service.sign(payload);
      const decoded = jwt.decode(token) as { iat: number; exp: number };
      expect(decoded.exp - decoded.iat).toBe(60 * 60 * 12);
    });
  });

  describe('verify() rejection paths — every one must fail closed as UnauthenticatedDomainError', () => {
    it('rejects a garbage string', () => {
      const service = makeService();
      expect(() => service.verify('not-a-real-token')).toThrow(UnauthenticatedDomainError);
    });

    it('rejects a token signed with a different secret (a forged or misconfigured token)', () => {
      const issuer = makeService('secret-a');
      const verifier = makeService('secret-b');
      const token = issuer.sign(payload);
      expect(() => verifier.verify(token)).toThrow(UnauthenticatedDomainError);
    });

    it('rejects an expired token rather than trusting stale claims', () => {
      const service = makeService();
      const expiredToken = jwt.sign(payload, 'test-secret', { expiresIn: -10 });
      expect(() => service.verify(expiredToken)).toThrow(UnauthenticatedDomainError);
    });

    it('rejects a token whose payload was tampered with after signing', () => {
      const service = makeService();
      const token = service.sign(payload);
      const [header, , signature] = token.split('.');
      const tamperedPayload = { ...payload, outletId: 'a-different-outlet' };
      const tamperedBody = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
      const tamperedToken = `${header}.${tamperedBody}.${signature}`;
      expect(() => service.verify(tamperedToken)).toThrow(UnauthenticatedDomainError);
    });

    it('maps every rejection to a 401 with the "Unauthenticated" domain error code', () => {
      const service = makeService();
      try {
        service.verify('garbage');
        fail('expected verify() to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthenticatedDomainError);
        expect((err as UnauthenticatedDomainError).httpStatus).toBe(401);
        expect((err as UnauthenticatedDomainError).code).toBe('Unauthenticated');
      }
    });

    it('gives a guest-facing message pointing at rescanning, not a raw JWT error', () => {
      const service = makeService();
      try {
        service.verify('garbage');
        fail('expected verify() to throw');
      } catch (err) {
        expect((err as Error).message).toMatch(/scan the table QR code again/);
      }
    });
  });
});
