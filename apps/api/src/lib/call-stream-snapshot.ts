import { TERMINAL_CALL_STATUSES, TERMINAL_WEBHOOK_OUTBOX_STATUSES, type CallStatus } from "@callplane/contracts";
import type { CallCostRepository, CallEventRepository, CallRepository, RecordingRepository, WebhookOutboxRepository } from "@callplane/database";
import { serializeCall, serializeCallCost, serializeCallEvent } from "./serialize-call.js";
import { serializeWebhookOutboxEntry } from "./serialize-webhook.js";

export interface CallStreamSnapshotDeps {
  callRepo: CallRepository;
  callEventRepo: CallEventRepository;
  callCostRepo: CallCostRepository;
  webhookOutboxRepo: WebhookOutboxRepository;
  recordingRepo: RecordingRepository;
}

export interface CallStreamState {
  /** Ticks where the call was already terminal but had zero webhook delivery rows yet — bounds
   * how long the stream stays open for a call with no subscribed endpoints at all. */
  noDeliveriesGraceTicks: number;
}

/**
 * Builds one SSE snapshot for a call detail page: current status, full event trail, cost legs,
 * webhook deliveries, and whether a recording exists. Also decides whether the stream should
 * close after this snapshot — the same "terminal AND (deliveries settled OR grace period
 * exhausted)" rule the console's polling loop used before this migrated server-side (see ADR
 * 0004), so the exact same vacuous-truth and grace-period lessons from that code apply here.
 */
export async function buildCallStreamSnapshot(
  callSid: string,
  deps: CallStreamSnapshotDeps,
  state: CallStreamState,
): Promise<{ snapshot: unknown; shouldStop: boolean } | undefined> {
  const [call, events, costs, deliveries, recording] = await Promise.all([
    deps.callRepo.findBySid(callSid),
    deps.callEventRepo.findBySid(callSid),
    deps.callCostRepo.findByCallSid(callSid),
    deps.webhookOutboxRepo.findByCallSid(callSid),
    deps.recordingRepo.findByCallSid(callSid),
  ]);
  if (!call) return undefined;

  const isTerminal = (TERMINAL_CALL_STATUSES as readonly CallStatus[]).includes(call.status);
  const terminalStatuses = new Set(TERMINAL_WEBHOOK_OUTBOX_STATUSES);
  const deliveriesSettled = deliveries.length > 0 && deliveries.every((d) => terminalStatuses.has(d.status));
  state.noDeliveriesGraceTicks = deliveries.length === 0 ? state.noDeliveriesGraceTicks + 1 : 0;
  const shouldStop = isTerminal && (deliveriesSettled || state.noDeliveriesGraceTicks >= 10);

  const snapshot = {
    call: serializeCall(call),
    events: events.map(serializeCallEvent),
    costs: costs.map(serializeCallCost),
    webhookDeliveries: deliveries.map(serializeWebhookOutboxEntry),
    hasRecording: recording !== null,
    // The browser's native EventSource always auto-reconnects after ANY connection close,
    // including a clean server-side res.end() — there's no built-in "this is done, stop" signal
    // in the SSE spec. This flag is how the client knows to call source.close() itself instead of
    // silently reopening a new connection every ~3s forever after a call has already settled.
    final: shouldStop,
  };

  return { snapshot, shouldStop };
}
