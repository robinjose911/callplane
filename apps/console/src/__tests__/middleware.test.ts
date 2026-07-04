import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware.js";
import { sessionOptions } from "../lib/session.js";

function requestFor(pathname: string, cookieValue?: string): NextRequest {
  const request = new NextRequest(new URL(pathname, "http://localhost:4400"));
  if (cookieValue !== undefined) {
    request.cookies.set(sessionOptions.cookieName, cookieValue);
  }
  return request;
}

describe("middleware", () => {
  it("redirects to /login when no session cookie is present", () => {
    const response = middleware(requestFor("/"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/");
  });

  it("preserves the original path in the redirect query param", () => {
    const response = middleware(requestFor("/agents"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("redirect")).toBe("/agents");
  });

  it("allows the request through when a session cookie is present", () => {
    const response = middleware(requestFor("/", "some-session-value"));
    expect(response.status).not.toBe(307);
  });

  it("never redirects /login itself (would loop)", () => {
    const response = middleware(requestFor("/login"));
    expect(response.status).not.toBe(307);
  });

  it("never redirects /api/auth/* routes", () => {
    const response = middleware(requestFor("/api/auth/login"));
    expect(response.status).not.toBe(307);
  });
});
