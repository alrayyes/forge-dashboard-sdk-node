// Runs the client against a Prism mock server generated from
// forge-dashboard's own pinned spec (see ci.yml's `contract` job) --
// never a hand-rolled stub. This proves the client's requests/responses
// conform to the spec's shape; it says nothing about whether the real
// server still matches that spec.
// Run locally with:
//   docker run -d -p 4010:4010 -v "$(pwd)/openapi:/spec:ro" \
//     stoplight/prism:5 mock -h 0.0.0.0 -m false /spec/openapi.yaml
import { describe, expect, test } from "bun:test";
import { createForgeDashboardClient } from "../../src/client.js";

const baseUrl = process.env.FORGE_DASHBOARD_BASE_URL;

describe.skipIf(!baseUrl)("contract", () => {
  test("reports the mock server as healthy", async () => {
    const client = createForgeDashboardClient(baseUrl ?? "");
    const { data, error } = await client.GET("/healthz");

    expect(error).toBeUndefined();
    expect(data?.status).toBe("ok");
  });

  test("reports the running version", async () => {
    const client = createForgeDashboardClient(baseUrl ?? "");
    const { data, error } = await client.GET("/api/version");

    expect(error).toBeUndefined();
    expect(typeof data?.version).toBe("string");
  });
});
