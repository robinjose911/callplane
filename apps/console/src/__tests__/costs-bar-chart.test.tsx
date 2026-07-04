import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CostsBarChart } from "@/app/(shell)/costs/costs-bar-chart";

describe("CostsBarChart", () => {
  it("shows an empty state when there's no cost data", () => {
    render(<CostsBarChart data={[]} />);
    expect(screen.getByTestId("costs-chart-empty")).toBeInTheDocument();
  });

  it("renders the chart container when data is present", () => {
    render(<CostsBarChart data={[{ provider: "deepgram", total: 0.02 }]} />);
    expect(screen.getByTestId("costs-chart")).toBeInTheDocument();
  });
});
