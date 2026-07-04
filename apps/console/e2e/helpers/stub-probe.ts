import type { APIRequestContext, TestType } from "@playwright/test";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4300";

/**
 * Guards against Playwright's `reuseExistingServer: !CI` silently reusing a dev stack that was
 * started without stub env vars. Every spec's beforeAll must call this and `test.skip` loudly if
 * ANY stub flag is off — a spec that "passes" against real providers, real telephony, or real
 * recording egress is not a passing spec. Checks all three independently (PROVIDER_STUB_MODE,
 * SIP_STUB_MODE, RECORDING_MODE=stub) rather than only `stubMode`, since a dev machine can easily
 * have one flag on and another off.
 */
export async function assertStubMode(
  request: APIRequestContext,
  test: Pick<TestType<object, object>, "skip">,
): Promise<void> {
  const response = await request.get(`${API_BASE_URL}/health`);
  const body = (await response.json()) as {
    stubMode?: boolean;
    sipStubMode?: boolean;
    recordingMode?: string;
  };

  const offFlags: string[] = [];
  if (body.stubMode !== true) offFlags.push("PROVIDER_STUB_MODE");
  if (body.sipStubMode !== true) offFlags.push("SIP_STUB_MODE");
  if (body.recordingMode !== "stub") offFlags.push("RECORDING_MODE=stub");

  if (offFlags.length > 0) {
    test.skip(
      true,
      `${offFlags.join(", ")} not enabled on the running api — refusing to run e2e specs ` +
        "against a non-stub stack. Restart the dev stack with PROVIDER_STUB_MODE=true " +
        "SIP_STUB_MODE=true RECORDING_MODE=stub.",
    );
  }
}
