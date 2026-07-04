import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceTableEditor } from "@/app/(shell)/settings/price-table-editor";

function entry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "row-1",
    provider: "deepgram",
    providerType: "stt",
    unitType: "seconds",
    pricePerUnit: 0.0043,
    currency: "USD",
    ...overrides,
  };
}

describe("PriceTableEditor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders one row per price-table entry with its current rate", () => {
    render(<PriceTableEditor initialEntries={[entry()]} />);
    expect(screen.getByTestId("price-input-deepgram-stt")).toHaveValue(0.0043);
  });

  it("submits the edited rate and reflects the server's updated value", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => entry({ pricePerUnit: 0.009 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<PriceTableEditor initialEntries={[entry()]} />);

    const input = screen.getByTestId("price-input-deepgram-stt");
    await user.clear(input);
    await user.type(input, "0.009");
    await user.click(screen.getByTestId("price-save-deepgram-stt"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, options] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(options.body as string)).toMatchObject({
      provider: "deepgram",
      providerType: "stt",
      unitType: "seconds",
      pricePerUnit: 0.009,
    });

    await waitFor(() => expect(screen.getByTestId("price-input-deepgram-stt")).toHaveValue(0.009));
  });

  it("does not submit a negative price", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<PriceTableEditor initialEntries={[entry()]} />);

    const input = screen.getByTestId("price-input-deepgram-stt");
    await user.clear(input);
    await user.type(input, "-1");
    await user.click(screen.getByTestId("price-save-deepgram-stt"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not silently save a zero rate when the input is cleared to empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<PriceTableEditor initialEntries={[entry()]} />);

    const input = screen.getByTestId("price-input-deepgram-stt");
    await user.clear(input);
    await user.click(screen.getByTestId("price-save-deepgram-stt"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("price-error-deepgram-stt")).toBeInTheDocument();
  });

  it("surfaces an error and does not update the displayed rate when the save request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<PriceTableEditor initialEntries={[entry()]} />);

    const input = screen.getByTestId("price-input-deepgram-stt");
    await user.clear(input);
    await user.type(input, "0.009");
    await user.click(screen.getByTestId("price-save-deepgram-stt"));

    await waitFor(() => expect(screen.getByTestId("price-error-deepgram-stt")).toBeInTheDocument());
    expect(screen.getByTestId("price-input-deepgram-stt")).toHaveValue(0.009); // draft is preserved, not reverted or lost
  });
});
