import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/agents",
}));

describe("AppSidebar", () => {
  it("renders all 8 nav sections with a data-testid each", () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    const expected = [
      "nav-dashboard",
      "nav-playground",
      "nav-calls",
      "nav-agents",
      "nav-trunks",
      "nav-webhooks",
      "nav-costs",
      "nav-settings",
    ];

    for (const testId of expected) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });

  it("renders every nav label as visible text", () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    for (const label of ["Dashboard", "Playground", "Calls", "Agents", "Trunks", "Webhooks", "Costs", "Settings"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
