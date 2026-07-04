import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface AgentConfigResponse {
  id: string;
  name: string;
  voiceMode: string;
  s2sProvider: string | null;
  llmProvider: string | null;
  ttsProvider: string | null;
  isActive: boolean;
}

async function fetchAgents(): Promise<AgentConfigResponse[]> {
  const response = await apiFetch("/v1/agents");
  if (!response.ok) return [];
  const body = (await response.json()) as { agents: AgentConfigResponse[] };
  return body.agents;
}

export default async function AgentsPage() {
  const agents = await fetchAgents();

  return (
    <div className="flex flex-col gap-6" data-testid="agents-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <Link href="/agents/new" data-testid="new-agent-button" className={cn(buttonVariants())}>
          New agent
        </Link>
      </div>

      <Table data-testid="agents-table">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Voice mode</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => (
            <TableRow key={agent.id} data-testid={`agent-row-${agent.name}`}>
              <TableCell>
                <Link href={`/agents/${agent.name}`} className="font-medium hover:underline">
                  {agent.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{agent.voiceMode}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {agent.s2sProvider ?? agent.llmProvider ?? "—"}
                {agent.ttsProvider ? ` / ${agent.ttsProvider}` : ""}
              </TableCell>
              <TableCell>
                <Badge variant={agent.isActive ? "default" : "outline"}>
                  {agent.isActive ? "active" : "inactive"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
