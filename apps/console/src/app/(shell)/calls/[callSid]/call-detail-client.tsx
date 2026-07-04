"use client";

import { useEffect, useState } from "react";
import { TERMINAL_CALL_STATUSES } from "@callplane/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const TERMINAL_STATUSES = new Set<string>(TERMINAL_CALL_STATUSES);

interface CallResponse {
  callSid: string;
  agentId: string;
  channel: string;
  toNumber: string | null;
  status: string;
  scenario: string | null;
  dynamicVariables: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

interface CallEventResponse {
  id: string;
  callSid: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface WebhookOutboxEntryResponse {
  id: string;
  callSid: string;
  webhookEndpointId: string;
  eventType: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CallCostResponse {
  id: string;
  callSid: string;
  provider: string;
  providerType: string;
  units: number;
  unitType: string;
  costAmount: number;
  currency: string;
  createdAt: string;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "COMPLETED") return "default";
  if (["FAILED", "NO_ANSWER", "BUSY", "CALL_DROPPED"].includes(status)) return "destructive";
  if (status === "QUEUED") return "outline";
  return "secondary";
}

export function CallDetailClient({
  initialCall,
  initialEvents,
  initialWebhookDeliveries,
  initialCosts,
  initialHasRecording,
}: {
  initialCall: CallResponse;
  initialEvents: CallEventResponse[];
  initialWebhookDeliveries: WebhookOutboxEntryResponse[];
  initialCosts: CallCostResponse[];
  initialHasRecording: boolean;
}) {
  const [call, setCall] = useState(initialCall);
  const [events, setEvents] = useState(initialEvents);
  const [webhookDeliveries, setWebhookDeliveries] = useState(initialWebhookDeliveries);
  const [costs, setCosts] = useState(initialCosts);
  const [hasRecording, setHasRecording] = useState(initialHasRecording);
  const [replayingId, setReplayingId] = useState<string | undefined>(undefined);
  const callSid = initialCall.callSid;

  const initialCallIsTerminal = TERMINAL_STATUSES.has(initialCall.status);
  // Bumped by handleReplay to force the stream effect below to reopen a connection even if it had
  // already closed — a manual replay can un-settle a previously-terminal call (a DELIVERED/DEAD
  // row goes back to PENDING), and unlike the old polling loop's dependency-array re-run, an SSE
  // effect keyed only on mount-time state has no other way to notice that.
  const [reconnectNonce, setReconnectNonce] = useState(0);

  // ADR 0004: SSE, not polling — the API's GET /v1/calls/:sid/stream route pushes a combined
  // snapshot (call/events/costs/webhookDeliveries/hasRecording) every ~1s server-side, deciding
  // itself when the call is "done" (terminal AND webhook deliveries settled or grace-period
  // exhausted — see call-stream-snapshot.ts, which carries forward the exact vacuous-truth and
  // grace-period lessons this file's polling loop used to encode here directly).
  useEffect(() => {
    // Only the initial mount skips opening a stream for an already-settled call — any later
    // reconnect (triggered by a replay) always opens one, since the whole point is to pick up
    // state that's no longer settled.
    if (reconnectNonce === 0 && initialCallIsTerminal) return;

    const source = new EventSource(`/api/calls/${callSid}/stream`);

    source.onmessage = (event) => {
      const snapshot = JSON.parse(event.data) as {
        call: CallResponse;
        events: CallEventResponse[];
        costs: CallCostResponse[];
        webhookDeliveries: WebhookOutboxEntryResponse[];
        hasRecording: boolean;
        final: boolean;
      };
      setCall(snapshot.call);
      setEvents(snapshot.events);
      setCosts(snapshot.costs);
      setWebhookDeliveries(snapshot.webhookDeliveries);
      setHasRecording(snapshot.hasRecording);

      // The browser's native EventSource always tries to reconnect after ANY connection close,
      // including the server's own clean res.end() once it's decided the call is fully settled —
      // there's no "this is done" signal in the SSE spec itself. Without closing explicitly here,
      // the client would silently reopen a new connection every ~3s forever after every call.
      if (snapshot.final) {
        source.close();
      }
    };

    // A transient network hiccup fires onerror too; EventSource's default auto-reconnect handles
    // that case on its own, so there's nothing to do here beyond not crashing the app.
    source.onerror = () => {};

    return () => source.close();
  }, [callSid, initialCallIsTerminal, reconnectNonce]);

  async function handleReplay(id: string) {
    setReplayingId(id);
    try {
      const response = await fetch(`/api/webhook-outbox/${id}/replay`, { method: "POST" });
      if (response.ok) {
        const updated = await response.json();
        setWebhookDeliveries((prev) => prev.map((d) => (d.id === id ? updated : d)));
        setReconnectNonce((n) => n + 1);
      }
    } finally {
      setReplayingId(undefined);
    }
  }

  const transcriptTurns = events
    .filter((e) => e.eventType === "transcript_turn")
    .map((e) => ({ role: e.payload?.["role"] as string, text: e.payload?.["text"] as string }));

  return (
    <div className="flex flex-col gap-6">
      <Card data-testid="call-outcome-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge data-testid="call-detail-status" variant={statusVariant(call.status)}>
              {call.status}
            </Badge>
            {!TERMINAL_STATUSES.has(call.status) && (
              <span className="text-muted-foreground text-xs" data-testid="live-indicator">
                live
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt>Agent</dt>
          <dd>{call.agentId}</dd>
          <dt>Channel</dt>
          <dd>{call.channel}</dd>
          {call.toNumber && (
            <>
              <dt>To</dt>
              <dd>{call.toNumber}</dd>
            </>
          )}
          {call.scenario && (
            <>
              <dt>Scenario</dt>
              <dd>{call.scenario}</dd>
            </>
          )}
        </CardContent>
      </Card>

      {hasRecording && (
        <Card data-testid="call-recording-card">
          <CardHeader>
            <CardTitle>Recording</CardTitle>
          </CardHeader>
          <CardContent>
            <audio controls src={`/api/calls/${callSid}/recording`} data-testid="call-recording-player" />
          </CardContent>
        </Card>
      )}

      {costs.length > 0 && (
        <Card data-testid="call-cost-card">
          <CardHeader>
            <CardTitle>Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1 text-sm" data-testid="call-cost-legs">
              {costs.map((leg) => (
                <li key={leg.id} data-testid={`call-cost-leg-${leg.providerType}`} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {leg.provider} · {leg.providerType} · {leg.units} {leg.unitType}
                  </span>
                  <span className="font-mono">${leg.costAmount.toFixed(6)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-2 flex justify-between border-t pt-2 text-sm font-medium">
              <span>Total</span>
              <span data-testid="call-cost-total" className="font-mono">
                ${costs.reduce((sum, leg) => sum + leg.costAmount, 0).toFixed(6)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {transcriptTurns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2" data-testid="call-transcript">
            {transcriptTurns.map((turn, index) => (
              <div key={index} data-testid={`call-turn-${index}`}>
                <span className="font-medium">{turn.role}: </span>
                {turn.text}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-1 text-sm" data-testid="call-timeline">
            {events.map((event) => (
              <li key={event.id} data-testid={`timeline-event-${event.eventType}`} className="flex gap-2">
                <span className="text-muted-foreground w-40 shrink-0 font-mono text-xs">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </span>
                <span>{event.eventType}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {webhookDeliveries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2 text-sm" data-testid="webhook-deliveries">
              {webhookDeliveries.map((delivery) => (
                <li
                  key={delivery.id}
                  data-testid={`webhook-delivery-${delivery.id}`}
                  className="flex items-center gap-3"
                >
                  <Badge
                    data-testid={`webhook-delivery-status-${delivery.id}`}
                    variant={delivery.status === "DELIVERED" ? "default" : delivery.status === "DEAD" ? "destructive" : "secondary"}
                  >
                    {delivery.status}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {delivery.eventType} · attempt {delivery.retryCount}/{delivery.maxRetries}
                  </span>
                  {(delivery.status === "DEAD" || delivery.status === "DELIVERED") && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={replayingId === delivery.id}
                      onClick={() => handleReplay(delivery.id)}
                      data-testid={`webhook-replay-${delivery.id}`}
                    >
                      {replayingId === delivery.id ? "Replaying..." : "Replay"}
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Accordion data-testid="raw-events-accordion">
        <AccordionItem value="raw-events">
          <AccordionTrigger>Raw events</AccordionTrigger>
          <AccordionContent>
            <pre className="overflow-x-auto text-xs">{JSON.stringify(events, null, 2)}</pre>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
