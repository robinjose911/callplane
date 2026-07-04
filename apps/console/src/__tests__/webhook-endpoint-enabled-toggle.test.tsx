import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WebhookEndpointEnabledToggle } from "@/app/(shell)/webhooks/webhook-endpoint-enabled-toggle";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("WebhookEndpointEnabledToggle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes the endpoint with the new isEnabled value", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<WebhookEndpointEnabledToggle name="my-endpoint" isEnabled={false} />);
    await user.click(screen.getByTestId("webhook-endpoint-enabled-my-endpoint"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhook-endpoints/my-endpoint",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isEnabled: true }) }),
    );
  });

  it("reverts the visible state if the PATCH fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const user = userEvent.setup();

    render(<WebhookEndpointEnabledToggle name="my-endpoint" isEnabled={false} />);
    const toggle = screen.getByTestId("webhook-endpoint-enabled-my-endpoint");
    await user.click(toggle);

    expect(toggle).not.toBeChecked();
  });
});
