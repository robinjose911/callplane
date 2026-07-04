import { RoomServiceClient, RoomAgentDispatch, type CreateOptions } from "livekit-server-sdk";

/** Call context stored as JSON in the LiveKit room metadata. */
export interface RoomMetadata {
  callSid: string;
  agentId?: string;
  dynamicVariables?: Record<string, string>;
}

export interface CreateRoomResult {
  roomName: string;
  roomSid: string;
}

export interface LiveKitRoomManager {
  /** Creates a LiveKit room named by `callSid` with the call context in metadata. */
  createRoom(callSid: string, metadata: RoomMetadata): Promise<CreateRoomResult>;
  /** Deletes a LiveKit room — called on cleanup/failure paths to avoid orphaned rooms. */
  deleteRoom(roomName: string): Promise<void>;
}

/** Agent name used for explicit dispatch — must match the agentName the worker registers. */
export const LIVEKIT_AGENT_NAME = "callplane-voice-agent";

export interface LiveKitClientConfig {
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Factory for a LiveKit room manager. Room name = `callSid` (UUID v4) — globally unique per call.
 */
export function createLiveKitRoomManager(config: LiveKitClientConfig): LiveKitRoomManager {
  const client = new RoomServiceClient(config.livekitUrl, config.apiKey, config.apiSecret);

  return {
    async createRoom(callSid, metadata): Promise<CreateRoomResult> {
      const options: CreateOptions = {
        name: callSid,
        // Auto-delete an empty room after 5 minutes — avoids orphans if the agent never joins.
        emptyTimeout: 5 * 60,
        // Keep the room alive 2 minutes after the last participant leaves, so a slightly-delayed
        // agent join doesn't race the room's own teardown.
        departureTimeout: 2 * 60,
        metadata: JSON.stringify(metadata),
        agents: [new RoomAgentDispatch({ agentName: LIVEKIT_AGENT_NAME })],
      };

      const room = await client.createRoom(options);
      return { roomName: room.name, roomSid: room.sid };
    },

    async deleteRoom(roomName): Promise<void> {
      await client.deleteRoom(roomName);
    },
  };
}
