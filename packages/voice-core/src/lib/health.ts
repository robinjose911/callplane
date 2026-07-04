export interface HealthPayload {
  ok: true;
  service: string;
  stubMode: boolean;
  sipStubMode: boolean;
  recordingMode: string;
}

/**
 * Shared `/health` payload shape for every callplane service. Every Playwright spec's
 * `beforeAll` probes this endpoint to guard against running against a non-stub stack
 * (see apps/console/e2e/helpers/stub-probe.ts) — api and worker must report identically.
 */
export function buildHealthPayload(defaultServiceName: string): HealthPayload {
  return {
    ok: true,
    service: process.env["SERVICE_NAME"] ?? defaultServiceName,
    stubMode: process.env["PROVIDER_STUB_MODE"] === "true",
    sipStubMode: process.env["SIP_STUB_MODE"] === "true",
    recordingMode: process.env["RECORDING_MODE"] ?? "live",
  };
}
