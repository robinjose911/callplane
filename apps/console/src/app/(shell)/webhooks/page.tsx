import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api-client";
import { NewWebhookEndpointDialog } from "./new-webhook-endpoint-dialog";
import { WebhookEndpointEnabledToggle } from "./webhook-endpoint-enabled-toggle";

interface WebhookEndpointResponse {
  id: string;
  name: string;
  url: string;
  isEnabled: boolean;
  eventTypes: string[];
}

async function fetchEndpoints(): Promise<WebhookEndpointResponse[]> {
  const response = await apiFetch("/v1/webhook-endpoints");
  if (!response.ok) return [];
  const body = (await response.json()) as { endpoints: WebhookEndpointResponse[] };
  return body.endpoints;
}

export default async function WebhooksPage() {
  const endpoints = await fetchEndpoints();

  return (
    <div className="flex flex-col gap-6" data-testid="webhooks-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <NewWebhookEndpointDialog />
      </div>

      <Table data-testid="webhook-endpoints-table">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Event types</TableHead>
            <TableHead>Enabled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {endpoints.map((endpoint) => (
            <TableRow key={endpoint.id} data-testid={`webhook-endpoint-row-${endpoint.name}`}>
              <TableCell className="font-medium">{endpoint.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{endpoint.url}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {endpoint.eventTypes.map((type) => (
                    <Badge key={type} variant="secondary">
                      {type}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <WebhookEndpointEnabledToggle name={endpoint.name} isEnabled={endpoint.isEnabled} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
