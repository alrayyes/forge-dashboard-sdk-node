import { describe, expect, test } from "bun:test";
import { ApiError, decodeError } from "../src/errors.js";

describe("decodeError", () => {
  test("parses the error body", () => {
    const response = new Response(null, { status: 404 });

    const apiErr = decodeError(response, { error: "no such pull request" });

    expect(apiErr).toBeInstanceOf(ApiError);
    expect(apiErr?.name).toBe("ApiError");
    expect(apiErr?.statusCode).toBe(404);
    expect(apiErr?.apiMessage).toBe("no such pull request");
  });

  test("treats a non-object, non-null body as unparseable rather than crashing", () => {
    const response = new Response(null, {
      status: 400,
      statusText: "Bad Request",
    });

    // `undefined` (no body) is neither an object nor null -- the guard
    // has to reject it too, not just plain primitives, or a body-less
    // error response throws instead of producing a typed ApiError.
    const apiErr = decodeError(response, undefined);

    expect(apiErr?.apiMessage).toBe("Bad Request");
  });

  test("null on a successful status", () => {
    const response = new Response(null, { status: 200 });
    expect(decodeError(response, undefined)).toBeNull();
  });

  test("falls back to statusText for a malformed body", () => {
    const response = new Response(null, {
      status: 500,
      statusText: "Internal Server Error",
    });

    const apiErr = decodeError(response, null);

    expect(apiErr?.apiMessage).toBe("Internal Server Error");
  });

  test("message includes the status code and parsed error text", () => {
    const response = new Response(null, { status: 403 });
    const apiErr = decodeError(response, { error: "token lacks scope" });
    expect(apiErr?.message).toBe("forge-dashboard: 403: token lacks scope");
  });
});
