"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CostsBarChart({ data }: { data: { provider: string; total: number }[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="costs-chart-empty">
        No cost data yet.
      </p>
    );
  }

  return (
    <div data-testid="costs-chart" style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="provider" />
          <YAxis />
          <Tooltip formatter={(value) => `$${Number(value).toFixed(6)}`} />
          <Bar dataKey="total" fill="var(--color-primary, #6366f1)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
