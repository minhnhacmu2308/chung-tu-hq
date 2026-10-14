import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { money, timestamps } from "./shared.js";

export const plans = pgTable("plans", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  dossiersPerMonth: integer("dossiers_per_month").notNull(),
  pagesPerDossier: integer("pages_per_dossier").notNull(),
  priceVnd: money("price_vnd").notNull().default("0"),
  ...timestamps(),
});
