import { FastifyReply } from "fastify";
import { ZodError, z } from "zod";

// ---------------------------------------------------------------------------
// Standard API Error Response Schema
// All public error responses adhere to: { error: { code: string, message: string } }
// ---------------------------------------------------------------------------

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ---------------------------------------------------------------------------
// Domain / HTTP Application Errors
// ---------------------------------------------------------------------------

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Invalid request parameter") {
    super(message, 400, "INVALID_PARAMETER");
  }
}

export class PortalAuthError extends AppError {
  constructor(message = "Unable to authenticate with the upstream portal.") {
    super(message, 503, "PORTAL_AUTH_FAILED");
  }
}

export class PortalUpstreamError extends AppError {
  constructor(message = "Unable to retrieve data from the upstream portal.") {
    super(message, 502, "UPSTREAM_ERROR");
  }
}

// ---------------------------------------------------------------------------
// Consistent Error Handler
// ---------------------------------------------------------------------------

export function handleApiError(err: unknown, reply: FastifyReply): void {
  if (err instanceof PortalUpstreamError) {
    reply.status(502).send({
      error: {
        code: "UPSTREAM_ERROR",
        message: "Unable to retrieve data from the upstream portal.",
      },
    });
    return;
  }

  if (err instanceof AppError) {
    reply.status(err.statusCode).send({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    reply.status(400).send({
      error: {
        code: "INVALID_PARAMETER",
        message: err.issues[0]?.message ?? "Validation failed",
      },
    });
    return;
  }

  // Fastify schema validation error check
  if (
    typeof err === "object" &&
    err !== null &&
    "validation" in err &&
    "message" in err
  ) {
    reply.status(400).send({
      error: {
        code: "INVALID_PARAMETER",
        message: String((err as { message: unknown }).message),
      },
    });
    return;
  }

  // Fallback 500 - hide internal error details / stacks
  reply.status(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    },
  });
}
