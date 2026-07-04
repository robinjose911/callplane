"use client";

import { useEffect, useRef, useState } from "react";
import { TERMINAL_CALL_STATUSES } from "@callplane/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const TERMINAL_STATUSES = new Set<string>(TERMINAL_CALL_STATUSES);
const TERMINAL_WEBHOOK_STATUSES = new Set(["DELIVERED", "DEAD"]);
const POLL_INTERVAL_MS = 1000;

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const callIsTerminal = TERMINAL_STATUSES.has(call.status);
  // An empty array is vacuously "every entry is terminal" — that's wrong here: a call can go
  // terminal before its webhook outbox rows exist yet (enqueueWebhooksForCall runs in the
  // call-executor's finally block, strictly after the status write). Only treat deliveries as
  // settled once there's at least one to look at.
  const deliveriesAreTerminal =
    webhookDeliveries.length > 0 && webhookDeliveries.every((d) => TERMINAL_WEBHOOK_STATUSES.has(d.status));
  // Bounds how long we'll keep polling a terminal call with zero delivery rows — otherwise a call
  // with no subscribed webhook endpoints at all would poll forever, since deliveriesAreTerminal
  // can never become true for a call that will never get any outbox rows.
  const noDeliveriesGraceTicksRef = useRef(0);

  useEffect(() => {
    if (callIsTerminal && deliveriesAreTerminal) return;
    if (callIsTerminal && webhookDeliveries.length === 0 && noDeliveriesGraceTicksRef.current >= 10) return;

    let pollInFlight = false;

    async function poll() {
      // Guards against a slow response still being in flight when the next tick fires — without
      // this, two overlapping polls' responses can resolve out of order and an older one
      // arriving last would silently regress the just-rendered (newer) state.
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const [callRes, eventsRes, webhooksRes, costsRes, recordingRes] = await Promise.all([
          fetch(`/api/calls/${callSid}`),
          fetch(`/api/calls/${callSid}/events?limit=100`),
          fetch(`/api/webhook-outbox?callSid=${callSid}`),
          fetch(`/api/calls/${callSid}/cost`),
          hasRecording ? Promise.resolve(undefined) : fetch(`/api/calls/${callSid}/recording`, { method: "HEAD" }),
        ]);
        if (callRes.ok) setCall(await callRes.json());
        if (eventsRes.ok) setEvents((await eventsRes.json()).events);
        if (costsRes.ok) setCosts((await costsRes.json()).costs);
        if (recordingRes?.ok) setHasRecording(true);
        if (webhooksRes.ok) {
          const { entries } = (await webhooksRes.json()) as { entries: WebhookOutboxEntryResponse[] };
          setWebhookDeliveries(entries);
          noDeliveriesGraceTicksRef.current = entries.length === 0 ? noDeliveriesGraceTicksRef.current + 1 : 0;

          // A running interval keeps firing on its own schedule regardless of what a *future*
          // effect re-run would decide — re-checking the grace condition only in the effect body
          // would never actually stop this already-armed interval, since callIsTerminal and
          // deliveries-empty can both stay constant forever. Self-terminate here instead.
          if (callIsTerminal && entries.length === 0 && noDeliveriesGraceTicksRef.current >= 10) {
            clearInterval(intervalRef.current);
          }
        }
      } catch {
        // A transient network error shouldn't crash the poller — just skip this tick and retry
        // on the next one rather than throwing an unhandled rejection every second.
      } finally {
        pollInFlight = false;
      }
    }

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [callSid, callIsTerminal, deliveriesAreTerminal, webhookDeliveries.length, hasRecording]);

  async function handleReplay(id: string) {
    setReplayingId(id);
    try {
      const response = await fetch(`/api/webhook-outbox/${id}/replay`, { method: "POST" });
      if (response.ok) {
        const updated = await response.json();
        setWebhookDeliveries((prev) => prev.map((d) => (d.id === id ? updated : d)));
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
