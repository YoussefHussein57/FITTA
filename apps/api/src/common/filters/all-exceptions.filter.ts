import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CommonErrorCode, type ErrorEnvelope } from '@fitta/contracts';
import { type Request, type Response } from 'express';

/**
 * Maps every thrown value to the single error envelope in
 * docs/API_CONTRACTS.md §1.
 *
 * Two rules it exists to enforce:
 *
 *  1. **Nothing internal escapes.** An unrecognised exception becomes a generic
 *     500 with a stable code. Stack traces, driver messages, and query text are
 *     logged server-side and never sent to the client (docs/SECURITY.md §4).
 *
 *  2. **Every response carries a `requestId`.** The client sees an opaque id; the
 *     server log holds the detail. That is what makes "something broke, here is
 *     the id" a supportable answer without leaking anything.
 */
/**
 * Status → stable error code.
 *
 * A lookup rather than a `switch`: the keys are computed from `HttpStatus`, so
 * the mapping stays self-documenting without ever *comparing* a raw `number`
 * against an enum member — a comparison TypeScript permits and
 * `no-unsafe-enum-comparison` rightly flags, because the two types only happen
 * to coincide.
 */
const STATUS_TO_CODE: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: CommonErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: CommonErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: CommonErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: CommonErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: CommonErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: CommonErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: CommonErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: CommonErrorCode.SERVICE_UNAVAILABLE,
};

const SERVER_ERROR_FLOOR = 500;
const CLIENT_ERROR_FLOOR = 400;
const PAYLOAD_TOO_LARGE = 413;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.id ?? 'unknown';

    const { status, code, message, details } = this.describe(exception);

    if (status >= SERVER_ERROR_FLOOR) {
      // Full detail stays here, on the server side of the boundary.
      this.logger.error(
        `${request.method} ${request.url} -> ${String(status)} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${String(status)} [${requestId}] ${code}`,
      );
    }

    const body: ErrorEnvelope = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        requestId,
      },
    };

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: ErrorEnvelope['error']['details'];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // ValidationPipe throws a BadRequestException whose payload carries the
      // per-field messages. Surface them as structured details rather than a
      // single concatenated string the client has to parse.
      if (typeof payload === 'object' && payload !== null) {
        const record = payload as Record<string, unknown>;
        const raw = record.message;
        const messages = Array.isArray(raw) ? raw.map((m) => String(m)) : undefined;

        if (messages && messages.length > 0) {
          return {
            status,
            code: CommonErrorCode.VALIDATION_FAILED,
            message: 'Request validation failed.',
            details: messages.map((m) => ({ reason: m })),
          };
        }
      }

      return {
        status,
        code: this.codeForStatus(status),
        message: exception.message,
      };
    }

    // Express middleware (notably the body parser) throws `http-errors` objects
    // rather than Nest exceptions. Without this branch an oversized payload
    // becomes a generic 500, which tells the caller nothing actionable and
    // reports a server fault for what is a client mistake.
    const httpErrorStatus = this.httpErrorStatus(exception);
    if (httpErrorStatus !== undefined) {
      return {
        status: httpErrorStatus,
        code: this.codeForStatus(httpErrorStatus),
        message:
          httpErrorStatus === PAYLOAD_TOO_LARGE
            ? 'Request body too large.'
            : 'Request could not be processed.',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: CommonErrorCode.INTERNAL_ERROR,
      // Deliberately generic: the real reason is in the log, keyed by requestId.
      message: 'An unexpected error occurred.',
    };
  }

  /**
   * Recognises the `http-errors` shape used across the Express ecosystem.
   *
   * `expose === true` is the library's own signal that an error is safe to show
   * a client; anything without it is treated as internal. Only 4xx is honoured —
   * a library claiming a 5xx is still our fault and still gets the generic
   * response.
   */
  private httpErrorStatus(exception: unknown): number | undefined {
    if (typeof exception !== 'object' || exception === null) return undefined;

    const candidate = exception as { status?: unknown; statusCode?: unknown; expose?: unknown };
    if (candidate.expose !== true) return undefined;

    const status =
      typeof candidate.status === 'number'
        ? candidate.status
        : typeof candidate.statusCode === 'number'
          ? candidate.statusCode
          : undefined;

    if (status === undefined) return undefined;
    return status >= CLIENT_ERROR_FLOOR && status < SERVER_ERROR_FLOOR ? status : undefined;
  }

  private codeForStatus(status: number): string {
    // `noUncheckedIndexedAccess` makes this `string | undefined`, so an
    // unmapped status falls through to the generic code rather than `undefined`
    // reaching the response body.
    return STATUS_TO_CODE[status] ?? CommonErrorCode.INTERNAL_ERROR;
  }
}
