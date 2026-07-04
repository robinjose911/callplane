import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { CallDetailClient } from "./call-detail-client";

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

async function fetchCall(callSid: string): Promise<CallResponse | undefined> {
  const response = await apiFetch(`/v1/calls/${callSid}`);
  if (!response.ok) return undefined;
  return (await response.json()) as CallResponse;
}

async function fetchEvents(callSid: string): Promise<CallEventResponse[]> {
  const response = await apiFetch(`/v1/calls/${callSid}/events?limit=100`);
  if (!response.ok) return [];
  const body = (await response.json()) as { events: CallEventResponse[] };
  return body.events;
}

async function fetchWebhookDeliveries(callSid: string): Promise<WebhookOutboxEntryResponse[]> {
  const response = await apiFetch(`/v1/webhook-outbox?callSid=${callSid}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { entries: WebhookOutboxEntryResponse[] };
  return body.entries;
}

async function fetchCosts(callSid: string): Promise<CallCostResponse[]> {
  const response = await apiFetch(`/v1/calls/${callSid}/cost`);
  if (!response.ok) return [];
  const body = (await response.json()) as { costs: CallCostResponse[] };
  return body.costs;
}

// A HEAD request only — never fetches (and discards) the WAV body just to check existence.
async function fetchHasRecording(callSid: string): Promise<boolean> {
  const response = await apiFetch(`/v1/calls/${callSid}/recording`, { method: "HEAD" });
  return response.ok;
}

export default async function CallDetailPage({ params }: { params: Promise<{ callSid: string }> }) {
  const { callSid } = await params;
  const [call, events, webhookDeliveries, costs, hasRecording] = await Promise.all([
    fetchCall(callSid),
    fetchEvents(callSid),
    fetchWebhookDeliveries(callSid),
    fetchCosts(callSid),
    fetchHasRecording(callSid),
  ]);

  if (!call) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6" data-testid="call-detail-page">
      <h1 className="text-2xl font-semibold tracking-tight">
        Call <span className="font-mono text-lg">{call.callSid.slice(0, 8)}</span>
      </h1>
      <CallDetailClient
        initialCall={call}
        initialEvents={events}
        initialWebhookDeliveries={webhookDeliveries}
        initialCosts={costs}
        initialHasRecording={hasRecording}
      />
    </div>
  );
}
