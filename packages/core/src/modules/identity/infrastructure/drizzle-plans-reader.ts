import { eq } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import { plans } from "../../../db/schema/plans.js";
import type { PlanRow, PlansReader } from "../application/ports.js";

/** Bảng plans không RLS (danh mục gói). */
export class DrizzlePlansReader implements PlansReader {
  constructor(private db: Db) {}
  async get(code: string) {
    const p = (await this.db.select().from(plans).where(eq(plans.code, code)).limit(1))[0];
    return p ? { code: p.code, name: p.name, kind: p.kind as PlanRow["kind"], pagesPerDossier: p.pagesPerDossier, pricePerDeclarationVnd: p.pricePerDeclarationVnd } : null;
  }
}
