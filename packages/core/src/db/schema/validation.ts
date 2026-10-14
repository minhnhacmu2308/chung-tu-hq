import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dossiers } from "./dossier.js";
import { id, orgId, orgRls } from "./shared.js";

/** Kết quả luật đối chiếu cho một phiên bản shipment. */
export const validations = pgTable(
  "validations",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    shipmentVersion: text("shipment_version").notNull(),
    ruleCode: text("rule_code").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    result: text("result").notNull(),
    severity: text("severity").notNull(),
    documentKinds: text("document_kinds").array().notNull().default([]),
    fields: text("fields").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("validations_dossier_ver_rule_uq").on(t.dossierId, t.shipmentVersion, t.ruleCode), index("validations_org_dossier_idx").on(t.orgId, t.dossierId), orgRls("validations_rls")],
).enableRLS();
