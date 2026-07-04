import type {
  AgentConfigRepository,
  Call,
  CallCostRepository,
  CallEventRepository,
  PriceTableRepository,
} from "@callplane/database";
import type { StubScenarioUsage } from "@callplane/contracts";
import { meterCallUsage } from "./cost-meter.js";

export interface MeterCallCostDeps {
  agentConfigRepo: AgentConfigRepository;
  priceTableRepo: PriceTableRepository;
  callCostRepo: CallCostRepository;
  callEventRepo: CallEventRepository;
}

/**
 * Meters and persists a completed call's cost, one row per provider leg. Only runs for
 * `COMPLETED` calls — a `FAILED`/`BUSY`/`NO_ANSWER`/`CALL_DROPPED` call has no billable usage to
 * report in this stub-first stack. No-ops (not an error) when `usage` is absent — a real
 * (non-stub-scenario) call has no usage-reporting path wired up yet; that's real-provider
 * territory, explicitly post-v1 per CLAUDE.md. A leg with no matching `PriceTable` row is
 * recorded as a `cost_unpriced_leg` `CallEvent` instead of a `CallCost` row — the schema's
 * `costAmount` column is non-nullable, so this is how "explicit UNPRICED, never silent zero"
 * is represented without a nullable column.
 */
export async function meterCallCost(call: Call, usage: StubScenarioUsage | undefined, deps: MeterCallCostDeps): Promise<void> {
  if (call.status !== "COMPLETED" || !usage) return;

  const agentConfig = await deps.agentConfigRepo.findByName(call.agentId);
  if (!agentConfig) return;

  const priceRows = await deps.priceTableRepo.listAll();
  const legs = meterCallUsage(
    {
      voiceMode: agentConfig.voiceMode,
      s2sProvider: agentConfig.s2sProvider,
      sttProvider: agentConfig.sttProvider,
      llmProvider: agentConfig.llmProvider,
      ttsProvider: agentConfig.ttsProvider,
      usage,
    },
    priceRows,
  );

  for (const leg of legs) {
    if (leg.costAmount !== null) {
      await deps.callCostRepo.create({
        callSid: call.callSid,
        provider: leg.provider,
        providerType: leg.providerType,
        units: leg.units,
        unitType: leg.unitType,
        costAmount: leg.costAmount,
        currency: leg.currency,
      });
    } else {
      await deps.callEventRepo.append({
        callSid: call.callSid,
        eventType: "cost_unpriced_leg",
        payload: { provider: leg.provider, providerType: leg.providerType, unitType: leg.unitType, units: leg.units },
      });
    }
  }
}
