import type { APIRequestContext, TestType } from "@playwright/test";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4300";

/**
 * Guards against Playwright's `reuseExistingServer: !CI` silently reusing a dev stack that was
 * started without stub env vars. Every spec's beforeAll must call this and `test.skip` loudly if
 * stubs are off — a spec that "passes" against real providers/telephony is not a passing spec.
 */
export async function assertStubMode(
  request: APIRequestContext,
  test: Pick<TestType<object, object>, "skip">,
): Promise<void> {
  const response = await request.get(`${API_BASE_URL}/health`);
  const body = (await response.json()) as { stubMode?: boolean };

  if (body.stubMode !== true) {
    test.skip(
      true,
      "PROVIDER_STUB_MODE is not enabled on the running api — refusing to run e2e specs " +
        "against a non-stub stack. Restart the dev stack with PROVIDER_STUB_MODE=true.",
    );
  }
}
