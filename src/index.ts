/**
 * A Node/TypeScript client for the forge-dashboard REST API
 * (github.com/alrayyes/forge-dashboard), generated from its OpenAPI spec
 * with openapi-typescript + openapi-fetch.
 *
 * Authenticate with a personal API token (`POST /api/tokens` on a running
 * instance, signed in as yourself first) -- the real headless alternative
 * forge-dashboard's spec documents to its browser session cookie, and the
 * one this SDK actually uses. Pass it to {@link createForgeDashboardClient}
 * or set `FORGE_DASHBOARD_TOKEN`. See the README for the full explanation
 * and an example.
 */

export type {
  ClientOptions,
  ForgeDashboardClient,
} from "./client.js";
export { createForgeDashboardClient, TOKEN_ENV_VAR } from "./client.js";
export { ApiError, decodeError } from "./errors.js";
export type { components, operations, paths } from "./generated/schema.js";
export type { RetryConfig } from "./retry.js";
export { defaultRetryConfig } from "./retry.js";
