import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createForgeDashboardClient, TOKEN_ENV_VAR } from "../src/client.js";

// Unit-tests only the hand-written parts (auth injection here) against a
// fake transport -- testing the generated request/response mapping again
// would just be testing openapi-typescript, not this SDK
// (rules/sdk-generation.md's "Testing against the spec, not a hand-written
// stub").

test("token env var name is the documented, stable one", () => {
  // Every test below reads/writes process.env through this same exported
  // symbol, so they'd stay internally consistent even if its value
  // changed -- this is the one place that actually pins the literal,
  // since README/CONTRIBUTING and any caller's own shell config
  // hardcode this exact name.
  expect(TOKEN_ENV_VAR).toBe("FORGE_DASHBOARD_TOKEN");
});

describe("token source", () => {
  const originalEnv = process.env[TOKEN_ENV_VAR];

  beforeEach(() => {
    delete process.env[TOKEN_ENV_VAR];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[TOKEN_ENV_VAR];
    } else {
      process.env[TOKEN_ENV_VAR] = originalEnv;
    }
  });

  test("option only", async () => {
    const auth = await authHeaderSentBy(
      createClientWithFakeTransport({ token: "from-option" }),
    );
    expect(auth).toBe("Bearer from-option");
  });

  test("env fallback", async () => {
    process.env[TOKEN_ENV_VAR] = "from-env";
    const auth = await authHeaderSentBy(createClientWithFakeTransport({}));
    expect(auth).toBe("Bearer from-env");
  });

  test("option overrides env", async () => {
    process.env[TOKEN_ENV_VAR] = "from-env";
    const auth = await authHeaderSentBy(
      createClientWithFakeTransport({ token: "from-option" }),
    );
    expect(auth).toBe("Bearer from-option");
  });

  test("no Authorization header sent when neither is set", async () => {
    const auth = await authHeaderSentBy(createClientWithFakeTransport({}));
    expect(auth).toBeNull();
  });
});

test("falls back to no token when process is unavailable (browser bundle)", () => {
  const originalProcess = globalThis.process;
  // @ts-expect-error -- simulating a bundle target with no `process` global
  delete globalThis.process;
  try {
    expect(() =>
      createForgeDashboardClient("https://example.test", {}),
    ).not.toThrow();
  } finally {
    globalThis.process = originalProcess;
  }
});

function createClientWithFakeTransport(options: { token?: string }) {
  let capturedAuth: string | null = null;

  const client = createForgeDashboardClient("https://example.test", {
    ...options,
    fetch: async (request) => {
      capturedAuth = request.headers.get("authorization");

      return new Response(JSON.stringify({ version: "dev" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  return { client, getCapturedAuth: () => capturedAuth };
}

async function authHeaderSentBy(
  ctx: ReturnType<typeof createClientWithFakeTransport>,
): Promise<string | null> {
  await ctx.client.GET("/api/version", {});

  return ctx.getCapturedAuth();
}
