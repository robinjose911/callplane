"use client";

import { useEffect, useRef, useState } from "react";
import { TERMINAL_CALL_STATUSES } from "@callplane/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const TERMINAL_STATUSES = new Set<string>(TERMINAL_CALL_STATUSES);
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

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "COMPLETED") return "default";
  if (["FAILED", "NO_ANSWER", "BUSY", "CALL_DROPPED"].includes(status)) return "destructive";
  if (status === "QUEUED") return "outline";
  return "secondary";
}

export function CallDetailClient({
  initialCall,
  initialEvents,
}: {
  initialCall: CallResponse;
  initialEvents: CallEventResponse[];
}) {
  const [call, setCall] = useState(initialCall);
  const [events, setEvents] = useState(initialEvents);
  const callSid = initialCall.callSid;
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(call.status)) return;

    let pollInFlight = false;

    async function poll() {
      // Guards against a slow response still being in flight when the next tick fires — without
      // this, two overlapping polls' responses can resolve out of order and an older one
      // arriving last would silently regress the just-rendered (newer) state.
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const [callRes, eventsRes] = await Promise.all([
          fetch(`/api/calls/${callSid}`),
          fetch(`/api/calls/${callSid}/events?limit=100`),
        ]);
        if (callRes.ok) setCall(await callRes.json());
        if (eventsRes.ok) setEvents((await eventsRes.json()).events);
      } catch {
        // A transient network error shouldn't crash the poller — just skip this tick and retry
        // on the next one rather than throwing an unhandled rejection every second.
      } finally {
        pollInFlight = false;
      }
    }

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only when the status class changes
  }, [callSid, TERMINAL_STATUSES.has(call.status)]);

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
