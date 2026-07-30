/**
 * generationErrors.ts
 * ====================
 * Custom error classes for generation-specific failures.
 * Each class carries a `code` that maps to the errorCode field in GenerationLog.
 * These are thrown by AI adapters and caught by the service layer,
 * which uses the code to decide the GenerationLog.status and SSE error event.
 *
 * Three error types:
 *   RateLimitError  ← provider returned 429
 *   TimeoutError    ← combined signal timed out
 *   ProviderError   ← any other provider failure (network, auth, server error)
 */

export class RateLimitError extends Error {
  code: string;
  retryAfter: number;

  constructor(message: string, retryAfter = 30) {
    super(message);
    this.name = 'RateLimitError';
    this.code = 'RATE_LIMITED';
    this.retryAfter = retryAfter;
  }
}

export class TimeoutError extends Error {
  code: string;

  constructor(message = 'Generation timed out') {
    super(message);
    this.name = 'TimeoutError';
    this.code = 'TIMEOUT';
  }
}

export class ProviderError extends Error {
  code: string;

  constructor(message: string, code = 'PROVIDER_ERROR') {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}
