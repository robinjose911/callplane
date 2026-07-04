import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewCallDialog } from "@/app/(shell)/calls/new-call-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const agents = [{ name: "demo-cascade", voiceMode: "cascade" }];

describe("NewCallDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an inline error and does not submit for an invalid E.164 number", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NewCallDialog agents={agents} stubMode={false} />);
    await user.click(screen.getByTestId("new-call-button"));
    await user.type(screen.getByTestId("new-call-number"), "0123");
    await user.click(screen.getByTestId("new-call-submit"));

    expect(await screen.findByTestId("new-call-number-error")).toHaveTextContent(/valid E.164/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits a sip-channel call with the phone number and dynamic variables", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ callSid: "call-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NewCallDialog agents={agents} stubMode={false} />);
    await user.click(screen.getByTestId("new-call-button"));
    await user.type(screen.getByTestId("new-call-number"), "+14155551234");
    await user.type(screen.getByTestId("variable-key-0"), "userName");
    await user.type(screen.getByTestId("variable-value-0"), "Robin");
    await user.click(screen.getByTestId("new-call-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/calls", expect.objectContaining({ method: "POST" })));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      agentId: "demo-cascade",
      channel: "sip",
      toNumber: "+14155551234",
      dynamicVariables: { userName: "Robin" },
    });
    expect(body).not.toHaveProperty("scenario");
  });

  it("includes a scenario field only when stubMode is true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ callSid: "call-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NewCallDialog agents={agents} stubMode={true} />);
    await user.click(screen.getByTestId("new-call-button"));
    await user.type(screen.getByTestId("new-call-number"), "+14155551234");
    await user.click(screen.getByTestId("new-call-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.scenario).toBe("demo_greeting");
  });

  it("shows a server-side error inline without closing the dialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Agent not found" } }) }),
    );
    const user = userEvent.setup();

    render(<NewCallDialog agents={agents} stubMode={false} />);
    await user.click(screen.getByTestId("new-call-button"));
    await user.type(screen.getByTestId("new-call-number"), "+14155551234");
    await user.click(screen.getByTestId("new-call-submit"));

    expect(await screen.findByTestId("new-call-error")).toHaveTextContent("Agent not found");
    expect(screen.getByTestId("new-call-dialog")).toBeInTheDocument();
  });
});
