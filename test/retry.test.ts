import { describe, expect, spyOn, test } from "bun:test";
import { createRetryFetch, defaultRetryConfig } from "../src/retry.js";

/**
 * Captures every delay `createRetryFetch` asks `setTimeout` for, and fires
 * each one immediately instead of actually waiting -- lets a test assert
 * the exact backoff/jitter/Retry-After arithmetic without real sleeps.
 */
function captureDelays() {
  const delays: number[] = [];
  const spy = spyOn(globalThis, "setTimeout").mockImplementation(((
    fn: (...args: unknown[]) => void,
    ms?: number,
  ) => {
    delays.push(ms ?? 0);
    fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);
  return { delays, restore: () => spy.mockRestore() };
}

describe("createRetryFetch", () => {
  test("retries a 5xx then succeeds", async () => {
    let attempts = 0;
    const retryFetch = createRetryFetch(async () => {
      attempts++;
      if (attempts < 3) {
        return new Response(null, { status: 503 });
      }

      return new Response(JSON.stringify({ version: "dev" }), { status: 200 });
    }, zeroDelay(3));

    const response = await retryFetch(
      new Request("https://example.test/api/version"),
    );

    expect(response.status).toBe(200);
    expect(attempts).toBe(3);
  });

  test("never retries a non-429 4xx", async () => {
    let attempts = 0;
    const retryFetch = createRetryFetch(async () => {
      attempts++;

      return new Response(
        JSON.stringify({ code: "bad_request", message: "nope" }),
        { status: 400 },
      );
    }, zeroDelay(3));

    const response = await retryFetch(
      new Request("https://example.test/api/version"),
    );

    expect(response.status).toBe(400);
    expect(attempts).toBe(1);
  });

  test("honors Retry-After ahead of its own backoff", async () => {
    let attempts = 0;
    const retryFetch = createRetryFetch(async () => {
      attempts++;
      if (attempts < 2) {
        return new Response(null, {
          status: 429,
          headers: { "Retry-After": "0" },
        });
      }

      return new Response(JSON.stringify({ version: "dev" }), { status: 200 });
    }, zeroDelay(2));

    const response = await retryFetch(
      new Request("https://example.test/api/version"),
    );

    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
  });

  test("gives up after maxRetries", async () => {
    let attempts = 0;
    const retryFetch = createRetryFetch(async () => {
      attempts++;

      return new Response(null, { status: 503 });
    }, zeroDelay(2));

    const response = await retryFetch(
      new Request("https://example.test/api/version"),
    );

    expect(response.status).toBe(503);
    expect(attempts).toBe(3); // first try + 2 retries
  });

  test("retries a network failure", async () => {
    let attempts = 0;
    const retryFetch = createRetryFetch(async () => {
      attempts++;
      if (attempts < 2) {
        throw new TypeError("fetch failed");
      }

      return new Response(JSON.stringify({ version: "dev" }), { status: 200 });
    }, zeroDelay(2));

    const response = await retryFetch(
      new Request("https://example.test/api/version"),
    );

    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
  });

  test("replays a JSON request body on every attempt", async () => {
    let attempts = 0;
    const bodiesSeen: unknown[] = [];
    const retryFetch = createRetryFetch(async (request) => {
      attempts++;
      bodiesSeen.push(await request.json());
      if (attempts < 3) {
        return new Response(null, { status: 503 });
      }

      return new Response(JSON.stringify({ id: "1" }), { status: 201 });
    }, zeroDelay(3));

    const original = new Request("https://example.test/api/repos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ forge: "github", identifier: "a/a", token: "t" }),
    });

    const response = await retryFetch(original);

    expect(response.status).toBe(201);
    expect(attempts).toBe(3);
    expect(bodiesSeen).toEqual([
      { forge: "github", identifier: "a/a", token: "t" },
      { forge: "github", identifier: "a/a", token: "t" },
      { forge: "github", identifier: "a/a", token: "t" },
    ]);
  });

  test("stops retrying once the request is aborted", async () => {
    const controller = new AbortController();
    let attempts = 0;
    const retryFetch = createRetryFetch(async () => {
      attempts++;
      throw new DOMException("aborted", "AbortError");
    }, zeroDelay(3));

    controller.abort();
    const request = new Request("https://example.test/api/version", {
      signal: controller.signal,
    });

    await expect(retryFetch(request)).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  test("gives up after maxRetries when the transport keeps throwing", async () => {
    const { delays, restore } = captureDelays();
    try {
      let attempts = 0;
      const retryFetch = createRetryFetch(
        async () => {
          attempts++;
          throw new TypeError("fetch failed");
        },
        { ...defaultRetryConfig, maxRetries: 2, baseDelayMs: 0 },
      );

      await expect(
        retryFetch(new Request("https://example.test/api/version")),
      ).rejects.toThrow("fetch failed");
      // First try + 2 retries, then the boundary check (attempt >=
      // maxRetries) stops it rather than retrying forever.
      expect(attempts).toBe(3);
      expect(delays).toHaveLength(2);
    } finally {
      restore();
    }
  });

  test("retries a bare 500, the lower edge of the 5xx range", async () => {
    let attempts = 0;
    const retryFetch = createRetryFetch(async () => {
      attempts++;
      if (attempts < 2) {
        return new Response(null, { status: 500 });
      }

      return new Response(JSON.stringify({ version: "dev" }), { status: 200 });
    }, zeroDelay(2));

    const response = await retryFetch(
      new Request("https://example.test/api/version"),
    );

    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
  });

  test("computes exponential backoff with jitter precisely", async () => {
    const { delays, restore } = captureDelays();
    const randomSpy = spyOn(Math, "random").mockReturnValue(0.5);
    try {
      let attempts = 0;
      const retryFetch = createRetryFetch(
        async () => {
          attempts++;
          if (attempts < 4) {
            return new Response(null, { status: 503 });
          }

          return new Response(JSON.stringify({ version: "dev" }), {
            status: 200,
          });
        },
        { maxRetries: 3, baseDelayMs: 50 },
      );

      const response = await retryFetch(
        new Request("https://example.test/api/version"),
      );

      expect(response.status).toBe(200);
      // backoff = baseDelayMs * 2**attempt, jitter = 0.5 * backoff (mocked),
      // delay = backoff/2 + jitter/2 -- attempt 0/1/2 in order.
      expect(delays).toEqual([37.5, 75, 150]);
    } finally {
      restore();
      randomSpy.mockRestore();
    }
  });

  test("honors Retry-After even against a much larger backoff", async () => {
    const { delays, restore } = captureDelays();
    try {
      let attempts = 0;
      const retryFetch = createRetryFetch(
        async () => {
          attempts++;
          if (attempts < 2) {
            return new Response(null, {
              status: 429,
              headers: { "Retry-After": "0" },
            });
          }

          return new Response(JSON.stringify({ version: "dev" }), {
            status: 200,
          });
        },
        { maxRetries: 1, baseDelayMs: 100_000 },
      );

      const response = await retryFetch(
        new Request("https://example.test/api/version"),
      );

      expect(response.status).toBe(200);
      // A baseDelayMs this large would dwarf 0 if the Retry-After branch
      // were skipped in favor of the backoff fallback.
      expect(delays).toEqual([0]);
    } finally {
      restore();
    }
  });

  test("honors a Retry-After HTTP-date, not just delay-seconds", async () => {
    const { delays, restore } = captureDelays();
    // A round-second epoch so Date.parse's own second-level precision on
    // an HTTP-date round-trips exactly, with no sub-second rounding to
    // account for in the expected delay below.
    const fixedNow = 1_700_000_000_000;
    const dateSpy = spyOn(Date, "now").mockReturnValue(fixedNow);
    try {
      let attempts = 0;
      const retryFetch = createRetryFetch(
        async () => {
          attempts++;
          if (attempts < 2) {
            return new Response(null, {
              status: 429,
              headers: {
                "Retry-After": new Date(fixedNow + 5000).toUTCString(),
              },
            });
          }

          return new Response(JSON.stringify({ version: "dev" }), {
            status: 200,
          });
        },
        { maxRetries: 1, baseDelayMs: 100_000 },
      );

      await retryFetch(new Request("https://example.test/api/version"));

      // A baseDelayMs this large would dominate a wrongly-NaN'd or
      // sign-flipped computation of `when - Date.now()`.
      expect(delays).toEqual([5000]);
    } finally {
      restore();
      dateSpy.mockRestore();
    }
  });

  describe("Retry-After header parsing", () => {
    // Each case pins baseDelayMs/jitter so the backoff fallback always
    // computes to exactly 75000ms -- any mutant that wrongly takes (or
    // skips) the digits-only fast path produces a different, and often
    // NaN, value instead.
    const backoffFallback = 75_000;

    test.each([
      // Multi-digit, correctly recognized as digits-only: the fast path
      // converts seconds to ms directly.
      ["15", 15_000],
      // Digit(s) followed by a non-digit: only a full-match ($-anchored)
      // regex correctly rejects this.
      ["0x", backoffFallback],
      // Non-digit prefix before a digit: only a start-anchored (^) regex
      // correctly rejects this.
      ["x0", backoffFallback],
      // No digits at all: the fast path must not fire for this either.
      ["not-a-number", backoffFallback],
    ])("header %p resolves to %p ms", async (header, expectedMs) => {
      const { delays, restore } = captureDelays();
      const randomSpy = spyOn(Math, "random").mockReturnValue(0.5);
      try {
        let attempts = 0;
        const retryFetch = createRetryFetch(
          async () => {
            attempts++;
            if (attempts < 2) {
              return new Response(null, {
                status: 429,
                headers: { "Retry-After": header },
              });
            }

            return new Response(JSON.stringify({ version: "dev" }), {
              status: 200,
            });
          },
          { maxRetries: 1, baseDelayMs: 100_000 },
        );

        await retryFetch(new Request("https://example.test/api/version"));

        expect(delays).toEqual([expectedMs]);
      } finally {
        restore();
        randomSpy.mockRestore();
      }
    });
  });
});

function zeroDelay(maxRetries: number) {
  return { ...defaultRetryConfig, maxRetries, baseDelayMs: 0 };
}
