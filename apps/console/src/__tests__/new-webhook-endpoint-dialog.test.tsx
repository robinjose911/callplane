import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewWebhookEndpointDialog } from "@/app/(shell)/webhooks/new-webhook-endpoint-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("NewWebhookEndpointDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to both event types selected", async () => {
    const user = userEvent.setup();
    render(<NewWebhookEndpointDialog />);
    await user.click(screen.getByTestId("new-webhook-endpoint-button"));

    expect(screen.getByTestId("event-type-post_call_transcription")).toBeChecked();
    expect(screen.getByTestId("event-type-call_initiation_failure")).toBeChecked();
  });

  it("submits the form with name, url, secret, and selected event types", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "endpoint-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NewWebhookEndpointDialog />);
    await user.click(screen.getByTestId("new-webhook-endpoint-button"));
    await user.type(screen.getByTestId("webhook-name-input"), "my-endpoint");
    await user.type(screen.getByTestId("webhook-url-input"), "https://example.com/webhook");
    await user.type(screen.getByTestId("webhook-secret-input"), "whsec_x");
    await user.click(screen.getByTestId("event-type-call_initiation_failure")); // deselect it

    await user.click(screen.getByTestId("new-webhook-endpoint-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/webhook-endpoints", expect.objectContaining({ method: "POST" })));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      name: "my-endpoint",
      url: "https://example.com/webhook",
      secret: "whsec_x",
      eventTypes: ["post_call_transcription"],
    });
  });

  it("shows a server-side error inline without closing the dialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "URL already in use" } }) }),
    );
    const user = userEvent.setup();

    render(<NewWebhookEndpointDialog />);
    await user.click(screen.getByTestId("new-webhook-endpoint-button"));
    await user.type(screen.getByTestId("webhook-name-input"), "x");
    await user.type(screen.getByTestId("webhook-url-input"), "https://example.com/webhook");
    await user.type(screen.getByTestId("webhook-secret-input"), "secret");
    await user.click(screen.getByTestId("new-webhook-endpoint-submit"));

    expect(await screen.findByTestId("new-webhook-endpoint-error")).toHaveTextContent("URL already in use");
    expect(screen.getByTestId("new-webhook-endpoint-dialog")).toBeInTheDocument();
  });
});
