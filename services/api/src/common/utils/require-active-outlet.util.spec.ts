import { requireActiveOutlet } from './require-active-outlet.util';
import { ValidationDomainError } from '../errors/domain-errors';
import { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    permissions: [],
    name: 'Test User',
    email: 'test@example.com',
    ...overrides,
  };
}

describe('requireActiveOutlet', () => {
  it('returns the active outlet id when one is set', () => {
    const user = makeUser({ activeOutletId: 'outlet-1' });
    expect(requireActiveOutlet(user)).toBe('outlet-1');
  });

  it('throws a ValidationDomainError when there is no active outlet', () => {
    const user = makeUser({ activeOutletId: undefined });
    expect(() => requireActiveOutlet(user)).toThrow(ValidationDomainError);
  });

  it('throws with a 400-mapped, actionable message rather than letting undefined through', () => {
    const user = makeUser({ activeOutletId: undefined });
    try {
      requireActiveOutlet(user);
      fail('expected requireActiveOutlet to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationDomainError);
      const domainErr = err as ValidationDomainError;
      expect(domainErr.httpStatus).toBe(400);
      expect(domainErr.code).toBe('ValidationError');
      expect(domainErr.message).toMatch(/active outlet/i);
    }
  });

  it('treats an empty string activeOutletId the same as missing (falsy check, not just undefined)', () => {
    // activeOutletId is typed as string | undefined, but this guards the runtime falsy case too
    // (e.g. a client accidentally sending "") rather than only checking `=== undefined`.
    const user = makeUser({ activeOutletId: '' as unknown as undefined });
    expect(() => requireActiveOutlet(user)).toThrow(ValidationDomainError);
  });
});
