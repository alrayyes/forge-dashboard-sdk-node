# forge-dashboard-sdk-node

[![CI](https://github.com/alrayyes/forge-dashboard-sdk-node/actions/workflows/ci.yml/badge.svg)](https://github.com/alrayyes/forge-dashboard-sdk-node/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40forge-dashboard%2Fsdk-node)](https://www.npmjs.com/package/@forge-dashboard/sdk-node)
[![Codecov](https://codecov.io/gh/alrayyes/forge-dashboard-sdk-node/graph/badge.svg)](https://codecov.io/gh/alrayyes/forge-dashboard-sdk-node)
[![docs](https://img.shields.io/badge/docs-typedoc-blue)](https://alrayyes.github.io/forge-dashboard-sdk-node/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Node/TypeScript client for [forge-dashboard](https://github.com/alrayyes/forge-dashboard)'s
REST API, generated from its OpenAPI spec with
[openapi-typescript](https://openapi-ts.dev/) and
[openapi-fetch](https://openapi-ts.dev/openapi-fetch/). It saves you from
hand-rolling HTTP requests and retries against the API yourself.

Full API reference: <https://alrayyes.github.io/forge-dashboard-sdk-node/>

## Requirements

- Node.js 20+ or [Bun](https://bun.sh) 1.1+ — anything with a native `fetch`.
- A running forge-dashboard instance.
- A personal API token for that instance (see "Authentication" below) —
  every endpoint except `/healthz` and `/api/version` needs one.

## Installation

```sh
bun add @forge-dashboard/sdk-node
# or: npm install @forge-dashboard/sdk-node
```

### Alternative registry: GitHub Packages

Every release also publishes to GitHub Packages under
`@alrayyes/forge-dashboard-sdk-node` — the same code, a different scope,
because GitHub Packages' npm registry requires a package scoped to the
repo owner rather than the `forge-dashboard` npm org. Worth it if you're
already authenticated to GitHub (CI in another of your own repos, say) and
would rather not hold a separate npmjs.com credential just to install this
one package.

Add a `.npmrc` pointing that scope at GitHub Packages:

```
@alrayyes:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

then install the scoped name instead:

```sh
npm install @alrayyes/forge-dashboard-sdk-node
```

## Authentication

forge-dashboard authenticates browsers with passkeys (WebAuthn) and a
session cookie, but its spec documents a real headless alternative: a
personal API token, generated from the dashboard's own Settings page
(`POST /api/tokens`, signed in as yourself first) and sent as
`Authorization: Bearer <token>` on every request after. Pass it to
`createForgeDashboardClient` or set `FORGE_DASHBOARD_TOKEN` in the
environment:

```ts
import { createForgeDashboardClient } from "@forge-dashboard/sdk-node";

const client = createForgeDashboardClient("https://dashboard.example.com", {
  token: process.env.FORGE_DASHBOARD_TOKEN,
});
```

A token is revocable from Settings at any point; there's nothing in this
SDK to refresh one automatically once it's gone.

## Usage

`GET /api/version` needs no token and is a good first call to prove the
client reaches the server at all. The client is a typed
[`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) instance, so every
operation is `client.GET(path, ...)` / `client.POST(path, ...)`, returning
`{ data, error, response }`:

```ts
import { createForgeDashboardClient } from "@forge-dashboard/sdk-node";

const client = createForgeDashboardClient("https://dashboard.example.com");

const { data } = await client.GET("/api/version", {});
console.log("server version:", data?.version);
```

Fetching your own dashboard needs a token, and demonstrates typed error
handling:

```ts
import {
  ApiError,
  createForgeDashboardClient,
  decodeError,
} from "@forge-dashboard/sdk-node";

const client = createForgeDashboardClient("https://dashboard.example.com", {
  token: process.env.FORGE_DASHBOARD_TOKEN,
});

const { data, error, response } = await client.GET("/api/dashboard", {});
if (error) {
  const apiErr = decodeError(response, error);
  if (apiErr instanceof ApiError && apiErr.statusCode === 401) {
    throw new Error("token expired or invalid");
  }
  throw apiErr;
}
for (const pr of data.pullRequests) {
  console.log(`${pr.repo}#${pr.number}: ${pr.title} (${pr.ci})`);
}
```

Every other operation follows the same `client.GET`/`client.POST`/... pattern.
Use `decodeError` to turn any failed response into a
`@forge-dashboard/sdk-node` `ApiError` uniformly, as shown above.

The client retries a `429` or `5xx` response with exponential backoff and
jitter (honoring a server-sent `Retry-After`), and never retries any other
`4xx`. Tune it with the `retry` option, or swap the underlying `fetch`
entirely with the `fetch` option.

## Regenerating the types

See [CONTRIBUTING.md](CONTRIBUTING.md) — the generated types are pinned to a
specific forge-dashboard commit and shouldn't drift from it silently.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for building, testing and the release
process.

## License

[MIT](LICENSE) — a permissive license for the client, independent of
forge-dashboard's own AGPL-3.0.
