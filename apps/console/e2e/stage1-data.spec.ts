import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { assertStubMode } from "./helpers/stub-probe.js";

const execFileAsync = promisify(execFile);
const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4300";
const CALLPLANE_API_KEY = process.env["CALLPLANE_API_KEY"] ?? "e2e-test-key";
const AUTH_HEADERS = { Authorization: `Bearer ${CALLPLANE_API_KEY}` };

const EXPECTED_AGENT_NAMES = [
  "demo-azure-realtime",
  "demo-cascade",
  "demo-cascade-cartesia",
  "demo-gemini-realtime",
  "demo-half-cascade",
  "demo-openai-realtime",
].sort();

test.beforeAll(async ({ request }) => {
  await assertStubMode(request, test);
});

test.describe("stage 1: data layer", () => {
  test("GET /v1/agents returns the 6 seeded configs with correct mode/provider fields", async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/v1/agents`, { headers: AUTH_HEADERS });
    expect(response.status()).toBe(200);

    const body = await response.json();

    // Containment, not exact length/set: the API's own unit tests (running in a separate CI job
    // against a separate Postgres container) can't collide with this spec, but a local dev run
    // against the shared owner Postgres can have scratch rows from other workspaces' test suites.
    const names = body.agents.map((a: { name: string }) => a.name);
    for (const expectedName of EXPECTED_AGENT_NAMES) {
      expect(names).toContain(expectedName);
    }

    const cascade = body.agents.find((a: { name: string }) => a.name === "demo-cascade");
    expect(cascade).toMatchObject({
      voiceMode: "cascade",
      sttProvider: "deepgram",
      llmProvider: "openai",
      ttsProvider: "elevenlabs",
    });

    const geminiRealtime = body.agents.find((a: { name: string }) => a.name === "demo-gemini-realtime");
    expect(geminiRealtime).toMatchObject({ voiceMode: "realtime", s2sProvider: "gemini" });
  });

  test("re-seeding mid-spec does not change the queryable data", async ({ request }) => {
    const before = await (await request.get(`${API_BASE_URL}/v1/agents`, { headers: AUTH_HEADERS })).json();

    await execFileAsync("npm", ["run", "db:seed", "--workspace=@callplane/database"], {
      cwd: new URL("../../..", import.meta.url).pathname,
    });

    const after = await (await request.get(`${API_BASE_URL}/v1/agents`, { headers: AUTH_HEADERS })).json();

    expect(after.agents).toHaveLength(before.agents.length);
    const beforeIds = before.agents.map((a: { id: string }) => a.id).sort();
    const afterIds = after.agents.map((a: { id: string }) => a.id).sort();
    expect(afterIds).toEqual(beforeIds);
  });
});
