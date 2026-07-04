import type { Call, CallCost, CallEvent } from "@callplane/database";

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

export function serializeCallCost(cost: CallCost) {
  return {
    id: cost.id,
    callSid: cost.callSid,
    provider: cost.provider,
    providerType: cost.providerType,
    units: Number(cost.units),
    unitType: cost.unitType,
    costAmount: Number(cost.costAmount),
    currency: cost.currency,
    createdAt: cost.createdAt.toISOString(),
  };
}
