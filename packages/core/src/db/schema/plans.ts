import { sql } from "drizzle-orm";
import { integer, pgPolicy, pgTable, text } from "drizzle-orm/pg-core";
import { appRole, money, timestamps } from "./shared.js";

/** Gói dịch vụ – dữ liệu chung. Role ứng dụng (kb_app) chỉ đọc; sửa giá/hạn mức qua khu Quản trị (kb_platform) hoặc seed. */
export const plans = pgTable(
  "plans",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    dossiersPerMonth: integer("dossiers_per_month").notNull(),
    pagesPerDossier: integer("pages_per_dossier").notNull(),
    priceVnd: money("price_vnd").notNull().default("0"),
    ...timestamps(),
  },
  () => [pgPolicy("plans_read", { for: "select", to: appRole, using: sql`true` })],
).enableRLS();
