import { describe, expect, it } from "vitest";
import request from "supertest";
import { seed } from "@callplane/database";
import { createApp } from "../app.js";

describe("GET /v1/agents", () => {
  // Asserts containment, not exact length/set: this suite runs against the real shared Postgres
  // alongside other workspaces' test suites (e.g. apps/worker creates its own scratch AgentConfig
  // rows), so exact-count assertions are flaky under concurrent `turbo test` runs.
  it("returns at least the 6 seeded agent configs with mode/provider fields", async () => {
    await seed();
    const app = createApp();

    const response = await request(app).get("/v1/agents");

    expect(response.status).toBe(200);

    const names = response.body.agents.map((a: { name: string }) => a.name);
    for (const expectedName of [
      "demo-azure-realtime",
      "demo-cascade",
      "demo-cascade-cartesia",
      "demo-gemini-realtime",
      "demo-half-cascade",
      "demo-openai-realtime",
    ]) {
      expect(names).toContain(expectedName);
    }

    const cascadeCartesia = response.body.agents.find((a: { name: string }) => a.name === "demo-cascade-cartesia");
    expect(cascadeCartesia).toMatchObject({
      voiceMode: "cascade",
      ttsProvider: "cartesia",
    });
  });
});
