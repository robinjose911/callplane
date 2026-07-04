import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { CallDetailClient } from "@/app/(shell)/calls/[callSid]/call-detail-client";

function call(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    callSid: "call-1",
    agentId: "demo-cascade",
    channel: "sip",
    toNumber: "+14155551234",
    status: "IN_PROGRESS",
    scenario: "demo_booking",
    dynamicVariables: null,
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

function event(eventType: string, payload: Record<string, unknown> | null = null, id = eventType) {
  return { id, callSid: "call-1", eventType, payload, createdAt: "2026-07-04T00:00:01.000Z" };
}

describe("CallDetailClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders the timeline events in the order given", () => {
    const events = [event("call_queued"), event("call_dialing"), event("call_in_progress")];
    render(<CallDetailClient initialCall={call()} initialEvents={events} />);

    const items = screen.getAllByTestId(/^timeline-event-/);
    expect(items.map((el) => el.dataset["testid"])).toEqual([
      "timeline-event-call_queued",
      "timeline-event-call_dialing",
      "timeline-event-call_in_progress",
    ]);
  });

  it("groups transcript_turn events into a transcript, role: text per turn", () => {
    const events = [
      event("transcript_turn", { role: "agent", text: "Hi there" }, "t1"),
      event("transcript_turn", { role: "user", text: "Hello" }, "t2"),
    ];
    render(<CallDetailClient initialCall={call()} initialEvents={events} />);

    expect(screen.getByTestId("call-turn-0")).toHaveTextContent("agent: Hi there");
    expect(screen.getByTestId("call-turn-1")).toHaveTextContent("user: Hello");
  });

  it("shows the live indicator for a non-terminal call and polls the API", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/events")) return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      return Promise.resolve({ ok: true, json: async () => call({ status: "IN_PROGRESS" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} />);
    expect(screen.getByTestId("live-indicator")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchMock).toHaveBeenCalledWith("/api/calls/call-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/calls/call-1/events?limit=100");
  });

  it("does not poll and hides the live indicator for a terminal call", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<CallDetailClient initialCall={call({ status: "COMPLETED" })} initialEvents={[]} />);
    expect(screen.queryByTestId("live-indicator")).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops polling once a poll response reports a terminal status", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let pollCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/events")) return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      pollCount += 1;
      return Promise.resolve({ ok: true, json: async () => call({ status: "COMPLETED" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} />);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    await waitFor(() => expect(screen.getByTestId("call-detail-status")).toHaveTextContent("COMPLETED"));

    const countAfterFirstPoll = pollCount;
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(pollCount).toBe(countAfterFirstPoll);
  });

  it("skips a tick rather than overlapping when the previous poll is still in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let pollStarts = 0;
    let resolveFirstCallFetch: (() => void) | undefined;

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/events")) return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      pollStarts += 1;
      if (pollStarts === 1) {
        // First tick's /api/calls/:callSid fetch never resolves until we say so — simulates a
        // slow response still in flight when the next 1000ms tick fires.
        return new Promise((resolve) => {
          resolveFirstCallFetch = () => resolve({ ok: true, json: async () => call({ status: "IN_PROGRESS" }) });
        });
      }
      return Promise.resolve({ ok: true, json: async () => call({ status: "IN_PROGRESS" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} />);

    await act(() => vi.advanceTimersByTimeAsync(1000)); // tick 1 starts, hangs
    await act(() => vi.advanceTimersByTimeAsync(1000)); // tick 2 fires while tick 1 is still in flight
    expect(pollStarts).toBe(1); // tick 2 was skipped, not overlapped

    resolveFirstCallFetch?.();
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(1000)); // tick 3 — now allowed to proceed
    expect(pollStarts).toBe(2);
  });

  it("does not crash or stop polling when a fetch rejects transiently", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let attempt = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/events")) return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error("network error"));
      return Promise.resolve({ ok: true, json: async () => call({ status: "IN_PROGRESS" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} />);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(attempt).toBe(2);
    expect(screen.getByTestId("live-indicator")).toBeInTheDocument();
  });
});
