export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "HOUSEHOLD_ACCESS_DENIED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERV_NOT_CONFIGURED"
  | "SERV_UNAVAILABLE"
  | "SERV_INVALID_OUTPUT"
  | "DOCUMENT_PARSE_FAILED"
  | "DOCUMENT_TOO_LARGE"
  | "URL_NOT_ALLOWED"
  | "EVIDENCE_INVALID"
  | "ANALYSIS_INCOMPLETE"
  | "HARD_CONSTRAINT_VIOLATION"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_STALE"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_IMMUTABLE"
  | "EXECUTION_ALREADY_SUBMITTED"
  | "EXECUTION_NOT_FOUND"
  | "KITE_NOT_CONFIGURED"
  | "KITE_CLI_MISSING"
  | "KITE_AUTH_REQUIRED"
  | "KITE_SESSION_PENDING"
  | "KITE_SESSION_EXPIRED"
  | "KITE_SESSION_EXHAUSTED"
  | "KITE_BUDGET_EXCEEDED"
  | "KITE_EXECUTION_FAILED"
  | "PROVIDER_ACTIVATION_NOT_INTEGRATED"
  | "INTERNAL_ERROR";

const statusByCode: Record<ApiErrorCode, number> = {
  AUTH_REQUIRED: 401,
  HOUSEHOLD_ACCESS_DENIED: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SERV_NOT_CONFIGURED: 503,
  SERV_UNAVAILABLE: 502,
  SERV_INVALID_OUTPUT: 502,
  DOCUMENT_PARSE_FAILED: 422,
  DOCUMENT_TOO_LARGE: 413,
  URL_NOT_ALLOWED: 400,
  EVIDENCE_INVALID: 422,
  ANALYSIS_INCOMPLETE: 409,
  HARD_CONSTRAINT_VIOLATION: 409,
  APPROVAL_EXPIRED: 409,
  APPROVAL_STALE: 409,
  APPROVAL_REQUIRED: 409,
  APPROVAL_IMMUTABLE: 409,
  EXECUTION_ALREADY_SUBMITTED: 409,
  EXECUTION_NOT_FOUND: 404,
  KITE_NOT_CONFIGURED: 503,
  KITE_CLI_MISSING: 503,
  KITE_AUTH_REQUIRED: 401,
  KITE_SESSION_PENDING: 409,
  KITE_SESSION_EXPIRED: 409,
  KITE_SESSION_EXHAUSTED: 409,
  KITE_BUDGET_EXCEEDED: 409,
  KITE_EXECUTION_FAILED: 502,
  PROVIDER_ACTIVATION_NOT_INTEGRATED: 501,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = statusByCode[code];
    this.details = details;
  }
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      { status: error.status },
    );
  }

  console.error("[commitmentguard] unhandled api error", {
    name: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : "unknown",
  });

  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed. No action was taken.",
        details: null,
      },
    },
    { status: 500 },
  );
}

export function assertFound<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ApiError("NOT_FOUND", message);
  }
}
