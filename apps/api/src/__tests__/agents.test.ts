import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { seed, prisma } from "@callplane/database";
import { createApp } from "../app.js";

const API_KEY = "test-api-key";
const AUTH_HEADERS = { Authorization: `Bearer ${API_KEY}` };
const app = createApp();
const createdNames: string[] = [];

function uniqueName(): string {
  const name = `test-agent-${crypto.randomUUID()}`;
  createdNames.push(name);
  return name;
}

beforeAll(async () => {
  process.env["CALLPLANE_API_KEY"] = API_KEY;
  await seed();
});

afterAll(async () => {
  await prisma.agentConfig.deleteMany({ where: { name: { in: createdNames } } });
});

describe("GET /v1/agents", () => {
  it("rejects requests without a valid API key", async () => {
    const response = await request(app).get("/v1/agents");
    expect(response.status).toBe(401);
  });

  // Asserts containment, not exact length/set: this suite runs against the real shared Postgres
  // alongside other workspaces' test suites (e.g. apps/worker creates its own scratch AgentConfig
  // rows), so exact-count assertions are flaky under concurrent `turbo test` runs.
  it("returns at least the 6 seeded agent configs with mode/provider fields", async () => {
    const response = await request(app).get("/v1/agents").set(AUTH_HEADERS);

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

describe("GET /v1/agents/:name", () => {
  it("404s for an unknown agent", async () => {
    const response = await request(app).get("/v1/agents/does-not-exist").set(AUTH_HEADERS);
    expect(response.status).toBe(404);
  });

  it("returns a single agent config by name", async () => {
    const response = await request(app).get("/v1/agents/demo-cascade").set(AUTH_HEADERS);
    expect(response.status).toBe(200);
    expect(response.body.name).toBe("demo-cascade");
  });
});

describe("POST /v1/agents", () => {
  it("creates a new agent config with only the required fields", async () => {
    const name = uniqueName();
    const response = await request(app)
      .post("/v1/agents")
      .set(AUTH_HEADERS)
      .send({ name, voiceMode: "cascade", prompt: "You are helpful." });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name, voiceMode: "cascade", enableShortFirstResponse: false, isActive: true });
  });

  it("rejects a duplicate name with 409", async () => {
    const name = uniqueName();
    await request(app).post("/v1/agents").set(AUTH_HEADERS).send({ name, voiceMode: "cascade", prompt: "x" });

    const response = await request(app)
      .post("/v1/agents")
      .set(AUTH_HEADERS)
      .send({ name, voiceMode: "cascade", prompt: "x" });

    expect(response.status).toBe(409);
  });

  it("rejects an invalid voiceMode with 422", async () => {
    const response = await request(app)
      .post("/v1/agents")
      .set(AUTH_HEADERS)
      .send({ name: uniqueName(), voiceMode: "not-a-real-mode", prompt: "x" });

    expect(response.status).toBe(422);
  });
});

describe("PATCH /v1/agents/:name", () => {
  it("updates a field and leaves others untouched", async () => {
    const name = uniqueName();
    await request(app)
      .post("/v1/agents")
      .set(AUTH_HEADERS)
      .send({ name, voiceMode: "cascade", prompt: "original", ttsProvider: "elevenlabs" });

    const response = await request(app)
      .patch(`/v1/agents/${name}`)
      .set(AUTH_HEADERS)
      .send({ ttsProvider: "cartesia" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ttsProvider: "cartesia", prompt: "original" });
  });

  it("404s updating an unknown agent", async () => {
    const response = await request(app).patch("/v1/agents/does-not-exist").set(AUTH_HEADERS).send({ prompt: "x" });
    expect(response.status).toBe(404);
  });

  it("accepts null to explicitly clear a field — omitting it means leave unchanged, null means clear", async () => {
    const name = uniqueName();
    await request(app)
      .post("/v1/agents")
      .set(AUTH_HEADERS)
      .send({ name, voiceMode: "realtime", prompt: "x", s2sProvider: "gemini", s2sModel: "gemini-live" });

    // Switching to cascade must be able to null out the realtime-only fields, not just omit them.
    const response = await request(app)
      .patch(`/v1/agents/${name}`)
      .set(AUTH_HEADERS)
      .send({ voiceMode: "cascade", s2sProvider: null, s2sModel: null, sttProvider: "deepgram" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ voiceMode: "cascade", s2sProvider: null, s2sModel: null });
  });
});
