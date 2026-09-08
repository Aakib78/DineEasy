import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { UnauthenticatedDomainError } from '../errors/domain-errors';
import { GuestSessionPayload } from './guest-session.type';

/**
 * Signs/verifies dining-session tokens with their own secret (QR_TOKEN_SECRET), deliberately
 * separate from the staff JWT secret (JWT_ACCESS_SECRET) — a leaked guest token (handed to
 * an anonymous browser tab on a customer's phone, inherently lower-trust) must never be
 * usable to forge a staff session, and vice versa.
 */
@Injectable()
export class GuestTokenService {
  private readonly secret: string;
  private static readonly TTL_SECONDS = 60 * 60 * 12; // 12h — comfortably covers one dining occasion

  constructor(config: ConfigService) {
    this.secret = config.get<string>('qr.tokenSecret')!;
  }

  sign(payload: GuestSessionPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: GuestTokenService.TTL_SECONDS });
  }

  verify(token: string): GuestSessionPayload {
    try {
      return jwt.verify(token, this.secret) as unknown as GuestSessionPayload;
    } catch {
      throw new UnauthenticatedDomainError(
        'Your session has expired — please scan the table QR code again.',
      );
    }
  }
}
