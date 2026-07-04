import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StubScenario } from "@callplane/contracts";

class FakeRoom {
  isConnected = false;
  localParticipant = {
    publishTranscription: vi.fn().mockResolvedValue(undefined),
    publishData: vi.fn().mockResolvedValue(undefined),
  };
  private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  on(event: string, handler: (...args: unknown[]) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    if (event === "disconnected") this.isConnected = false;
    for (const h of this.handlers[event] ?? []) h(...args);
  }

  connect = vi.fn().mockImplementation(async () => {
    this.isConnected = true;
  });

  disconnect = vi.fn().mockImplementation(async () => {
    this.isConnected = false;
  });
}

let lastRoom: FakeRoom | undefined;

vi.mock("@livekit/rtc-node", () => ({
  Room: vi.fn().mockImplementation(() => {
    lastRoom = new FakeRoom();
    return lastRoom;
  }),
  RoomEvent: { DataReceived: "dataReceived", Disconnected: "disconnected" },
}));

vi.mock("livekit-server-sdk", () => ({
  AccessToken: vi.fn().mockImplementation(() => ({
    addGrant: vi.fn(),
    toJwt: vi.fn().mockResolvedValue("fake-jwt"),
  })),
}));

const { StubVoiceSession } = await import("../lib/stub-voice-session.js");

function config() {
  return { livekitUrl: "ws://localhost:7880", apiKey: "devkey", apiSecret: "secret", roomName: "room-1", callSid: "call-1" };
}

function scenario(overrides: Partial<StubScenario> = {}): StubScenario {
  return {
    name: "test",
    outcome: "completed",
    turns: [
      { role: "agent", text: "Hello!", delayMs: 100 },
      { role: "user", text: "Hi there", delayMs: 100 },
      { role: "agent", text: "Great, bye!", delayMs: 100 },
    ],
    ...overrides,
  };
}

describe("StubVoiceSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects to the room, then walks DIALING -> RINGING -> IN_PROGRESS -> COMPLETED for a completed scenario", async () => {
    const session = new StubVoiceSession(config());
    const transitions: string[] = [];

    const run = session.run(scenario(), async (t) => {
      transitions.push(t.eventType);
      if (t.status) transitions.push(`status:${t.status}`);
    });

    await vi.runAllTimersAsync();
    await run;

    expect(lastRoom?.connect).toHaveBeenCalledWith("ws://localhost:7880", "fake-jwt", expect.any(Object));
    expect(transitions).toEqual([
      "call_dialing",
      "status:DIALING",
      "call_ringing",
      "status:RINGING",
      "call_in_progress",
      "status:IN_PROGRESS",
      "transcript_turn",
      "transcript_turn",
      "transcript_turn",
      "call_completed",
      "status:COMPLETED",
    ]);
  });

  it("publishes each turn as a transcription segment and a data-channel event, in order", async () => {
    const session = new StubVoiceSession(config());
    const run = session.run(scenario(), async () => {});

    await vi.runAllTimersAsync();
    await run;

    expect(lastRoom?.localParticipant.publishTranscription).toHaveBeenCalledTimes(3);
    const texts = (lastRoom?.localParticipant.publishTranscription as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => (call[0] as { segments: { text: string }[] }).segments[0]?.text,
    );
    expect(texts).toEqual(["Hello!", "Hi there", "Great, bye!"]);
  });

  it("short-circuits a user turn's delay the instant a user_spoke data message arrives", async () => {
    const session = new StubVoiceSession(config());
    const transitions: string[] = [];
    const run = session.run(scenario(), async (t) => {
      transitions.push(t.eventType);
    });

    // Let the agent's first turn (100ms) elapse, landing us waiting on the user turn.
    await vi.advanceTimersByTimeAsync(100);
    expect(transitions.filter((e) => e === "transcript_turn")).toHaveLength(1);

    // Fire user_spoke well before the user turn's own 100ms delay would elapse.
    lastRoom?.emit("dataReceived", new TextEncoder().encode(JSON.stringify({ type: "user_spoke" })), undefined, undefined, "callplane-events");
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();

    expect(transitions.filter((e) => e === "transcript_turn")).toHaveLength(2);

    await vi.runAllTimersAsync();
    await run;
  });

  it("ends with CALL_DROPPED when the room disconnects mid-scenario", async () => {
    const session = new StubVoiceSession(config());
    const transitions: Array<{ eventType: string; status?: string }> = [];
    const run = session.run(scenario(), async (t) => {
      transitions.push({ eventType: t.eventType, ...(t.status ? { status: t.status } : {}) });
    });

    // Let the first agent turn play, then simulate an unexpected disconnect before the user turn.
    await vi.advanceTimersByTimeAsync(100);
    lastRoom?.emit("disconnected");
    await vi.advanceTimersByTimeAsync(1);
    await run;

    expect(transitions.at(-1)).toEqual({ eventType: "call_dropped", status: "CALL_DROPPED" });
  });

  it("reports CALL_DROPPED, not a false COMPLETED, when a scenario-less call disconnects after IN_PROGRESS", async () => {
    const session = new StubVoiceSession(config());
    const transitions: Array<{ eventType: string; status?: string }> = [];

    const run = session.run(undefined, async (t) => {
      transitions.push({ eventType: t.eventType, ...(t.status ? { status: t.status } : {}) });
      // No scenario means no turn loop to interleave a disconnect into — simulate the room
      // dropping the instant the call reaches IN_PROGRESS, before any turns could run.
      if (t.eventType === "call_in_progress") {
        lastRoom?.emit("disconnected");
      }
    });

    await run;

    expect(transitions.at(-1)).toEqual({ eventType: "call_dropped", status: "CALL_DROPPED" });
    expect(transitions.map((t) => t.status)).not.toContain("COMPLETED");
  });

  it.each(["busy", "no_answer", "trunk_failure"] as const)(
    "for outcome=%s, never reaches IN_PROGRESS and ends in the matching terminal status",
    async (outcome) => {
      const session = new StubVoiceSession(config());
      const statuses: string[] = [];
      const run = session.run(scenario({ outcome, turns: scenario().turns }), async (t) => {
        if (t.status) statuses.push(t.status);
      });

      await vi.runAllTimersAsync();
      await run;

      expect(statuses).not.toContain("IN_PROGRESS");
      const expectedTerminal = outcome === "busy" ? "BUSY" : outcome === "no_answer" ? "NO_ANSWER" : "FAILED";
      expect(statuses.at(-1)).toBe(expectedTerminal);
    },
  );

  it("disconnects from the room after the scenario ends", async () => {
    const session = new StubVoiceSession(config());
    const run = session.run(scenario(), async () => {});

    await vi.runAllTimersAsync();
    await run;

    expect(lastRoom?.disconnect).toHaveBeenCalledTimes(1);
  });
});
