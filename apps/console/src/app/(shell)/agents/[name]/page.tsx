import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { AgentEditorForm } from "./agent-editor-form";

interface AgentConfigResponse {
  id: string;
  name: string;
  voiceMode: "cascade" | "half_cascade" | "realtime";
  s2sProvider: string | null;
  s2sModel: string | null;
  sttProvider: string | null;
  llmProvider: string | null;
  llmModel: string | null;
  ttsProvider: string | null;
  ttsVoiceId: string | null;
  reasoningEffort: string | null;
  prompt: string;
  enableShortFirstResponse: boolean;
  languageProfileId: string | null;
  isActive: boolean;
}

interface ModelOption {
  id: string;
  name: string;
  modelType: "llm" | "s2s";
}

interface LanguageProfile {
  id: string;
  languageCode: string;
}

async function fetchAgent(name: string): Promise<AgentConfigResponse | undefined> {
  const response = await apiFetch(`/v1/agents/${name}`);
  if (!response.ok) return undefined;
  return (await response.json()) as AgentConfigResponse;
}

async function fetchModelOptions(): Promise<ModelOption[]> {
  const response = await apiFetch("/v1/model-options");
  if (!response.ok) return [];
  const body = (await response.json()) as { modelOptions: ModelOption[] };
  return body.modelOptions;
}

async function fetchLanguageProfiles(): Promise<LanguageProfile[]> {
  const response = await apiFetch("/v1/language-profiles");
  if (!response.ok) return [];
  const body = (await response.json()) as { languageProfiles: LanguageProfile[] };
  return body.languageProfiles;
}

export default async function AgentEditorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const isNew = name === "new";

  const [agent, modelOptions, languageProfiles] = await Promise.all([
    isNew ? Promise.resolve(undefined) : fetchAgent(name),
    fetchModelOptions(),
    fetchLanguageProfiles(),
  ]);

  if (!isNew && !agent) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6" data-testid="agent-editor-page">
      <h1 className="text-2xl font-semibold tracking-tight">{isNew ? "New agent" : name}</h1>
      <AgentEditorForm agent={agent} modelOptions={modelOptions} languageProfiles={languageProfiles} />
    </div>
  );
}
