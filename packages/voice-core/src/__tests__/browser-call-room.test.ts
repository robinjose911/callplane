import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRoomMock = vi.fn();
let lastAccessTokenArgs: unknown[] | undefined;
let lastGrant: Record<string, unknown> | undefined;

vi.mock("livekit-server-sdk", () => ({
  RoomServiceClient: vi.fn().mockImplementation(() => ({
    createRoom: createRoomMock,
  })),
  AccessToken: vi.fn().mockImplementation((...args: unknown[]) => {
    lastAccessTokenArgs = args;
    return {
      addGrant: vi.fn((grant: Record<string, unknown>) => {
        lastGrant = grant;
      }),
      toJwt: vi.fn().mockResolvedValue("fake-jwt"),
    };
  }),
  RoomAgentDispatch: vi.fn().mockImplementation((opts: unknown) => opts),
}));

const { prepareBrowserCallRoom } = await import("../lib/browser-call-room.js");

const ENV_KEYS = ["CALL_RUNNER", "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;
let savedEnv: Record<string, string | undefined>;

describe("prepareBrowserCallRoom", () => {
  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    createRoomMock.mockReset().mockResolvedValue({ name: "call-1", sid: "RM_abc" });
    lastAccessTokenArgs = undefined;
    lastGrant = undefined;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it("returns undefined when CALL_RUNNER is not \"livekit\"", async () => {
    delete process.env["CALL_RUNNER"];
    process.env["LIVEKIT_URL"] = "ws://localhost:7880";
    process.env["LIVEKIT_API_KEY"] = "devkey";
    process.env["LIVEKIT_API_SECRET"] = "secret";

    const result = await prepareBrowserCallRoom("call-1");

    expect(result).toBeUndefined();
    expect(createRoomMock).not.toHaveBeenCalled();
  });

  it("returns undefined when LiveKit env vars are missing, even with CALL_RUNNER=livekit", async () => {
    process.env["CALL_RUNNER"] = "livekit";
    delete process.env["LIVEKIT_URL"];
    delete process.env["LIVEKIT_API_KEY"];
    delete process.env["LIVEKIT_API_SECRET"];

    const result = await prepareBrowserCallRoom("call-1");

    expect(result).toBeUndefined();
  });

  it("creates the room and mints a user-identity token scoped to exactly that room", async () => {
    process.env["CALL_RUNNER"] = "livekit";
    process.env["LIVEKIT_URL"] = "ws://localhost:7880";
    process.env["LIVEKIT_API_KEY"] = "devkey";
    process.env["LIVEKIT_API_SECRET"] = "secret";

    const result = await prepareBrowserCallRoom("call-1");

    expect(createRoomMock).toHaveBeenCalledWith(expect.objectContaining({ name: "call-1" }));
    expect(result).toEqual({ roomName: "call-1", participantToken: "fake-jwt", livekitUrl: "ws://localhost:7880" });
    expect(lastAccessTokenArgs?.[2]).toMatchObject({ identity: "user" });
    expect(lastGrant).toMatchObject({ room: "call-1", roomJoin: true });
  });
});
