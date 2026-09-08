import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '../errors/domain-errors';

/**
 * Global exception filter. Maps DomainError subclasses (thrown by services) and Nest's
 * built-in HttpException (thrown by guards/pipes) to one consistent JSON error shape.
 * See docs/api.md §Errors.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) ?? 'unknown';

    if (exception instanceof DomainError) {
      response.status(exception.httpStatus).json({
        statusCode: exception.httpStatus,
        error: exception.code,
        message: exception.message,
        requestId,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as Record<string, unknown>).message ?? exception.message);
      response.status(status).json({
        statusCode: status,
        error: exception.name.replace(/Exception$/, ''),
        message,
        requestId,
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception, requestId);
    response.status(500).json({
      statusCode: 500,
      error: 'InternalServerError',
      message: 'Something went wrong. Please try again.',
      requestId,
    });
  }
}
