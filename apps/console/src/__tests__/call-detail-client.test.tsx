import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function snapshot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    call: call({ status: "IN_PROGRESS" }),
    events: [],
    costs: [],
    webhookDeliveries: [],
    hasRecording: false,
    final: false,
    ...overrides,
  };
}

/** Stands in for the browser's native EventSource — jsdom doesn't implement one. Tests grab the
 * most recently constructed instance and call `.emit(snapshot)` to simulate a server push. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  close() {
    this.closed = true;
  }
}

function latestSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error("no EventSource was constructed");
  return source;
}

describe("CallDetailClient", () => {
  beforeEach(() => {
    // jsdom has no native EventSource — stub it by default for every test; individual tests that
    // need to inspect/emit on the instance just grab it via latestSource().
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeEventSource.instances = [];
  });

  it("renders the timeline events in the order given", () => {
    const events = [event("call_queued"), event("call_dialing"), event("call_in_progress")];
    render(
      <CallDetailClient initialCall={call()} initialEvents={events} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />,
    );

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
    render(
      <CallDetailClient initialCall={call()} initialEvents={events} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />,
    );

    expect(screen.getByTestId("call-turn-0")).toHaveTextContent("agent: Hi there");
    expect(screen.getByTestId("call-turn-1")).toHaveTextContent("user: Hello");
  });

  it("shows the live indicator for a non-terminal call and opens an EventSource stream", () => {
    render(
      <CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />,
    );
    expect(screen.getByTestId("live-indicator")).toBeInTheDocument();
    expect(latestSource().url).toBe("/api/calls/call-1/stream");
  });

  it("does not open an EventSource for a call that is already terminal on first load", () => {
    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[delivery({ status: "DELIVERED" })]}
        initialCosts={[]}
        initialHasRecording={false}
      />,
    );
    expect(screen.queryByTestId("live-indicator")).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("updates call status, events, costs, deliveries, and recording from a pushed snapshot", async () => {
    render(
      <CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />,
    );

    act(() => {
      latestSource().emit(
        snapshot({
          call: call({ status: "COMPLETED" }),
          events: [event("call_completed")],
          costs: [costLeg()],
          webhookDeliveries: [delivery({ status: "DELIVERED" })],
          hasRecording: true,
          final: true,
        }),
      );
    });

    await waitFor(() => expect(screen.getByTestId("call-detail-status")).toHaveTextContent("COMPLETED"));
    expect(screen.getByTestId("call-cost-card")).toBeInTheDocument();
    expect(screen.getByTestId("call-recording-player")).toBeInTheDocument();
    expect(screen.getByTestId("webhook-delivery-status-delivery-1")).toHaveTextContent("DELIVERED");
  });

  it("closes the EventSource once a snapshot reports final: true, instead of relying on the browser's auto-reconnect", async () => {
    render(
      <CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />,
    );

    const source = latestSource();
    expect(source.closed).toBe(false);

    act(() => {
      source.emit(snapshot({ call: call({ status: "COMPLETED" }), final: true }));
    });

    await waitFor(() => expect(source.closed).toBe(true));
  });

  it("does not close the EventSource for a non-final snapshot", async () => {
    render(
      <CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />,
    );

    const source = latestSource();
    act(() => {
      source.emit(snapshot({ call: call({ status: "IN_PROGRESS" }), final: false }));
    });

    await waitFor(() => expect(screen.getByTestId("live-indicator")).toBeInTheDocument());
    expect(source.closed).toBe(false);
  });

  it("does not crash when the EventSource reports a transient error", () => {
    render(
      <CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />,
    );

    expect(() => latestSource().onerror?.()).not.toThrow();
    expect(screen.getByTestId("live-indicator")).toBeInTheDocument();
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = render(
      <CallDetailClient initialCall={call({ status: "IN_PROGRESS" })} initialEvents={[]} initialWebhookDeliveries={[]} initialCosts={[]} initialHasRecording={false} />,
    );
    const source = latestSource();
    unmount();
    expect(source.closed).toBe(true);
  });

  it("renders webhook delivery status badges", () => {
    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[delivery({ status: "DEAD" })]}
        initialCosts={[]}
        initialHasRecording={false}
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
        initialCosts={[]}
        initialHasRecording={false}
      />,
    );
    expect(screen.getByTestId("webhook-replay-delivery-1")).toBeInTheDocument();
    unmount();

    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[delivery({ status: "PENDING" })]}
        initialCosts={[]}
        initialHasRecording={false}
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
        initialCosts={[]}
        initialHasRecording={false}
      />,
    );
    expect(FakeEventSource.instances).toHaveLength(0); // already-settled on mount, nothing streaming yet

    await user.click(screen.getByTestId("webhook-replay-delivery-1"));

    expect(fetch).toHaveBeenCalledWith("/api/webhook-outbox/delivery-1/replay", { method: "POST" });
    expect(await screen.findByTestId("webhook-delivery-status-delivery-1")).toHaveTextContent("PENDING");

    // A replay can un-settle an already-closed (or never-opened) stream — the client must reopen
    // a connection to pick up the delivery's real outcome once the dispatcher worker re-attempts,
    // not just trust the replay response's optimistic "PENDING" forever.
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  });

  it("renders a cost leg and the running total", () => {
    render(
      <CallDetailClient
        initialCall={call({ status: "COMPLETED" })}
        initialEvents={[]}
        initialWebhookDeliveries={[]}
        initialCosts={[costLeg({ costAmount: 0.0215 }), costLeg({ id: "cost-2", providerType: "llm", costAmount: 0.00125 })]}
        initialHasRecording={false}
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
        initialCosts={[]}
        initialHasRecording={false}
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
