import type { Call, CallEvent } from "@callplane/database";

export function serializeCall(call: Call) {
  return {
    callSid: call.callSid,
    agentId: call.agentId,
    channel: call.channel,
    toNumber: call.toNumber,
    status: call.status,
    scenario: call.scenario,
    dynamicVariables: call.dynamicVariables,
    createdAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
  };
}

export function serializeCallEvent(event: CallEvent) {
  return {
    id: event.id,
    callSid: event.callSid,
    eventType: event.eventType,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
  };
}
