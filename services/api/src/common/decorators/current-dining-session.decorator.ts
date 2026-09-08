import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GuestSessionPayload } from '../guest-auth/guest-session.type';

export const CurrentDiningSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): GuestSessionPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.diningSession;
  },
);
