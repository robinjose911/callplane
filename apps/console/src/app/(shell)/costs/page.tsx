import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { CostsBarChart } from "./costs-bar-chart";

interface CallCostResponse {
  id: string;
  callSid: string;
  provider: string;
  providerType: string;
  units: number;
  unitType: string;
  costAmount: number;
  currency: string;
  createdAt: string;
}

async function fetchCosts(): Promise<CallCostResponse[]> {
  const response = await apiFetch("/v1/costs");
  if (!response.ok) return [];
  const body = (await response.json()) as { costs: CallCostResponse[] };
  return body.costs;
}

function aggregateByProvider(costs: CallCostResponse[]): { provider: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const cost of costs) {
    totals.set(cost.provider, (totals.get(cost.provider) ?? 0) + cost.costAmount);
  }
  return Array.from(totals.entries())
    .map(([provider, total]) => ({ provider, total }))
    .sort((a, b) => b.total - a.total);
}

export default async function CostsPage() {
  const costs = await fetchCosts();
  const total = costs.reduce((sum, c) => sum + c.costAmount, 0);
  const byProvider = aggregateByProvider(costs);
  const uniqueCalls = new Set(costs.map((c) => c.callSid)).size;

  return (
    <div className="flex flex-col gap-6" data-testid="costs-page">
      <h1 className="text-2xl font-semibold tracking-tight">Costs</h1>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total (last 500 cost rows)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl" data-testid="costs-total">
              ${total.toFixed(6)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Calls with cost data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl" data-testid="costs-call-count">
              {uniqueCalls}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By provider</CardTitle>
        </CardHeader>
        <CardContent>
          <CostsBarChart data={byProvider} />
        </CardContent>
      </Card>
    </div>
  );
}
