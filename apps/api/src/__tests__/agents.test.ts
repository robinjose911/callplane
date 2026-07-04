import { describe, expect, it } from "vitest";
import request from "supertest";
import { seed } from "@callplane/database";
import { createApp } from "../app.js";

describe("GET /v1/agents", () => {
  it("returns the 6 seeded agent configs with mode/provider fields", async () => {
    await seed();
    const app = createApp();

    const response = await request(app).get("/v1/agents");

    expect(response.status).toBe(200);
    expect(response.body.agents).toHaveLength(6);

    const names = response.body.agents.map((a: { name: string }) => a.name).sort();
    expect(names).toEqual(
      [
        "demo-azure-realtime",
        "demo-cascade",
        "demo-cascade-cartesia",
        "demo-gemini-realtime",
        "demo-half-cascade",
        "demo-openai-realtime",
      ].sort(),
    );

    const cascadeCartesia = response.body.agents.find((a: { name: string }) => a.name === "demo-cascade-cartesia");
    expect(cascadeCartesia).toMatchObject({
      voiceMode: "cascade",
      ttsProvider: "cartesia",
    });
  });
});
