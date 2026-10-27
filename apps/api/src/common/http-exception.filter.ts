import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Converts every error into a consistent JSON shape and never leaks internals:
 * unexpected errors are logged server-side and returned as a generic 500.
 */
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
      res.status(status).json({ statusCode: status, error: HttpStatus[status] ?? 'Error', ...payload });
      return;
    }
    const pgCode = (exception as { code?: string; cause?: { code?: string } })?.cause?.code ?? (exception as { code?: string })?.code;
    if (pgCode === '23505') {
      res.status(409).json({ statusCode: 409, error: 'Conflict', message: 'Resource already exists' });
      return;
    }
    if (pgCode === '23503' || pgCode === '23514' || pgCode === '22P02') {
      res.status(400).json({ statusCode: 400, error: 'Bad Request', message: 'Request violates a data constraint' });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ statusCode: 500, error: 'Internal Server Error', message: 'Something went wrong' });
  }
}
