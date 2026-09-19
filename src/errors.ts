/**
 * Every 4xx/5xx forge-dashboard returns shares the same `{error}` body
 * (openapi/openapi.yaml's `Error` schema) -- one field, unlike some APIs'
 * richer `{code, message}` shape. `ApiError` carries that alongside the
 * HTTP status, so a caller never has to parse a raw `Response` or match
 * against a bare string.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly apiMessage: string;

  constructor(statusCode: number, message: string) {
    super(`forge-dashboard: ${statusCode}: ${message}`);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.apiMessage = message;
  }
}

interface ErrorBody {
  error?: string;
}

/**
 * Builds an ApiError from a response and its already-parsed error body --
 * openapi-fetch decodes JSON before handing you `error`, so there's no
 * `Response` to read a second time. Returns null for a response that
 * isn't actually an error (status < 400), so callers can call this
 * unconditionally on openapi-fetch's `{ data, error, response }` result:
 *
 *   const { data, error, response } = await client.GET("/api/dashboard", {});
 *   const apiErr = decodeError(response, error);
 *   if (apiErr) throw apiErr;
 */
export function decodeError(
  response: Response,
  body: unknown,
): ApiError | null {
  if (response.status < 400) {
    return null;
  }

  const parsed = isErrorBody(body) ? body : {};

  return new ApiError(response.status, parsed.error ?? response.statusText);
}

function isErrorBody(value: unknown): value is ErrorBody {
  return typeof value === "object" && value !== null;
}
