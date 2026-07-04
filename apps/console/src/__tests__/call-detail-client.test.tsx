import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function delivery(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "delivery-1",
    callSid: "call-1",
    webhookEndpointId: "endpoint-1",
    eventType: "post_call_transcription",
    status: "DEAD",
    retryCount: 10,
    maxRetries: 10,
    nextRetryAt: null,
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

function costLeg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cost-1",
    callSid: "call-1",
    provider: "deepgram",
    providerType: "stt",
    units: 5,
    unitType: "seconds",
    costAmount: 0.0215,
    currency: "USD",
    createdAt: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("CallDetailClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders the timeline events in the order given", () => {
    const events = [event("call_queued"), event("call_dialing"), event("call_in_progress")];
    render(<CallDetailClient initialCall={call()} initialEvents={events} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />);

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
    render(<CallDetailClient initialCall={call()} initialEvents={events} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />);

    expect(screen.getByTestId("call-turn-0")).toHaveTextContent("agent: Hi there");
    expect(screen.getByTestId("call-turn-1")).toHaveTextContent("user: Hello");
  });

  it("shows the live indicator for a non-terminal call and polls the API", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/events")) return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      if (url.includes("/cost")) return Promise.resolve({ ok: true, json: async () => ({ costs: [] }) });
      if (url.includes("/webhook-outbox")) return Promise.resolve({ ok: true, json: async () => ({ entries: [] }) });
      return Promise.resolve({ ok: true, json: async () => call({ status: "IN_PROGRESS" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />);
    expect(screen.getByTestId("live-indicator")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchMock).toHaveBeenCalledWith("/api/calls/call-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/calls/call-1/events?limit=100");
  });

  it("does not poll and hides the live indicator for a terminal call whose webhook deliveries are already settled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[delivery({ status: "DELIVERED" })]}
        initialCosts={[]} initialHasRecording={false}
      />,
    );
    expect(screen.queryByTestId("live-indicator")).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops polling once a poll response reports a terminal call status with settled deliveries", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let pollCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/events")) return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      if (url.includes("/cost")) return Promise.resolve({ ok: true, json: async () => ({ costs: [] }) });
      if (url.includes("/webhook-outbox")) {
        return Promise.resolve({ ok: true, json: async () => ({ entries: [delivery({ status: "DELIVERED" })] }) });
      }
      pollCount += 1;
      return Promise.resolve({ ok: true, json: async () => call({ status: "COMPLETED" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CallDetailClient
        initialCall={call({ status: "IN_PROGRESS" })}
        initialEvents={[]}
        initialWebhookDeliveries={[delivery({ status: "PENDING" })]}
        initialCosts={[]} initialHasRecording={false}
      />,
    );

    await act(() => vi.advanceTimersByTimeAsync(1000));
    await waitFor(() => expect(screen.getByTestId("call-detail-status")).toHaveTextContent("COMPLETED"));

    const countAfterFirstPoll = pollCount;
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(pollCount).toBe(countAfterFirstPoll);
  });

  it("keeps polling a terminal call for a bounded grace period when it has zero webhook deliveries yet, then gives up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/events")) return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      if (url.includes("/cost")) return Promise.resolve({ ok: true, json: async () => ({ costs: [] }) });
      if (url.includes("/webhook-outbox")) return Promise.resolve({ ok: true, json: async () => ({ entries: [] }) });
      return Promise.resolve({ ok: true, json: async () => call({ status: "COMPLETED" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CallDetailClient initialCall={call({ status: "COMPLETED" })} initialEvents={[]} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />,
    );

    // Still within the grace period (5 of the 10 allotted ticks) — polling continues even though
    // the call is already terminal, since deliveries genuinely might still be about to appear.
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(fetchMock).toHaveBeenCalled();

    // Advance well past the 10-tick grace window (deliveries stay empty throughout) — polling
    // should stabilize instead of continuing forever.
    await act(() => vi.advanceTimersByTimeAsync(20000));
    const callCountAfterGraceExpires = fetchMock.mock.calls.length;

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(fetchMock.mock.calls.length).toBe(callCountAfterGraceExpires);
  });

  it("skips a tick rather than overlapping when the previous poll is still in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let pollStarts = 0;
    let resolveFirstCallFetch: (() => void) | undefined;

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/events")) return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      if (url.includes("/cost")) return Promise.resolve({ ok: true, json: async () => ({ costs: [] }) });
      if (url.includes("/webhook-outbox")) return Promise.resolve({ ok: true, json: async () => ({ entries: [] }) });
      if (url.includes("/recording")) return Promise.resolve({ ok: false });
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

    render(<CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />);

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
      if (url.includes("/cost")) return Promise.resolve({ ok: true, json: async () => ({ costs: [] }) });
      if (url.includes("/webhook-outbox")) return Promise.resolve({ ok: true, json: async () => ({ entries: [] }) });
      if (url.includes("/recording")) return Promise.resolve({ ok: false });
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error("network error"));
      return Promise.resolve({ ok: true, json: async () => call({ status: "IN_PROGRESS" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(attempt).toBe(2);
    expect(screen.getByTestId("live-indicator")).toBeInTheDocument();
  });

  it("renders webhook delivery status badges", () => {
    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[delivery({ status: "DEAD" })]}
        initialCosts={[]} initialHasRecording={false}
      />,
    );
    expect(screen.getByTestId("webhook-delivery-status-delivery-1")).toHaveTextContent("DEAD");
  });

  it("shows a Replay button for a DEAD delivery but not for a PENDING one", () => {
    const { unmount } = render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[delivery({ status: "DEAD" })]}
        initialCosts={[]} initialHasRecording={false}
      />,
    );
    expect(screen.getByTestId("webhook-replay-delivery-1")).toBeInTheDocument();
    unmount();

    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[delivery({ status: "PENDING" })]}
        initialCosts={[]} initialHasRecording={false}
      />,
    );
    expect(screen.queryByTestId("webhook-replay-delivery-1")).not.toBeInTheDocument();
  });

  it("posts to the replay route and updates the row's status from the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => delivery({ status: "PENDING", retryCount: 0 }) }),
    );
    const user = userEvent.setup();

    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[delivery({ status: "DEAD" })]}
        initialCosts={[]} initialHasRecording={false}
      />,
    );
    await user.click(screen.getByTestId("webhook-replay-delivery-1"));

    expect(fetch).toHaveBeenCalledWith("/api/webhook-outbox/delivery-1/replay", { method: "POST" });
    expect(await screen.findByTestId("webhook-delivery-status-delivery-1")).toHaveTextContent("PENDING");
  });

  it("keeps polling while a webhook delivery is still non-terminal, even after the call itself is terminal", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/cost")) return Promise.resolve({ ok: true, json: async () => ({ costs: [] }) });
      if (url.includes("/webhook-outbox")) return Promise.resolve({ ok: true, json: async () => ({ entries: [delivery({ status: "RETRY_PENDING" })] }) });
      if (url.includes("/events")) return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      return Promise.resolve({ ok: true, json: async () => call({ status: "COMPLETED" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[delivery({ status: "RETRY_PENDING" })]}
        initialCosts={[]} initialHasRecording={false}
      />,
    );

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchMock).toHaveBeenCalledWith("/api/webhook-outbox?callSid=call-1");
  });

  it("renders a cost leg and the running total", () => {
    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[]}
        initialCosts={[costLeg({ costAmount: 0.0215 }), costLeg({ id: "cost-2", providerType: "llm", costAmount: 0.00125 })]} initialHasRecording={false}
      />,
    );

    expect(screen.getByTestId("call-cost-leg-stt")).toBeInTheDocument();
    expect(screen.getByTestId("call-cost-leg-llm")).toBeInTheDocument();
    expect(screen.getByTestId("call-cost-total")).toHaveTextContent("$0.022750");
  });

  it("does not render a cost card when there are no cost rows yet", () => {
    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[]}
        initialCosts={[]} initialHasRecording={false}
      />,
    );
    expect(screen.queryByTestId("call-cost-card")).not.toBeInTheDocument();
  });

  it("does not render an audio player when no recording exists yet, even for a completed call", () => {
    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[]}
        initialCosts={[]}
        initialHasRecording={false}
      />,
    );
    expect(screen.queryByTestId("call-recording-player")).not.toBeInTheDocument();
  });

  it("renders an audio player pointed at the recording route once a recording exists", () => {
    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[]}
        initialCosts={[]}
        initialHasRecording={true}
      />,
    );
    expect(screen.getByTestId("call-recording-player")).toHaveAttribute("src", "/api/calls/call-1/recording");
  });
});
