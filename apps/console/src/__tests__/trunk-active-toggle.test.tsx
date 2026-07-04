import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrunkActiveToggle } from "@/app/(shell)/trunks/trunk-active-toggle";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("TrunkActiveToggle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes the trunk's status endpoint with the new isActive value", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<TrunkActiveToggle name="my-trunk" isActive={false} />);
    await user.click(screen.getByTestId("trunk-active-my-trunk"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trunks/my-trunk",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isActive: true }) }),
    );
  });

  it("reverts the visible state if the PATCH fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const user = userEvent.setup();

    render(<TrunkActiveToggle name="my-trunk" isActive={false} />);
    const toggle = screen.getByTestId("trunk-active-my-trunk");
    await user.click(toggle);

    expect(toggle).not.toBeChecked();
  });
});
