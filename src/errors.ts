export type LoftyErrorCode =
  | 'unauthorized'
  | 'trading_disabled'
  | 'rate_limited'
  | 'not_found'
  | 'bad_request'
  | 'missing_field'
  | 'invalid_field'
  | 'invalid_order'
  | 'order_rejected'
  | 'order_in_progress'
  | 'order_not_found'
  | 'order_not_owned'
  | 'order_locked'
  | 'conflict'
  | 'internal_error'
  | (string & {});

export interface LoftyErrorBody {
  code: LoftyErrorCode;
  message: string;
  field?: string;
  hint?: string;
}

/**
 * Base error class for all Lofty API errors. Check `statusCode` and `code`
 * to distinguish error types programmatically.
 */
export class LoftyError extends Error {
  readonly statusCode: number;
  readonly code: LoftyErrorCode;
  readonly field?: string;
  readonly hint?: string;

  constructor(statusCode: number, body: LoftyErrorBody) {
    super(body.message);
    this.name = 'LoftyError';
    this.statusCode = statusCode;
    this.code = body.code;
    this.field = body.field;
    this.hint = body.hint;
  }
}

/**
 * Thrown when the API key is missing, revoked, or invalid.
 */
export class LoftyAuthError extends LoftyError {
  constructor(body: LoftyErrorBody) {
    super(401, body);
    this.name = 'LoftyAuthError';
  }
}

/**
 * Thrown when the API key does not have trading enabled.
 * Enable trading in your Lofty account dashboard.
 */
export class LoftyTradingDisabledError extends LoftyError {
  constructor(body: LoftyErrorBody) {
    super(403, body);
    this.name = 'LoftyTradingDisabledError';
  }
}

/**
 * Thrown when the rate limit is exceeded.
 * Retry after `retryAfter` seconds.
 */
export class LoftyRateLimitError extends LoftyError {
  /** Seconds to wait before retrying. */
  readonly retryAfter: number;
  /** Unix timestamp (seconds) when the rate-limit window resets. */
  readonly resetAt: number;

  constructor(body: LoftyErrorBody, retryAfter: number, resetAt: number) {
    super(429, body);
    this.name = 'LoftyRateLimitError';
    this.retryAfter = retryAfter;
    this.resetAt = resetAt;
  }
}
