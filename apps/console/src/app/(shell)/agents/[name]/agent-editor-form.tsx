"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type VoiceMode = "cascade" | "half_cascade" | "realtime";

interface AgentConfigResponse {
  name: string;
  voiceMode: VoiceMode;
  s2sProvider: string | null;
  s2sModel: string | null;
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

export function AgentEditorForm({
  agent,
  modelOptions,
  languageProfiles,
}: {
  agent: AgentConfigResponse | undefined;
  modelOptions: ModelOption[];
  languageProfiles: LanguageProfile[];
}) {
  const isNew = agent === undefined;

  const [name, setName] = useState(agent?.name ?? "");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(agent?.voiceMode ?? "cascade");
  const [prompt, setPrompt] = useState(agent?.prompt ?? "");
  const [s2sProvider, setS2sProvider] = useState(agent?.s2sProvider ?? "gemini");
  const [s2sModel, setS2sModel] = useState(agent?.s2sModel ?? "");
  const [llmProvider, setLlmProvider] = useState(agent?.llmProvider ?? "openai");
  const [llmModel, setLlmModel] = useState(agent?.llmModel ?? "");
  const [ttsProvider, setTtsProvider] = useState(agent?.ttsProvider ?? "elevenlabs");
  const [ttsVoiceId, setTtsVoiceId] = useState(agent?.ttsVoiceId ?? "");
  const [reasoningEffort, setReasoningEffort] = useState(agent?.reasoningEffort ?? "none");
  const [enableShortFirstResponse, setEnableShortFirstResponse] = useState(agent?.enableShortFirstResponse ?? false);
  const [languageProfileId, setLanguageProfileId] = useState(agent?.languageProfileId ?? "");
  const [isActive, setIsActive] = useState(agent?.isActive ?? true);
  const [customModelName, setCustomModelName] = useState("");
  const [availableModelOptions, setAvailableModelOptions] = useState(modelOptions);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const usesS2s = voiceMode === "realtime" || voiceMode === "half_cascade";
  const usesStt = voiceMode === "cascade";
  const usesLlm = voiceMode === "cascade";
  const usesTts = voiceMode === "cascade" || voiceMode === "half_cascade";

  const modelTypeForCustom = usesS2s ? "s2s" : "llm";

  async function handleAddCustomModel() {
    if (!customModelName.trim()) return;
    const response = await fetch("/api/model-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: customModelName.trim(), modelType: modelTypeForCustom }),
    });
    if (response.ok) {
      const created = (await response.json()) as ModelOption;
      setAvailableModelOptions((prev) => (prev.some((o) => o.id === created.id) ? prev : [...prev, created]));
      if (usesS2s) setS2sModel(created.name);
      else setLlmModel(created.name);
      setCustomModelName("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    // For an existing agent, switching voiceMode must explicitly *clear* (send null for) the
    // fields the new mode doesn't use — an omitted PATCH field means "leave unchanged", so
    // without this a mode switch would leave stale provider values in the DB (and this console's
    // own agents list, which falls back `s2sProvider ?? llmProvider`, would then show the wrong
    // provider for the agent). Create has no prior state to clear, so it only sends what applies.
    const body = {
      ...(isNew ? { name } : {}),
      voiceMode,
      prompt,
      enableShortFirstResponse,
      isActive,
      ...(languageProfileId ? { languageProfileId } : { ...(isNew ? {} : { languageProfileId: null }) }),
      ...(usesS2s
        ? { s2sProvider, ...(s2sModel ? { s2sModel } : {}) }
        : isNew
          ? {}
          : { s2sProvider: null, s2sModel: null }),
      ...(usesStt ? { sttProvider: "deepgram" } : isNew ? {} : { sttProvider: null }),
      ...(usesLlm
        ? { llmProvider, ...(llmModel ? { llmModel } : {}) }
        : isNew
          ? {}
          : { llmProvider: null, llmModel: null }),
      ...(usesTts
        ? { ttsProvider, ...(ttsVoiceId ? { ttsVoiceId } : {}) }
        : isNew
          ? {}
          : { ttsProvider: null, ttsVoiceId: null }),
      ...(voiceMode === "realtime" ? { reasoningEffort } : isNew ? {} : { reasoningEffort: null }),
    };

    try {
      const response = await fetch(isNew ? "/api/agents" : `/api/agents/${agent.name}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(payload.error?.message ?? "Failed to save agent config.");
        return;
      }

      // Hard navigation, not router.push + router.refresh — see LoginForm's identical fix:
      // the App Router's client cache can race a push+refresh pair right after a mutation,
      // occasionally leaving the stale pre-save tree visible instead of the refreshed list.
      window.location.href = "/agents";
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4" data-testid="agent-editor-form">
          {isNew && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                data-testid="field-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="voiceMode">Voice mode</Label>
            <Select value={voiceMode} onValueChange={(value) => setVoiceMode(value as VoiceMode)}>
              <SelectTrigger id="voiceMode" data-testid="field-voice-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cascade">cascade</SelectItem>
                <SelectItem value="half_cascade">half_cascade</SelectItem>
                <SelectItem value="realtime">realtime</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {usesS2s && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s2sProvider">S2S provider</Label>
                <Select value={s2sProvider} onValueChange={(value) => setS2sProvider(value ?? "")}>
                  <SelectTrigger id="s2sProvider" data-testid="field-s2s-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">gemini</SelectItem>
                    <SelectItem value="openai">openai</SelectItem>
                    <SelectItem value="azure">azure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s2sModel">S2S model</Label>
                <Select value={s2sModel} onValueChange={(value) => setS2sModel(value ?? "")}>
                  <SelectTrigger id="s2sModel" data-testid="field-s2s-model">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModelOptions
                      .filter((o) => o.modelType === "s2s")
                      .map((o) => (
                        <SelectItem key={o.id} value={o.name}>
                          {o.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {usesStt && (
            <div className="flex flex-col gap-2">
              <Label>STT provider</Label>
              <Input value="deepgram" disabled data-testid="field-stt-provider" />
            </div>
          )}

          {usesLlm && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="llmProvider">LLM provider</Label>
                <Select value={llmProvider} onValueChange={(value) => setLlmProvider(value ?? "")}>
                  <SelectTrigger id="llmProvider" data-testid="field-llm-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">openai</SelectItem>
                    <SelectItem value="google">google</SelectItem>
                    <SelectItem value="azure">azure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="llmModel">LLM model</Label>
                <Select value={llmModel} onValueChange={(value) => setLlmModel(value ?? "")}>
                  <SelectTrigger id="llmModel" data-testid="field-llm-model">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModelOptions
                      .filter((o) => o.modelType === "llm")
                      .map((o) => (
                        <SelectItem key={o.id} value={o.name}>
                          {o.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {(usesS2s || usesLlm) && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="customModel">Add custom model</Label>
              <div className="flex gap-2">
                <Input
                  id="customModel"
                  data-testid="field-custom-model-name"
                  value={customModelName}
                  onChange={(e) => setCustomModelName(e.target.value)}
                  placeholder="e.g. gpt-4o-2024-11-20"
                />
                <Button type="button" variant="secondary" onClick={handleAddCustomModel} data-testid="add-custom-model-button">
                  Add
                </Button>
              </div>
            </div>
          )}

          {usesTts && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ttsProvider">TTS provider</Label>
                <Select value={ttsProvider} onValueChange={(value) => setTtsProvider(value ?? "")}>
                  <SelectTrigger id="ttsProvider" data-testid="field-tts-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="elevenlabs">elevenlabs</SelectItem>
                    <SelectItem value="cartesia">cartesia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ttsVoiceId">TTS voice ID</Label>
                <Input
                  id="ttsVoiceId"
                  data-testid="field-tts-voice-id"
                  value={ttsVoiceId}
                  onChange={(e) => setTtsVoiceId(e.target.value)}
                />
              </div>
            </>
          )}

          {voiceMode === "realtime" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="reasoningEffort">Reasoning effort</Label>
              <Select value={reasoningEffort} onValueChange={(value) => setReasoningEffort(value ?? "")}>
                <SelectTrigger id="reasoningEffort" data-testid="field-reasoning-effort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="languageProfileId">Language profile</Label>
            <Select value={languageProfileId} onValueChange={(value) => setLanguageProfileId(value ?? "")}>
              <SelectTrigger id="languageProfileId" data-testid="field-language-profile">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                {languageProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.languageCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              data-testid="field-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              placeholder="You are a helpful assistant for {{company_name}}..."
              required
            />
            <p className="text-muted-foreground text-xs">
              Use <code>{"{{variable}}"}</code> placeholders — resolved from the call&apos;s dynamic variables.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="enableShortFirstResponse"
              data-testid="field-short-first-response"
              checked={enableShortFirstResponse}
              onCheckedChange={setEnableShortFirstResponse}
            />
            <Label htmlFor="enableShortFirstResponse">Short first-response filler</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="isActive" data-testid="field-is-active" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="isActive">Active</Label>
          </div>

          {error && (
            <p role="alert" data-testid="agent-editor-error" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} data-testid="agent-editor-submit">
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
