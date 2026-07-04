import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api-client";
import { NewTrunkDialog } from "./new-trunk-dialog";
import { TrunkActiveToggle } from "./trunk-active-toggle";

interface SipTrunkResponse {
  id: string;
  name: string;
  provider: string;
  livekitTrunkId: string;
  maxConcurrentCalls: number;
  weight: number;
  isActive: boolean;
}

async function fetchTrunks(): Promise<SipTrunkResponse[]> {
  const response = await apiFetch("/v1/trunks");
  if (!response.ok) return [];
  const body = (await response.json()) as { trunks: SipTrunkResponse[] };
  return body.trunks;
}

export default async function TrunksPage() {
  const trunks = await fetchTrunks();

  return (
    <div className="flex flex-col gap-6" data-testid="trunks-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Trunks</h1>
        <NewTrunkDialog />
      </div>

      <Table data-testid="trunks-table">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>LiveKit trunk ID</TableHead>
            <TableHead>Weight</TableHead>
            <TableHead>Max concurrent</TableHead>
            <TableHead>Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trunks.map((trunk) => (
            <TableRow key={trunk.id} data-testid={`trunk-row-${trunk.name}`}>
              <TableCell className="font-medium">{trunk.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{trunk.provider}</TableCell>
              <TableCell className="text-muted-foreground font-mono text-sm">{trunk.livekitTrunkId}</TableCell>
              <TableCell>{trunk.weight}</TableCell>
              <TableCell>{trunk.maxConcurrentCalls}</TableCell>
              <TableCell>
                <TrunkActiveToggle name={trunk.name} isActive={trunk.isActive} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
