import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/app/login/login-form";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("LoginForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts credentials to /api/auth/login and navigates to / on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    // jsdom doesn't implement real navigation — stub `href`'s setter so we can assert on it.
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "" },
    });
    const user = userEvent.setup();

    render(<LoginForm />);

    await user.type(screen.getByTestId("username-input"), "admin");
    await user.type(screen.getByTestId("password-input"), "secret");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => expect(window.location.href).toBe("/"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "admin", password: "secret" }),
      }),
    );

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("shows an inline error and does not navigate away on invalid credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const user = userEvent.setup();

    render(<LoginForm />);

    await user.type(screen.getByTestId("username-input"), "admin");
    await user.type(screen.getByTestId("password-input"), "wrong");
    await user.click(screen.getByTestId("login-submit"));

    expect(await screen.findByTestId("login-error")).toHaveTextContent(/invalid/i);
  });
});
