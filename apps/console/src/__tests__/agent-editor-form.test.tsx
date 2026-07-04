import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentEditorForm } from "@/app/(shell)/agents/[name]/agent-editor-form";

const modelOptions = [
  { id: "m1", name: "gpt-4o", modelType: "llm" as const },
  { id: "m2", name: "gemini-2.0-flash-live-001", modelType: "s2s" as const },
];
const languageProfiles = [{ id: "l1", languageCode: "en-US" }];

function cascadeAgent() {
  return {
    name: "demo-cascade",
    voiceMode: "cascade" as const,
    s2sProvider: null,
    s2sModel: null,
    llmProvider: "openai",
    llmModel: "gpt-4o",
    ttsProvider: "elevenlabs",
    ttsVoiceId: null,
    reasoningEffort: null,
    prompt: "You are helpful.",
    enableShortFirstResponse: false,
    languageProfileId: null,
    isActive: true,
  };
}

function realtimeAgent() {
  return {
    name: "demo-realtime",
    voiceMode: "realtime" as const,
    s2sProvider: "gemini",
    s2sModel: "gemini-2.0-flash-live-001",
    llmProvider: null,
    llmModel: null,
    ttsProvider: null,
    ttsVoiceId: null,
    reasoningEffort: "none",
    prompt: "You are helpful.",
    enableShortFirstResponse: false,
    languageProfileId: null,
    isActive: true,
  };
}

describe("AgentEditorForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cascade mode shows STT/LLM/TTS fields, not S2S fields", () => {
    render(<AgentEditorForm agent={cascadeAgent()} modelOptions={modelOptions} languageProfiles={languageProfiles} />);

    expect(screen.getByTestId("field-stt-provider")).toBeInTheDocument();
    expect(screen.getByTestId("field-llm-provider")).toBeInTheDocument();
    expect(screen.getByTestId("field-llm-model")).toBeInTheDocument();
    expect(screen.getByTestId("field-tts-provider")).toBeInTheDocument();
    expect(screen.queryByTestId("field-s2s-provider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("field-reasoning-effort")).not.toBeInTheDocument();
  });

  it("realtime mode shows S2S + reasoning effort fields, not STT/LLM/TTS fields", () => {
    render(<AgentEditorForm agent={realtimeAgent()} modelOptions={modelOptions} languageProfiles={languageProfiles} />);

    expect(screen.getByTestId("field-s2s-provider")).toBeInTheDocument();
    expect(screen.getByTestId("field-s2s-model")).toBeInTheDocument();
    expect(screen.getByTestId("field-reasoning-effort")).toBeInTheDocument();
    expect(screen.queryByTestId("field-stt-provider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("field-llm-provider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("field-tts-provider")).not.toBeInTheDocument();
  });

  it("half_cascade mode shows S2S + TTS fields but not reasoning effort", () => {
    const agent = { ...realtimeAgent(), voiceMode: "half_cascade" as const, ttsProvider: "elevenlabs" };
    render(<AgentEditorForm agent={agent} modelOptions={modelOptions} languageProfiles={languageProfiles} />);

    expect(screen.getByTestId("field-s2s-provider")).toBeInTheDocument();
    expect(screen.getByTestId("field-tts-provider")).toBeInTheDocument();
    expect(screen.queryByTestId("field-reasoning-effort")).not.toBeInTheDocument();
  });

  it("populates the model select from the modelOptions prop, filtered by type", () => {
    render(<AgentEditorForm agent={cascadeAgent()} modelOptions={modelOptions} languageProfiles={languageProfiles} />);
    // LLM model select should show the llm-type option's current value.
    expect(screen.getByTestId("field-llm-model")).toHaveTextContent("gpt-4o");
  });

  it("submits a PATCH with only the fields relevant to the current voice mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, href: "" } });
    const user = userEvent.setup();

    render(<AgentEditorForm agent={cascadeAgent()} modelOptions={modelOptions} languageProfiles={languageProfiles} />);
    await user.click(screen.getByTestId("agent-editor-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agents/demo-cascade", expect.objectContaining({ method: "PATCH" })));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ voiceMode: "cascade", sttProvider: "deepgram", llmProvider: "openai", ttsProvider: "elevenlabs" });
    // Explicitly cleared (not merely omitted) — an existing agent already has no s2s/reasoning
    // fields set (this fixture's voiceMode is cascade throughout), so PATCH nulls them out rather
    // than silently leaving whatever was there unchanged.
    expect(body).toMatchObject({ s2sProvider: null, s2sModel: null, reasoningEffort: null });

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("switching voiceMode on an existing agent explicitly nulls out the fields the new mode doesn't use", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, href: "" } });
    const user = userEvent.setup();

    // Starts as realtime (s2sProvider/s2sModel/reasoningEffort set) — switch to cascade and save.
    render(<AgentEditorForm agent={realtimeAgent()} modelOptions={modelOptions} languageProfiles={languageProfiles} />);
    await user.click(screen.getByTestId("field-voice-mode"));
    await user.click(screen.getByRole("option", { name: "cascade" }));
    await user.click(screen.getByTestId("agent-editor-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agents/demo-realtime", expect.objectContaining({ method: "PATCH" })));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      voiceMode: "cascade",
      s2sProvider: null,
      s2sModel: null,
      reasoningEffort: null,
      sttProvider: "deepgram",
    });

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("shows a server-side validation error inline without navigating away", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Invalid request body." } }) }),
    );
    const user = userEvent.setup();

    render(<AgentEditorForm agent={cascadeAgent()} modelOptions={modelOptions} languageProfiles={languageProfiles} />);
    await user.click(screen.getByTestId("agent-editor-submit"));

    expect(await screen.findByTestId("agent-editor-error")).toHaveTextContent("Invalid request body.");
  });

  it("new-agent mode shows the name field", () => {
    render(<AgentEditorForm agent={undefined} modelOptions={modelOptions} languageProfiles={languageProfiles} />);
    expect(screen.getByTestId("field-name")).toBeInTheDocument();
  });
});
