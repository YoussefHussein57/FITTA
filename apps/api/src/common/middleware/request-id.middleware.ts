import { randomUUID } from 'node:crypto';

import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';

// Augment the global `Express.Request`, not `express-serve-static-core`'s
// `Request` directly: the latter is generic, and a non-generic re-declaration is
// rejected ("all declarations must have identical type parameters"). The global
// namespace exists precisely as the merge point for this.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation id assigned to every request by {@link requestIdMiddleware}. */
      id?: string;
    }
  }
}

/** Response header carrying the correlation id back to the caller. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Inbound ids are echoed and logged, so their length is capped. */
const MAX_INBOUND_LENGTH = 128;

/**
 * Assigns a correlation id to every request.
 *
 * **A plain Express handler, registered first in `main.ts` — not a Nest
 * middleware class.** Nest registers module middleware during `app.init()`,
 * which runs *after* the `app.use(...)` calls in `main.ts`. A Nest middleware
 * would therefore sit behind the body parser, and a request rejected for an
 * oversized payload would carry no id — precisely the request someone later
 * needs to find in the logs. Verified: it returned `requestId: "unknown"` until
 * this moved to the front of the chain.
 *
 * An inbound `x-request-id` is accepted so a trace can span the Next.js proxy and
 * the API.
 */
export function requestIdMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const inbound = req.header(REQUEST_ID_HEADER);
    const id =
      inbound && inbound.length > 0 && inbound.length <= MAX_INBOUND_LENGTH
        ? inbound
        : randomUUID();

    req.id = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  };
}
