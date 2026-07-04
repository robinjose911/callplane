import { apiFetch } from "@/lib/api-client";
import { PlaygroundClient } from "./playground-client";

interface AgentConfigResponse {
  name: string;
  voiceMode: string;
}

interface HealthPayload {
  stubMode: boolean;
}

async function fetchAgents(): Promise<AgentConfigResponse[]> {
  const response = await apiFetch("/v1/agents");
  if (!response.ok) return [];
  const body = (await response.json()) as { agents: AgentConfigResponse[] };
  return body.agents;
}

async function fetchStubMode(): Promise<boolean> {
  try {
    const response = await apiFetch("/health");
    if (!response.ok) return false;
    const body = (await response.json()) as HealthPayload;
    return body.stubMode;
  } catch {
    return false;
  }
}

export default async function PlaygroundPage() {
  const [agents, stubMode] = await Promise.all([fetchAgents(), fetchStubMode()]);

  return (
    <div className="flex flex-col gap-6" data-testid="playground-page">
      <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
      <PlaygroundClient agents={agents} stubMode={stubMode} />
    </div>
  );
}
