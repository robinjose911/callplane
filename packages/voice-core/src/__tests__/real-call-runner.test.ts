import { describe, expect, it, vi } from "vitest";
import type { LiveKitRoomManager } from "../lib/room-manager.js";

const runMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/stub-voice-session.js", () => ({
  StubVoiceSession: vi.fn().mockImplementation((config: unknown) => ({
    run: (...args: unknown[]) => runMock(config, ...args),
  })),
}));

const { RealCallRunner } = await import("../lib/real-call-runner.js");

function fakeRoomManager(overrides: Partial<LiveKitRoomManager> = {}): LiveKitRoomManager {
  return {
    createRoom: vi.fn().mockImplementation(async (callSid: string) => ({ roomName: callSid, roomSid: "RM_abc" })),
    deleteRoom: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const liveKitConfig = { livekitUrl: "ws://localhost:7880", apiKey: "devkey", apiSecret: "secret" };

describe("RealCallRunner", () => {
  it("creates the room, runs the session inside it, then deletes the room", async () => {
    const roomManager = fakeRoomManager();
    const runner = new RealCallRunner("call-1", roomManager, liveKitConfig);
    const onTransition = vi.fn().mockResolvedValue(undefined);

    await runner.run(undefined, onTransition);

    expect(roomManager.createRoom).toHaveBeenCalledWith("call-1", { callSid: "call-1" });
    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ ...liveKitConfig, roomName: "call-1", callSid: "call-1" }),
      undefined,
      onTransition,
      { alreadyInProgress: false, waitForParticipantIdentity: "user" },
    );
    expect(roomManager.deleteRoom).toHaveBeenCalledWith("call-1");
  });

  it("still deletes the room even when the session throws", async () => {
    runMock.mockRejectedValueOnce(new Error("session blew up"));
    const roomManager = fakeRoomManager();
    const runner = new RealCallRunner("call-2", roomManager, liveKitConfig);

    await expect(runner.run(undefined, vi.fn())).rejects.toThrow("session blew up");
    expect(roomManager.deleteRoom).toHaveBeenCalledWith("call-2");
  });

  it("does not throw if room deletion itself fails — cleanup failure shouldn't mask the real result", async () => {
    const roomManager = fakeRoomManager({ deleteRoom: vi.fn().mockRejectedValue(new Error("delete failed")) });
    const runner = new RealCallRunner("call-3", roomManager, liveKitConfig);

    await expect(runner.run(undefined, vi.fn())).resolves.toBeUndefined();
  });

  describe("SIP channel", () => {
    function trunk(id: string): { id: string; provider: string; livekitTrunkId: string; credentialsRef: string; maxConcurrentCalls: number; weight: number } {
      return { id, provider: "generic", livekitTrunkId: `lk-${id}`, credentialsRef: "TEST_CREDS", maxConcurrentCalls: 5, weight: 100 };
    }

    function fakeTrunkSelector(overrides: Partial<{ selectTrunk: unknown; releaseTrunk: unknown }> = {}) {
      return {
        selectTrunk: vi.fn(),
        releaseTrunk: vi.fn().mockResolvedValue(undefined),
        getActiveCount: vi.fn().mockResolvedValue(0),
        ...overrides,
      };
    }

    it("an answered dial transitions DIALING -> RINGING -> IN_PROGRESS, then runs the voice session", async () => {
      const roomManager = fakeRoomManager();
      const trunkA = trunk("trunk-a");
      const trunkSelector = fakeTrunkSelector({
        selectTrunk: vi.fn().mockResolvedValue({ id: trunkA.id, provider: trunkA.provider, livekitTrunkId: trunkA.livekitTrunkId, credentialsRef: trunkA.credentialsRef }),
      });
      const sipDialer = { dialOut: vi.fn().mockResolvedValue({ outcome: "answered", participantSid: "sip-1" }) };
      const runner = new RealCallRunner("call-sip-1", roomManager, liveKitConfig, "sip", {
        toNumber: "+15550000000",
        trunks: [trunkA],
        trunkSelector: trunkSelector as never,
        sipDialer: sipDialer as never,
      });
      const transitions: string[] = [];
      runMock.mockClear();

      await runner.run(undefined, async (t) => {
        transitions.push(t.status ?? t.eventType);
      });

      expect(transitions.slice(0, 3)).toEqual(["DIALING", "RINGING", "IN_PROGRESS"]);
      expect(runMock).toHaveBeenCalled();
      // The voice session must be told the call is already IN_PROGRESS — otherwise it re-emits
      // its own DIALING step, an illegal IN_PROGRESS -> DIALING transition.
      expect(runMock.mock.calls.at(-1)?.[3]).toEqual({ alreadyInProgress: true });
      // Slot stays held through the call, released only during cleanup.
      expect(trunkSelector.releaseTrunk).toHaveBeenCalledWith(trunkA.id);
    });

    it("busy ends the call BUSY without running the voice session, and releases the trunk slot", async () => {
      const roomManager = fakeRoomManager();
      const trunkA = trunk("trunk-a");
      const trunkSelector = fakeTrunkSelector({
        selectTrunk: vi.fn().mockResolvedValue({ id: trunkA.id, provider: trunkA.provider, livekitTrunkId: trunkA.livekitTrunkId, credentialsRef: trunkA.credentialsRef }),
      });
      const sipDialer = { dialOut: vi.fn().mockResolvedValue({ outcome: "busy" }) };
      const runner = new RealCallRunner("call-sip-2", roomManager, liveKitConfig, "sip", {
        toNumber: "+15550000001",
        trunks: [trunkA],
        trunkSelector: trunkSelector as never,
        sipDialer: sipDialer as never,
      });
      const transitions: Array<{ status?: string; eventType: string }> = [];
      runMock.mockClear();

      await runner.run(undefined, async (t) => {
        transitions.push({ eventType: t.eventType, ...(t.status ? { status: t.status } : {}) });
      });

      expect(transitions.at(-1)).toMatchObject({ status: "BUSY" });
      expect(runMock).not.toHaveBeenCalled();
      expect(trunkSelector.releaseTrunk).toHaveBeenCalledWith(trunkA.id);
    });

    it("no_answer ends the call NO_ANSWER without running the voice session", async () => {
      const roomManager = fakeRoomManager();
      const trunkA = trunk("trunk-a");
      const trunkSelector = fakeTrunkSelector({
        selectTrunk: vi.fn().mockResolvedValue({ id: trunkA.id, provider: trunkA.provider, livekitTrunkId: trunkA.livekitTrunkId, credentialsRef: trunkA.credentialsRef }),
      });
      const sipDialer = { dialOut: vi.fn().mockResolvedValue({ outcome: "no_answer" }) };
      const runner = new RealCallRunner("call-sip-3", roomManager, liveKitConfig, "sip", {
        toNumber: "+15550000002",
        trunks: [trunkA],
        trunkSelector: trunkSelector as never,
        sipDialer: sipDialer as never,
      });
      const transitions: Array<{ status?: string }> = [];
      runMock.mockClear();

      await runner.run(undefined, async (t) => {
        transitions.push({ ...(t.status ? { status: t.status } : {}) });
      });

      expect(transitions.at(-1)).toMatchObject({ status: "NO_ANSWER" });
      expect(runMock).not.toHaveBeenCalled();
    });

    it("a trunk-level failure releases the first trunk's slot and tries the second trunk, which answers", async () => {
      const { SipTrunkError } = await import("../lib/sip-dialer.js");
      const roomManager = fakeRoomManager();
      const trunkA = trunk("trunk-a");
      const trunkB = trunk("trunk-b");
      const trunkSelector = fakeTrunkSelector({
        selectTrunk: vi
          .fn()
          .mockResolvedValueOnce({ id: trunkA.id, provider: trunkA.provider, livekitTrunkId: trunkA.livekitTrunkId, credentialsRef: trunkA.credentialsRef })
          .mockResolvedValueOnce({ id: trunkB.id, provider: trunkB.provider, livekitTrunkId: trunkB.livekitTrunkId, credentialsRef: trunkB.credentialsRef }),
      });
      const sipDialer = {
        dialOut: vi
          .fn()
          .mockRejectedValueOnce(new SipTrunkError("carrier rejected the call"))
          .mockResolvedValueOnce({ outcome: "answered", participantSid: "sip-2" }),
      };
      const runner = new RealCallRunner("call-sip-4", roomManager, liveKitConfig, "sip", {
        toNumber: "+15550009999",
        trunks: [trunkA, trunkB],
        trunkSelector: trunkSelector as never,
        sipDialer: sipDialer as never,
      });
      const events: Array<{ eventType: string; payload?: unknown }> = [];
      runMock.mockClear();

      await runner.run(undefined, async (t) => {
        events.push({ eventType: t.eventType, ...(t.payload ? { payload: t.payload } : {}) });
      });

      expect(sipDialer.dialOut).toHaveBeenCalledTimes(2);
      expect(trunkSelector.releaseTrunk).toHaveBeenCalledWith(trunkA.id);
      expect(events).toContainEqual(
        expect.objectContaining({ eventType: "failover_triggered", payload: expect.objectContaining({ failedTrunkId: trunkA.id }) }),
      );
      expect(runMock).toHaveBeenCalled(); // voice session ran after the second trunk answered
    });

    it("when every trunk fails at the trunk level, ends with a typed call_initiation_failure and per-attempt events", async () => {
      const { SipTrunkError } = await import("../lib/sip-dialer.js");
      const roomManager = fakeRoomManager();
      const trunkA = trunk("trunk-a");
      const trunkB = trunk("trunk-b");
      const trunkSelector = fakeTrunkSelector({
        selectTrunk: vi
          .fn()
          .mockResolvedValueOnce({ id: trunkA.id, provider: trunkA.provider, livekitTrunkId: trunkA.livekitTrunkId, credentialsRef: trunkA.credentialsRef })
          .mockResolvedValueOnce({ id: trunkB.id, provider: trunkB.provider, livekitTrunkId: trunkB.livekitTrunkId, credentialsRef: trunkB.credentialsRef }),
      });
      const sipDialer = {
        dialOut: vi
          .fn()
          .mockRejectedValueOnce(new SipTrunkError("trunk A down"))
          .mockRejectedValueOnce(new SipTrunkError("trunk B down")),
      };
      const runner = new RealCallRunner("call-sip-5", roomManager, liveKitConfig, "sip", {
        toNumber: "+15550009998",
        trunks: [trunkA, trunkB],
        trunkSelector: trunkSelector as never,
        sipDialer: sipDialer as never,
      });
      const events: Array<{ eventType: string; status?: string; payload?: unknown }> = [];
      runMock.mockClear();

      await runner.run(undefined, async (t) => {
        events.push({ eventType: t.eventType, ...(t.status ? { status: t.status } : {}), ...(t.payload ? { payload: t.payload } : {}) });
      });

      const failoverEvents = events.filter((e) => e.eventType === "failover_triggered");
      expect(failoverEvents).toHaveLength(2);
      expect(events.at(-1)).toMatchObject({
        eventType: "call_initiation_failure",
        status: "FAILED",
        payload: { reason: "trunk_unavailable" },
      });
      expect(runMock).not.toHaveBeenCalled();
    });
  });
});
