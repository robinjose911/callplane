import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewTrunkDialog } from "@/app/(shell)/trunks/new-trunk-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("NewTrunkDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults the provider select to the first option and weight to 100", async () => {
    const user = userEvent.setup();
    render(<NewTrunkDialog />);
    await user.click(screen.getByTestId("new-trunk-button"));

    expect(screen.getByTestId("trunk-provider-select")).toHaveValue("telnyx");
    expect(screen.getByTestId("trunk-weight-input")).toHaveValue(100);
  });

  it("submits the form with name, provider, livekitTrunkId, credentialsRef, and weight", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "trunk-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NewTrunkDialog />);
    await user.click(screen.getByTestId("new-trunk-button"));
    await user.type(screen.getByTestId("trunk-name-input"), "my-trunk");
    await user.type(screen.getByTestId("trunk-livekit-id-input"), "ST_abc123");
    await user.type(screen.getByTestId("trunk-credentials-ref-input"), "test-trunk-credentials-env-var-name");

    await user.click(screen.getByTestId("new-trunk-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trunks", expect.objectContaining({ method: "POST" })));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      name: "my-trunk",
      provider: "telnyx",
      livekitTrunkId: "ST_abc123",
      credentialsRef: "test-trunk-credentials-env-var-name",
      weight: 100,
    });
  });

  it("shows a server-side error inline without closing the dialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Name already in use" } }) }),
    );
    const user = userEvent.setup();

    render(<NewTrunkDialog />);
    await user.click(screen.getByTestId("new-trunk-button"));
    await user.type(screen.getByTestId("trunk-name-input"), "x");
    await user.type(screen.getByTestId("trunk-livekit-id-input"), "ST_x");
    await user.type(screen.getByTestId("trunk-credentials-ref-input"), "ref");
    await user.click(screen.getByTestId("new-trunk-submit"));

    expect(await screen.findByTestId("new-trunk-error")).toHaveTextContent("Name already in use");
    expect(screen.getByTestId("new-trunk-dialog")).toBeInTheDocument();
  });
});
