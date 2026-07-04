import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "@callplane/database";
import { createApp } from "../app.js";

const API_KEY = "test-api-key";
const AUTH_HEADERS = { Authorization: `Bearer ${API_KEY}` };
const app = createApp();
const createdIds: string[] = [];

beforeAll(() => {
  process.env["CALLPLANE_API_KEY"] = API_KEY;
});

afterAll(async () => {
  await prisma.voiceModelOption.deleteMany({ where: { id: { in: createdIds } } });
});

describe("GET /v1/model-options", () => {
  it("rejects requests without a valid API key", async () => {
    const response = await request(app).get("/v1/model-options");
    expect(response.status).toBe(401);
  });

  it("filters by type when ?type= is given", async () => {
    const response = await request(app).get("/v1/model-options?type=llm").set(AUTH_HEADERS);
    expect(response.status).toBe(200);
    for (const option of response.body.modelOptions) {
      expect(option.modelType).toBe("llm");
    }
  });

  it("422s on an invalid type filter", async () => {
    const response = await request(app).get("/v1/model-options?type=not-a-real-type").set(AUTH_HEADERS);
    expect(response.status).toBe(422);
  });
});

describe("POST /v1/model-options", () => {
  it("adds a custom model option", async () => {
    const name = `test-custom-model-${crypto.randomUUID()}`;
    const response = await request(app).post("/v1/model-options").set(AUTH_HEADERS).send({ name, modelType: "llm" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name, modelType: "llm", isBuiltIn: false });
    createdIds.push(response.body.id);
  });

  it("is idempotent — re-adding the same name+type returns the same option, not an error", async () => {
    const name = `test-idempotent-model-${crypto.randomUUID()}`;
    const first = await request(app).post("/v1/model-options").set(AUTH_HEADERS).send({ name, modelType: "s2s" });
    createdIds.push(first.body.id);

    const second = await request(app).post("/v1/model-options").set(AUTH_HEADERS).send({ name, modelType: "s2s" });

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it("422s on a missing name", async () => {
    const response = await request(app).post("/v1/model-options").set(AUTH_HEADERS).send({ modelType: "llm" });
    expect(response.status).toBe(422);
  });
});
