import { Router } from "express";
import { UpsertPriceTableEntryBodySchema, type PriceTableEntryResponse } from "@callplane/contracts";
import type { PriceTable, PriceTableRepository } from "@callplane/database";
import { requireApiKey } from "../middleware/auth.js";
import { sendValidationError } from "../lib/send-error.js";

function serializePriceTableEntry(entry: PriceTable): PriceTableEntryResponse {
  return {
    id: entry.id,
    provider: entry.provider,
    providerType: entry.providerType,
    unitType: entry.unitType,
    pricePerUnit: Number(entry.pricePerUnit),
    currency: entry.currency,
  };
}

export function createPriceTableRouter(priceTableRepo: PriceTableRepository): Router {
  const router = Router();

  router.get("/v1/price-table", requireApiKey, async (_req, res) => {
    const entries = await priceTableRepo.listAll();
    res.json({ entries: entries.map(serializePriceTableEntry) });
  });

  // Upsert, not create+update — a (provider, providerType, unitType) triple is the natural key
  // (matches the DB's own @@unique) and D6 editing is "set the rate for this leg", not "create a
  // new row vs. edit an existing one" as two different user actions.
  router.post("/v1/price-table", requireApiKey, async (req, res, next) => {
    const parsed = UpsertPriceTableEntryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const { provider, providerType, unitType, pricePerUnit, currency } = parsed.data;
    try {
      const entry = await priceTableRepo.upsert({
        provider,
        providerType,
        unitType,
        pricePerUnit,
        ...(currency !== undefined ? { currency } : {}),
      });
      res.status(200).json(serializePriceTableEntry(entry));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
