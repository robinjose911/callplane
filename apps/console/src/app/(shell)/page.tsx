import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";

interface HealthPayload {
  ok: boolean;
  service: string;
  stubMode: boolean;
  sipStubMode: boolean;
  recordingMode: string;
}

async function fetchHealth(): Promise<HealthPayload | undefined> {
  try {
    const response = await apiFetch("/health");
    if (!response.ok) return undefined;
    return (await response.json()) as HealthPayload;
  } catch {
    return undefined;
  }
}

export default async function DashboardPage() {
  const health = await fetchHealth();

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard-page">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <Card data-testid="health-card">
        <CardHeader>
          <CardTitle>API health</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {health ? (
            <>
              <div className="flex items-center gap-2">
                <Badge data-testid="health-status" variant={health.ok ? "default" : "destructive"}>
                  {health.ok ? "healthy" : "unhealthy"}
                </Badge>
                <span className="text-muted-foreground text-sm">{health.service}</span>
              </div>
              <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt>Provider stub mode</dt>
                <dd data-testid="health-stub-mode">{String(health.stubMode)}</dd>
                <dt>SIP stub mode</dt>
                <dd data-testid="health-sip-stub-mode">{String(health.sipStubMode)}</dd>
                <dt>Recording mode</dt>
                <dd data-testid="health-recording-mode">{health.recordingMode}</dd>
              </dl>
            </>
          ) : (
            <Badge data-testid="health-status" variant="destructive">
              unreachable
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
