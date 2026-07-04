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
});
