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

export default async function CallDetailPage({ params }: { params: Promise<{ callSid: string }> }) {
  const { callSid } = await params;
  const [call, events] = await Promise.all([fetchCall(callSid), fetchEvents(callSid)]);

  if (!call) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6" data-testid="call-detail-page">
      <h1 className="text-2xl font-semibold tracking-tight">
        Call <span className="font-mono text-lg">{call.callSid.slice(0, 8)}</span>
      </h1>
      <CallDetailClient initialCall={call} initialEvents={events} />
    </div>
  );
}
