import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaygroundClient } from "@/app/(shell)/playground/playground-client";

class FakeLocalParticipant {
  setMicrophoneEnabled = vi.fn().mockResolvedValue(undefined);
  publishData = vi.fn().mockResolvedValue(undefined);
}

class FakeRoom {
  localParticipant = new FakeLocalParticipant();
  private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  on(event: string, handler: (...args: unknown[]) => void) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const h of this.handlers[event] ?? []) h(...args);
  }

  connect = vi.fn().mockResolvedValue(undefined);
  disconnect = vi.fn().mockResolvedValue(undefined);
}

let lastRoom: FakeRoom | undefined;

vi.mock("livekit-client", () => ({
  Room: vi.fn().mockImplementation(() => {
    lastRoom = new FakeRoom();
    return lastRoom;
  }),
  RoomEvent: {
    TranscriptionReceived: "transcriptionReceived",
    DataReceived: "dataReceived",
    ActiveSpeakersChanged: "activeSpeakersChanged",
    Disconnected: "disconnected",
  },
}));

const agents = [{ name: "demo-cascade", voiceMode: "cascade" }];

describe("PlaygroundClient", () => {
  afterEach(() => {
    // Not vi.restoreAllMocks() — that would wipe the top-level `Room: vi.fn().mockImplementation(...)`
    // mock's implementation itself (it's a bare vi.fn(), not a spy on a real object), leaving
    // `new Room()` returning undefined in every subsequent test.
    vi.unstubAllGlobals();
    lastRoom = undefined;
  });

  it("shows the stub-mode badge only when stubMode is true", () => {
    const { rerender } = render(<PlaygroundClient agents={agents} stubMode={true} />);
    expect(screen.getByTestId("stub-mode-badge")).toBeInTheDocument();

    rerender(<PlaygroundClient agents={agents} stubMode={false} />);
    expect(screen.queryByTestId("stub-mode-badge")).not.toBeInTheDocument();
  });

  it("does not show the stub-user-turn button before a call is connected, even in stub mode", () => {
    render(<PlaygroundClient agents={agents} stubMode={true} />);
    expect(screen.queryByTestId("stub-user-turn")).not.toBeInTheDocument();
  });

  it("connecting a call joins the room, enables the mic, and shows the stub-user-turn button once connected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          callSid: "call-1",
          status: "QUEUED",
          roomName: "call-1",
          participantToken: "fake-token",
          livekitUrl: "ws://localhost:7880",
        }),
      }),
    );
    const user = userEvent.setup();

    render(<PlaygroundClient agents={agents} stubMode={true} />);
    await user.click(screen.getByTestId("start-call-button"));

    await waitFor(() => expect(lastRoom?.connect).toHaveBeenCalledWith("ws://localhost:7880", "fake-token"));
    expect(lastRoom?.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(await screen.findByTestId("stub-user-turn")).toBeInTheDocument();
    expect(screen.getByTestId("call-state")).toHaveTextContent("connected");
  });

  it("renders agent and user transcript turns as transcript_turn data events arrive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          callSid: "call-1",
          roomName: "call-1",
          participantToken: "fake-token",
          livekitUrl: "ws://localhost:7880",
        }),
      }),
    );
    const user = userEvent.setup();

    render(<PlaygroundClient agents={agents} stubMode={false} />);
    await user.click(screen.getByTestId("start-call-button"));
    await waitFor(() => expect(lastRoom).toBeDefined());

    const payload = new TextEncoder().encode(
      JSON.stringify({ type: "transcript_turn", role: "agent", text: "Hi, how can I help?" }),
    );
    act(() => lastRoom!.emit("dataReceived", payload, undefined, undefined, "callplane-events"));

    expect(await screen.findByTestId("turn-0")).toHaveTextContent("Hi, how can I help?");
    expect(screen.getByTestId("turn-0")).toHaveAttribute("data-role", "agent");
  });

  it("marks the call ended when a call_ended data event arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ callSid: "call-1", roomName: "call-1", participantToken: "t", livekitUrl: "ws://x" }),
      }),
    );
    const user = userEvent.setup();

    render(<PlaygroundClient agents={agents} stubMode={false} />);
    await user.click(screen.getByTestId("start-call-button"));
    // Wait for the "connected" state before emitting the terminal event — otherwise the
    // still-in-flight connect() promise's later setState("connected") would overwrite it.
    await waitFor(() => expect(screen.getByTestId("call-state")).toHaveTextContent("connected"));

    const payload = new TextEncoder().encode(JSON.stringify({ type: "call_ended" }));
    act(() => lastRoom!.emit("dataReceived", payload, undefined, undefined, "callplane-events"));

    // waitFor re-queries fresh each retry — findByTestId would resolve immediately against the
    // about-to-be-unmounted "connected" node instead of the "ended" block's replacement node.
    await waitFor(() => expect(screen.getByTestId("call-state")).toHaveTextContent("call ended"));
  });

  it("shows an error and does not attempt to connect when the API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "CALL_RUNNER not set" } }) }),
    );
    const user = userEvent.setup();

    render(<PlaygroundClient agents={agents} stubMode={false} />);
    await user.click(screen.getByTestId("start-call-button"));

    expect(await screen.findByTestId("playground-error")).toHaveTextContent("CALL_RUNNER not set");
    expect(lastRoom).toBeUndefined();
  });
});
