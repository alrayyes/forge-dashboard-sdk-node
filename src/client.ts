import createClient, { type Client as OpenapiFetchClient } from "openapi-fetch";
import type { paths } from "./generated/schema.js";
import {
  createRetryFetch,
  defaultRetryConfig,
  type RetryConfig,
} from "./retry.js";

/**
 * The environment variable {@link createForgeDashboardClient} falls back
 * to when no token is passed explicitly via {@link ClientOptions.token}.
 */
export const TOKEN_ENV_VAR = "FORGE_DASHBOARD_TOKEN";

export interface ClientOptions {
  /**
   * A forge-dashboard personal API token, generated from the dashboard's
   * own Settings page (`POST /api/tokens`, signed in as yourself first).
   * Overrides `FORGE_DASHBOARD_TOKEN` when both are set. See the README's
   * "Authentication" section -- this is the real headless alternative
   * forge-dashboard's spec documents to its browser session cookie.
   */
  token?: string;
  /**
   * Replaces the underlying `fetch`. The retry wrapper (see `retry`)
   * wraps whatever this is, so pass something with its own request
   * behavior already configured (a proxying fetch, a test double) rather
   * than re-implementing retry yourself.
   */
  fetch?: (input: Request) => Promise<Response>;
  /** Overrides the default retry policy. */
  retry?: Partial<RetryConfig>;
}

/**
 * A forge-dashboard API client -- the typed `openapi-fetch` client for
 * `paths`, so every operation is available as `client.GET("/api/dashboard",
 * ...)` / `client.POST("/api/pull-requests/merge", ...)` etc. See the
 * README for the common operations and {@link decodeError} for turning a
 * failed response into a typed error.
 */
export type ForgeDashboardClient = OpenapiFetchClient<paths>;

/**
 * Builds a client against `baseUrl` (the forge-dashboard instance's own
 * origin, e.g. `"https://dashboard.example.com"`).
 */
export function createForgeDashboardClient(
  baseUrl: string,
  options: ClientOptions = {},
): ForgeDashboardClient {
  const token = options.token ?? getEnv(TOKEN_ENV_VAR);
  const retryConfig: RetryConfig = { ...defaultRetryConfig, ...options.retry };
  const baseFetch = options.fetch ?? ((request: Request) => fetch(request));

  const client = createClient<paths>({
    baseUrl,
    fetch: createRetryFetch(baseFetch, retryConfig),
  });

  if (token) {
    client.use({
      onRequest({ request }) {
        request.headers.set("Authorization", `Bearer ${token}`);

        return request;
      },
    });
  }

  return client;
}

function getEnv(name: string): string | undefined {
  // Bun and Node both expose process.env; guarded for a browser bundle
  // that has no `process` at all.
  return typeof process !== "undefined" ? process.env[name] : undefined;
}
