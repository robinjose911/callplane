"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reduceTranscriptSegment, type TranscriptTurn } from "@/lib/transcript-reducer";

const DATA_TOPIC = "callplane-events";
const AGENT_IDENTITY = "agent";

/**
 * Mirrors packages/database/src/fixtures/stub-scenarios.ts's STUB_SCENARIO_NAMES — not exposed
 * via a contracts/API route since these are static demo fixtures, not database rows. Without a
 * scenario, StubVoiceSession has no scripted turns to walk and publishes no transcript at all.
 */
const STUB_SCENARIOS = ["demo_greeting", "demo_booking", "demo_failure"] as const;

interface AgentConfigResponse {
  name: string;
  voiceMode: string;
}

type CallState = "idle" | "connecting" | "connected" | "ended" | "error";

export function PlaygroundClient({ agents, stubMode }: { agents: AgentConfigResponse[]; stubMode: boolean }) {
  const [selectedAgent, setSelectedAgent] = useState(agents[0]?.name ?? "");
  const [selectedScenario, setSelectedScenario] = useState<string>(STUB_SCENARIOS[0]);
  const [state, setState] = useState<CallState>("idle");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const roomRef = useRef<Room | undefined>(undefined);

  useEffect(() => {
    if (state !== "connected") return;
    const start = Date.now();
    const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  async function handleStart() {
    setError(undefined);
    setTurns([]);
    setElapsedSeconds(0);
    setState("connecting");

    try {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent,
          channel: "browser",
          ...(stubMode ? { scenario: selectedScenario } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.participantToken || !body.livekitUrl) {
        setError(body.error?.message ?? "Failed to start call — is CALL_RUNNER=livekit set?");
        setState("error");
        return;
      }

      const room = new Room();
      roomRef.current = room;

      // Transcript content arrives over the reliable data channel, not LiveKit's track-scoped
      // caption API — StubVoiceSession never publishes an actual audio track, so a subscribing
      // browser client can't reliably receive captions attached to a nonexistent track.
      room.on(RoomEvent.DataReceived, (payload: Uint8Array, _participant, _kind, topic) => {
        if (topic !== DATA_TOPIC) return;
        const message = JSON.parse(new TextDecoder().decode(payload)) as {
          type?: string;
          role?: "agent" | "user";
          text?: string;
        };
        if (message.type === "transcript_turn" && message.role && message.text !== undefined) {
          const segment = { id: crypto.randomUUID(), text: message.text, final: true };
          setTurns((prev) => reduceTranscriptSegment(prev, segment, message.role!));
        }
        if (message.type === "call_ended" || message.type === "call_failed") {
          setState("ended");
        }
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setIsAgentSpeaking(speakers.some((s) => s.identity === AGENT_IDENTITY));
      });

      room.on(RoomEvent.Disconnected, () => {
        setState((prev) => (prev === "connected" ? "ended" : prev));
      });

      await room.connect(body.livekitUrl, body.participantToken);
      await room.localParticipant.setMicrophoneEnabled(true);
      setState("connected");
    } catch (err) {
      // Without this, a failed connect (or mic) attempt leaves roomRef pointing at a never-
      // disconnected Room — retrying "Start call" would then overwrite the ref with a new Room,
      // permanently orphaning the first connection's WebRTC/WS resources until page unload.
      await roomRef.current?.disconnect().catch(() => {});
      roomRef.current = undefined;
      setError(err instanceof Error ? err.message : "Failed to connect to the call.");
      setState("error");
    }
  }

  async function handleEndCall() {
    await roomRef.current?.disconnect();
    setState("ended");
  }

  async function handleStubUserTurn() {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: "user_spoke" })), {
      reliable: true,
      topic: DATA_TOPIC,
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="playground">
      {stubMode && (
        <Badge variant="secondary" data-testid="stub-mode-badge">
          stub mode
        </Badge>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Select value={selectedAgent} onValueChange={(value) => setSelectedAgent(value ?? "")}>
              <SelectTrigger data-testid="playground-agent-select" disabled={state === "connecting" || state === "connected"}>
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.name} value={agent.name}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {stubMode && (
              <Select value={selectedScenario} onValueChange={(value) => setSelectedScenario(value ?? STUB_SCENARIOS[0])}>
                <SelectTrigger
                  data-testid="playground-scenario-select"
                  disabled={state === "connecting" || state === "connected"}
                >
                  <SelectValue placeholder="Select a scenario" />
                </SelectTrigger>
                <SelectContent>
                  {STUB_SCENARIOS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {state === "connected" ? (
              <Button variant="destructive" onClick={handleEndCall} data-testid="end-call-button">
                End call
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                disabled={state === "connecting" || !selectedAgent}
                data-testid="start-call-button"
              >
                {state === "connecting" ? "Connecting..." : "Start call"}
              </Button>
            )}
          </div>

          {state === "connected" && (
            <div className="text-muted-foreground flex items-center gap-3 text-sm">
              <span data-testid="call-state">connected</span>
              <span data-testid="elapsed-timer">{elapsedSeconds}s</span>
              {isAgentSpeaking && <Badge data-testid="speaking-indicator">agent speaking</Badge>}
            </div>
          )}
          {state === "ended" && (
            <span data-testid="call-state" className="text-muted-foreground text-sm">
              call ended
            </span>
          )}

          {error && (
            <p role="alert" data-testid="playground-error" className="text-destructive text-sm">
              {error}
            </p>
          )}

          {stubMode && state === "connected" && (
            <Button variant="secondary" onClick={handleStubUserTurn} data-testid="stub-user-turn">
              Say scripted line
            </Button>
          )}

          <div className="flex flex-col gap-2" data-testid="transcript">
            {turns.map((turn, index) => (
              <div
                key={turn.id}
                data-testid={`turn-${index}`}
                data-role={turn.role}
                className={turn.role === "agent" ? "text-foreground" : "text-muted-foreground text-right"}
              >
                <span className="font-medium">{turn.role}: </span>
                {turn.text}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
