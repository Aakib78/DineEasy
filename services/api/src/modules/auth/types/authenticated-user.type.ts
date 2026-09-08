/** The shape attached to `request.user` after JwtAuthGuard verifies an access token. */
export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  /** The outlet the client is currently operating against, if any (most staff routes need one). */
  activeOutletId?: string;
  /** Effective permission keys at token-issue time — see docs/authentication.md for the tradeoff. */
  permissions: string[];
  name: string;
  email: string;
}

/** JWT payload shape for the access token. */
export interface AccessTokenPayload {
  sub: string; // userId
  organizationId: string;
  activeOutletId?: string;
  permissions: string[];
  name: string;
  email: string;
}
