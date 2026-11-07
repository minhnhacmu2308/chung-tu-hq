import { sql } from "drizzle-orm";
import { check, integer, pgPolicy, pgTable, text } from "drizzle-orm/pg-core";
import { appRole, money, timestamps } from "./shared.js";

/**
 * Gói dịch vụ – dữ liệu chung (ADR 0011). Role ứng dụng (kb_app) chỉ đọc; sửa giá qua khu Quản trị (kb_platform) hoặc seed.
 * `kind`: PAYG (theo lượt, đơn giá `price_per_declaration_vnd`) | CONTRACT (hợp đồng năm, `price_vnd` = giá niêm yết tham khảo, 0 = "Liên hệ").
 */
export const plans = pgTable(
  "plans",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    pagesPerDossier: integer("pages_per_dossier").notNull(),
    priceVnd: money("price_vnd").notNull().default("0"),
    /** Đơn giá một lượt (1 tờ khai nhánh được chấp nhận khai chính thức) – chỉ PAYG; CONTRACT = 0. */
    pricePerDeclarationVnd: money("price_per_declaration_vnd").notNull().default("0"),
    ...timestamps(),
  },
  () => [check("plans_kind_chk", sql`kind in ('PAYG', 'CONTRACT')`), pgPolicy("plans_read", { for: "select", to: appRole, using: sql`true` })],
).enableRLS();
