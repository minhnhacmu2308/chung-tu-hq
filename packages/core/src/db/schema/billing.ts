import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id, money, orgId, orgRls } from "./shared.js";

/** Mọi lần gọi AI / API trả phí bên thứ 3 (B8). */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id"),
    documentId: text("document_id"),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: money("cost_usd").notNull().default("0"),
    costVnd: money("cost_vnd").notNull().default("0"),
    meta: jsonb("meta"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_events_org_at_idx").on(t.orgId, t.at), orgRls("usage_events_rls")],
).enableRLS();
