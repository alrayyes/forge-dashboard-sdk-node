/**
 * Retries a 5xx or 429 response with exponential backoff and jitter,
 * honoring a server-sent Retry-After ahead of its own schedule. Never
 * retries any other 4xx -- those won't succeed on a second attempt, and
 * retrying only delays the real error reaching the caller
 * (rules/sdk-generation.md's "Client shape").
 *
 * Implemented as a wrapper around openapi-fetch's own `fetch` option
 * (`(input: Request) => Promise<Response>`) rather than as middleware:
 * middleware's `onResponse` hook can inspect a response but has no way to
 * re-issue the underlying request, so the retry loop has to live where
 * the actual network call happens. This is the same shape the Go SDK
 * gets from wrapping `http.RoundTripper`.
 */

export interface RetryConfig {
  /** Additional attempts after the first. */
  maxRetries: number;
  /** Starting backoff before jitter and any server-sent Retry-After. */
  baseDelayMs: number;
}

export const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 250,
};

type OpenapiFetch = (input: Request) => Promise<Response>;

/** Wraps `baseFetch` with the retry policy described above. */
export function createRetryFetch(
  baseFetch: OpenapiFetch,
  config: RetryConfig,
): OpenapiFetch {
  return async function retryFetch(request) {
    // `request` may already be attempt 0 by the time we see it; clone a
    // pristine copy up front so a body can be replayed on every attempt,
    // including the first -- baseFetch (or whatever it delegates to) may
    // consume the copy it's handed, but never `original` itself.
    const original = request.clone();
    let attempt = 0;

    for (;;) {
      let response: Response;
      try {
        // The double cast works around @types/bun and @types/node
        // disagreeing about the shape of the global `Request`/`Headers`
        // types when both are present (bun-types depends on @types/node
        // and references it directly) -- clone() is structurally a plain
        // Request either way, just typed against two incompatible
        // declarations of the same runtime object.
        response = await baseFetch(original.clone() as unknown as Request);
      } catch (err) {
        if (attempt >= config.maxRetries || request.signal.aborted) {
          throw err;
        }
        await sleep(backoffDelayMs(attempt, config.baseDelayMs));
        attempt++;
        continue;
      }

      if (!shouldRetry(response, attempt, config)) {
        return response;
      }

      const delay = retryDelayMs(response, attempt, config.baseDelayMs);
      // Nothing reads this response's body -- drain it so Node/undici
      // doesn't warn about an unconsumed body holding a socket open.
      await response.body?.cancel().catch(() => undefined);
      await sleep(delay);
      attempt++;
    }
  };
}

function shouldRetry(
  response: Response,
  attempt: number,
  config: RetryConfig,
): boolean {
  if (attempt >= config.maxRetries) {
    return false;
  }

  return response.status === 429 || response.status >= 500;
}

function retryDelayMs(
  response: Response,
  attempt: number,
  baseDelayMs: number,
): number {
  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
  if (retryAfter !== null) {
    return retryAfter;
  }

  return backoffDelayMs(attempt, baseDelayMs);
}

function backoffDelayMs(attempt: number, baseDelayMs: number): number {
  const backoff = baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * backoff;

  return backoff / 2 + jitter / 2;
}

/** Parses Retry-After per RFC 9110: either delay-seconds or an HTTP-date. */
function parseRetryAfter(header: string | null): number | null {
  if (!header) {
    return null;
  }

  if (/^\d+$/.test(header)) {
    return Number(header) * 1000;
  }

  const when = Date.parse(header);
  if (Number.isNaN(when)) {
    return null;
  }

  return Math.max(0, when - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
