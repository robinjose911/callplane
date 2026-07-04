"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface PriceTableEntryResponse {
  id: string;
  provider: string;
  providerType: string;
  unitType: string;
  pricePerUnit: number;
  currency: string;
}

export function PriceTableEditor({ initialEntries }: { initialEntries: PriceTableEntryResponse[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | undefined>(undefined);
  const [errorId, setErrorId] = useState<string | undefined>(undefined);

  function draftValue(entry: PriceTableEntryResponse): string {
    return drafts[entry.id] ?? String(entry.pricePerUnit);
  }

  async function handleSave(entry: PriceTableEntryResponse) {
    const raw = draftValue(entry).trim();
    const pricePerUnit = Number(raw);
    // raw === "" guards the empty-string case specifically: Number("") is 0, which would
    // otherwise pass the finite/non-negative check below and silently zero out a real rate.
    if (raw === "" || !Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
      setErrorId(entry.id);
      return;
    }

    setSavingId(entry.id);
    setErrorId(undefined);
    try {
      const response = await fetch("/api/price-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: entry.provider,
          providerType: entry.providerType,
          unitType: entry.unitType,
          pricePerUnit,
        }),
      });
      if (response.ok) {
        const updated: PriceTableEntryResponse = await response.json();
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
      } else {
        setErrorId(entry.id);
      }
    } catch {
      setErrorId(entry.id);
    } finally {
      setSavingId(undefined);
    }
  }

  return (
    <Card data-testid="price-table-editor">
      <CardHeader>
        <CardTitle>Price table</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2" data-testid="price-table-rows">
          {entries.map((entry) => (
            <li key={entry.id} data-testid={`price-row-${entry.provider}-${entry.providerType}`} className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground w-64 shrink-0">
                {entry.provider} · {entry.providerType} · {entry.unitType}
              </span>
              <Input
                type="number"
                step="0.000001"
                min="0"
                value={draftValue(entry)}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                className="w-32"
                data-testid={`price-input-${entry.provider}-${entry.providerType}`}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={savingId === entry.id}
                onClick={() => handleSave(entry)}
                data-testid={`price-save-${entry.provider}-${entry.providerType}`}
              >
                {savingId === entry.id ? "Saving..." : "Save"}
              </Button>
              {errorId === entry.id && (
                <span className="text-destructive text-xs" data-testid={`price-error-${entry.provider}-${entry.providerType}`}>
                  Couldn&apos;t save — enter a valid, non-negative rate and try again.
                </span>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
