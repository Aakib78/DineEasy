import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload, AuthenticatedUser } from '../types/authenticated-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.accessSecret')!,
    });
  }

  /** Runs after signature/expiry verification; return value becomes `request.user`. */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    return {
      userId: payload.sub,
      organizationId: payload.organizationId,
      activeOutletId: payload.activeOutletId,
      permissions: payload.permissions,
      name: payload.name,
      email: payload.email,
    };
  }
}
