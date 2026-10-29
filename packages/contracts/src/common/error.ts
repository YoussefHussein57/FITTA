import { z } from 'zod';

/**
 * The single error shape every FITTA endpoint returns.
 *
 * See docs/API_CONTRACTS.md §1. `code` is a stable machine string that clients
 * branch on and is append-only once shipped; `message` is localised prose for
 * humans and must never be parsed.
 *
 * `details` deliberately carries no free-form server text — no stack traces, no
 * driver errors, no database identifiers. See docs/SECURITY.md §4.
 */
export const errorDetailSchema = z
  .object({
    field: z.string().optional(),
  })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const errorEnvelopeSchema = z.object({
  error: z.object({
    /** Stable machine-readable code, e.g. `GOAL_RATE_EXCEEDS_SAFE_LIMIT`. */
    code: z.string().min(1),
    /** Localised, human-facing message. Never parsed by clients. */
    message: z.string().min(1),
    /** Structured, non-sensitive context for field-level errors. */
    details: z.array(errorDetailSchema).optional(),
    /** Correlates this response with the structured server logs. */
    requestId: z.string().min(1),
  }),
});

export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/**
 * Error codes shared across domains. Domain-specific codes live with their
 * domain. Values are append-only: a shipped code is never repurposed, because
 * clients in the wild still branch on it (docs/API_CONTRACTS.md §4).
 */
export const CommonErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type CommonErrorCode = (typeof CommonErrorCode)[keyof typeof CommonErrorCode];
