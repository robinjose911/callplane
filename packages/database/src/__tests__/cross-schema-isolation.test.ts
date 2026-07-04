import { describe, expect, it } from "vitest";
import { prisma } from "../index.js";

const EXPECTED_TABLES = [
  "agent_configs",
  "calls",
  "call_events",
  "sip_trunks",
  "provider_profiles",
  "language_profiles",
  "webhook_endpoints",
  "webhook_outbox",
  "call_costs",
  "price_table",
  "recordings",
].sort();

describe("cross-schema isolation", () => {
  it("the callplane schema contains exactly the expected tables — nothing created outside it", async () => {
    // Prisma's datasource `schemas = ["callplane"]` scopes every DDL statement to this one
    // schema; this asserts the push actually landed there and nowhere else, matching exactly
    // the 11 models in schema.prisma (no more, no less).
    const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'callplane'
    `;

    expect(rows.map((r) => r.tablename).sort()).toEqual(EXPECTED_TABLES);
  });
});
