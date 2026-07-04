import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { NewCallDialog } from "./new-call-dialog";

interface CallResponse {
  callSid: string;
  agentId: string;
  channel: string;
  toNumber: string | null;
  status: string;
  createdAt: string;
}

interface AgentConfigResponse {
  name: string;
  voiceMode: string;
}

async function fetchCalls(status?: string): Promise<CallResponse[]> {
  const response = await apiFetch(`/v1/calls${status ? `?status=${status}` : ""}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { calls: CallResponse[] };
  return body.calls;
}

async function fetchAgents(): Promise<AgentConfigResponse[]> {
  const response = await apiFetch("/v1/agents");
  if (!response.ok) return [];
  const body = (await response.json()) as { agents: AgentConfigResponse[] };
  return body.agents;
}

async function fetchStubMode(): Promise<boolean> {
  try {
    const response = await apiFetch("/health");
    if (!response.ok) return false;
    const body = (await response.json()) as { stubMode: boolean };
    return body.stubMode;
  } catch {
    return false;
  }
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "COMPLETED") return "default";
  if (["FAILED", "NO_ANSWER", "BUSY", "CALL_DROPPED"].includes(status)) return "destructive";
  if (["QUEUED"].includes(status)) return "outline";
  return "secondary";
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const [calls, agents, stubMode] = await Promise.all([fetchCalls(status), fetchAgents(), fetchStubMode()]);

  return (
    <div className="flex flex-col gap-6" data-testid="calls-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
        <NewCallDialog agents={agents} stubMode={stubMode} />
      </div>

      <div className="flex items-center gap-2" data-testid="status-filter">
        <Link href="/calls" className={cn(buttonVariants({ variant: !status ? "default" : "outline", size: "sm" }))}>
          all
        </Link>
        {["QUEUED", "IN_PROGRESS", "COMPLETED", "FAILED"].map((s) => (
          <Link
            key={s}
            href={`/calls?status=${s}`}
            data-testid={`status-filter-${s}`}
            className={cn(buttonVariants({ variant: status === s ? "default" : "outline", size: "sm" }))}
          >
            {s}
          </Link>
        ))}
      </div>

      <Table data-testid="calls-table">
        <TableHeader>
          <TableRow>
            <TableHead>Call</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.map((call) => (
            <TableRow key={call.callSid} data-testid={`call-row-${call.callSid}`}>
              <TableCell>
                <Link href={`/calls/${call.callSid}`} className="font-mono text-xs hover:underline">
                  {call.callSid.slice(0, 8)}
                </Link>
              </TableCell>
              <TableCell>{call.agentId}</TableCell>
              <TableCell>
                <Badge variant="secondary">{call.channel}</Badge>
                {call.toNumber && <span className="text-muted-foreground ml-2 text-xs">{call.toNumber}</span>}
              </TableCell>
              <TableCell>
                <Badge data-testid={`call-status-${call.callSid}`} variant={statusVariant(call.status)}>
                  {call.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {new Date(call.createdAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
