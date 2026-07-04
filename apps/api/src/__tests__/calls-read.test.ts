import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import {
  seed,
  prisma,
  createCallRepository,
  createCallEventRepository,
  AGENT_CONFIG_NAMES,
} from "@callplane/database";
import { createApp } from "../app.js";

const API_KEY = "test-api-key";
const mockQueue = { add: vi.fn().mockResolvedValue(undefined) };

function appWithMockQueue() {
  return createApp({ callExecutorQueue: mockQueue as never });
}

describe("GET /v1/calls*", () => {
  const originalApiKey = process.env["CALLPLANE_API_KEY"];
  const callRepo = createCallRepository(prisma);
  const callEventRepo = createCallEventRepository(prisma);
  const callSids: string[] = [];

  beforeAll(async () => {
    process.env["CALLPLANE_API_KEY"] = API_KEY;
    await seed();
  });

  afterAll(async () => {
    if (originalApiKey === undefined) delete process.env["CALLPLANE_API_KEY"];
    else process.env["CALLPLANE_API_KEY"] = originalApiKey;
    await prisma.callEvent.deleteMany({ where: { callSid: { in: callSids } } });
    await prisma.call.deleteMany({ where: { callSid: { in: callSids } } });
  });

  function newCallSid(): string {
    const sid = crypto.randomUUID();
    callSids.push(sid);
    return sid;
  }

  describe("GET /v1/calls/:callSid", () => {
    it("404s for an unknown callSid", async () => {
      const response = await request(appWithMockQueue())
        .get(`/v1/calls/${crypto.randomUUID()}`)
        .set("Authorization", `Bearer ${API_KEY}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns the call summary for a known callSid", async () => {
      const callSid = newCallSid();
      await callRepo.create({ callSid, agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "browser" });

      const response = await request(appWithMockQueue())
        .get(`/v1/calls/${callSid}`)
        .set("Authorization", `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        callSid,
        agentId: AGENT_CONFIG_NAMES.CASCADE,
        channel: "browser",
        status: "QUEUED",
      });
    });
  });

  describe("GET /v1/calls/:callSid/events", () => {
    it("404s for an unknown callSid", async () => {
      const response = await request(appWithMockQueue())
        .get(`/v1/calls/${crypto.randomUUID()}/events`)
        .set("Authorization", `Bearer ${API_KEY}`);

      expect(response.status).toBe(404);
    });

    it("returns events in append (chronological) order", async () => {
      const callSid = newCallSid();
      await callRepo.create({ callSid, agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "browser" });
      await callEventRepo.append({ callSid, eventType: "call_queued" });
      await callEventRepo.append({ callSid, eventType: "call_dialing" });
      await callEventRepo.append({ callSid, eventType: "call_completed" });

      const response = await request(appWithMockQueue())
        .get(`/v1/calls/${callSid}/events`)
        .set("Authorization", `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.events.map((e: { eventType: string }) => e.eventType)).toEqual([
        "call_queued",
        "call_dialing",
        "call_completed",
      ]);
    });

    it("respects page/limit bounds", async () => {
      const callSid = newCallSid();
      await callRepo.create({ callSid, agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "browser" });
      for (let i = 0; i < 5; i++) {
        await callEventRepo.append({ callSid, eventType: `event_${i}` });
      }

      const response = await request(appWithMockQueue())
        .get(`/v1/calls/${callSid}/events?page=2&limit=2`)
        .set("Authorization", `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.events.map((e: { eventType: string }) => e.eventType)).toEqual(["event_2", "event_3"]);
      expect(response.body).toMatchObject({ page: 2, limit: 2 });
    });
  });

  describe("GET /v1/calls", () => {
    it("filters by status", async () => {
      const completedSid = newCallSid();
      const failedSid = newCallSid();
      await callRepo.create({ callSid: completedSid, agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "browser" });
      await callRepo.updateStatus(completedSid, "COMPLETED");
      await callRepo.create({ callSid: failedSid, agentId: AGENT_CONFIG_NAMES.CASCADE, channel: "browser" });
      await callRepo.updateStatus(failedSid, "FAILED");

      const response = await request(appWithMockQueue())
        .get("/v1/calls?status=COMPLETED&limit=100")
        .set("Authorization", `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      const sids = response.body.calls.map((c: { callSid: string }) => c.callSid);
      expect(sids).toContain(completedSid);
      expect(sids).not.toContain(failedSid);
    });

    it("rejects an invalid status filter", async () => {
      const response = await request(appWithMockQueue())
        .get("/v1/calls?status=NOT_A_STATUS")
        .set("Authorization", `Bearer ${API_KEY}`);

      expect(response.status).toBe(422);
    });
  });
});
