import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { nanoid } from 'nanoid';

/**
 * Ensures every request has an `x-request-id`, generating one if the client didn't send it.
 * Threaded through logs and error responses (docs/architecture.md §12).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const existing = req.headers['x-request-id'];
    const requestId = (Array.isArray(existing) ? existing[0] : existing) || nanoid();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
