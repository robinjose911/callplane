import { AccessToken } from "livekit-server-sdk";
import { createLiveKitRoomManager, type LiveKitClientConfig } from "./room-manager.js";

export interface BrowserRoomInfo {
  roomName: string;
  participantToken: string;
  livekitUrl: string;
}

/** Identity used for the browser participant's own join token — distinct from the agent's. */
const USER_IDENTITY = "user";

/** Matches PLAN.md's stated TTL for the browser-call join token. */
const TOKEN_TTL_SECONDS = 10 * 60;

function getLiveKitConfigFromEnv(): LiveKitClientConfig | undefined {
  const livekitUrl = process.env["LIVEKIT_URL"];
  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  if (!livekitUrl || !apiKey || !apiSecret) return undefined;
  return { livekitUrl, apiKey, apiSecret };
}

/**
 * Creates the LiveKit room for a browser-channel call and mints a `user`-identity join token,
 * synchronously at `POST /v1/calls` time — the browser can connect immediately without waiting
 * for the worker's async `call-executor` job to pick up the call. Room creation is idempotent
 * (LiveKit's CreateRoom returns the existing room when called again with the same name), so
 * `RealCallRunner` creating the same room later (see real-call-runner.ts) is safe.
 *
 * Only runs when `CALL_RUNNER=livekit` — the same gate `buildCallRunner` uses — because
 * otherwise the worker never creates a real room or joins a real voice session, and a browser
 * client would connect to an empty room with nothing on the other end.
 */
export async function prepareBrowserCallRoom(callSid: string): Promise<BrowserRoomInfo | undefined> {
  if (process.env["CALL_RUNNER"] !== "livekit") return undefined;
  const config = getLiveKitConfigFromEnv();
  if (!config) return undefined;

  const roomManager = createLiveKitRoomManager(config);
  const { roomName } = await roomManager.createRoom(callSid, { callSid });

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: USER_IDENTITY,
    ttl: TOKEN_TTL_SECONDS,
  });
  token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });
  const participantToken = await token.toJwt();

  return { roomName, participantToken, livekitUrl: config.livekitUrl };
}
