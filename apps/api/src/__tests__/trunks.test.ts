import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma, createSipTrunkRepository } from "@callplane/database";
import { createApp } from "../app.js";

const API_KEY = "test-api-key";
const AUTH_HEADERS = { Authorization: `Bearer ${API_KEY}` };
const sipTrunkRepo = createSipTrunkRepository(prisma);
const app = createApp();

const createdTrunkNames: string[] = [];

function uniqueName(): string {
  const name = `test-trunk-${crypto.randomUUID()}`;
  createdTrunkNames.push(name);
  return name;
}

beforeAll(() => {
  process.env["CALLPLANE_API_KEY"] = API_KEY;
});

afterAll(async () => {
  await prisma.sipTrunk.deleteMany({ where: { name: { in: createdTrunkNames } } });
});

describe("SIP trunk admin API", () => {
  it("rejects every route without a valid API key", async () => {
    const getRes = await request(app).get("/v1/trunks");
    const postRes = await request(app).post("/v1/trunks").send({});
    expect(getRes.status).toBe(401);
    expect(postRes.status).toBe(401);
  });

  it("creates a trunk, then reads it back with credentialsRef redacted", async () => {
    const name = uniqueName();
    const createRes = await request(app)
      .post("/v1/trunks")
      .set(AUTH_HEADERS)
      .send({ name, provider: "telnyx", livekitTrunkId: "lk-trunk-1", credentialsRef: "TELNYX_PROD_KEY" });

    expect(createRes.status).toBe(200);
    expect(createRes.body).toMatchObject({ name, provider: "telnyx", credentialsRef: "****" });
    expect(createRes.body.credentialsRef).not.toBe("TELNYX_PROD_KEY");

    const listRes = await request(app).get("/v1/trunks").set(AUTH_HEADERS);
    const listed = listRes.body.trunks.find((t: { name: string }) => t.name === name);
    expect(listed.credentialsRef).toBe("****");

    const getRes = await request(app).get(`/v1/trunks/${name}`).set(AUTH_HEADERS);
    expect(getRes.body.credentialsRef).toBe("****");

    // The raw credentialsRef never left the DB — confirm it directly against the repository the
    // route is built on, proving the redaction happens at the API boundary, not by losing data.
    const raw = await sipTrunkRepo.findByName(name);
    expect(raw?.credentialsRef).toBe("TELNYX_PROD_KEY");
  });

  it("rejects an invalid provider value with 422", async () => {
    const res = await request(app)
      .post("/v1/trunks")
      .set(AUTH_HEADERS)
      .send({ name: uniqueName(), provider: "not-a-real-provider", livekitTrunkId: "lk-x", credentialsRef: "X" });

    expect(res.status).toBe(422);
  });

  it("404s reading an unknown trunk", async () => {
    const res = await request(app).get("/v1/trunks/does-not-exist").set(AUTH_HEADERS);
    expect(res.status).toBe(404);
  });

  it("updates a trunk's maxConcurrentCalls via PATCH", async () => {
    const name = uniqueName();
    await sipTrunkRepo.create({ name, provider: "generic", livekitTrunkId: "lk-x", credentialsRef: "X", maxConcurrentCalls: 5 });

    const res = await request(app).patch(`/v1/trunks/${name}`).set(AUTH_HEADERS).send({ maxConcurrentCalls: 10 });

    expect(res.status).toBe(200);
    expect(res.body.maxConcurrentCalls).toBe(10);
  });

  it("toggles isActive via /:name/status, idempotently", async () => {
    const name = uniqueName();
    await sipTrunkRepo.create({ name, provider: "generic", livekitTrunkId: "lk-x", credentialsRef: "X", isActive: false });

    const activate = await request(app).patch(`/v1/trunks/${name}/status`).set(AUTH_HEADERS).send({ isActive: true });
    expect(activate.body.isActive).toBe(true);

    // Calling it again with the same value is a no-op, not an error — idempotent.
    const activateAgain = await request(app).patch(`/v1/trunks/${name}/status`).set(AUTH_HEADERS).send({ isActive: true });
    expect(activateAgain.status).toBe(200);
    expect(activateAgain.body.isActive).toBe(true);

    const deactivate = await request(app).patch(`/v1/trunks/${name}/status`).set(AUTH_HEADERS).send({ isActive: false });
    expect(deactivate.body.isActive).toBe(false);
  });
});
