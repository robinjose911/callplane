import { apiFetch } from "@/lib/api-client";
import { PriceTableEditor } from "./price-table-editor";

interface PriceTableEntryResponse {
  id: string;
  provider: string;
  providerType: string;
  unitType: string;
  pricePerUnit: number;
  currency: string;
}

async function fetchPriceTable(): Promise<PriceTableEntryResponse[]> {
  const response = await apiFetch("/v1/price-table");
  if (!response.ok) return [];
  const body = (await response.json()) as { entries: PriceTableEntryResponse[] };
  return body.entries;
}

export default async function SettingsPage() {
  const entries = await fetchPriceTable();

  return (
    <div className="flex flex-col gap-6" data-testid="settings-page">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <PriceTableEditor initialEntries={entries} />
    </div>
  );
}
