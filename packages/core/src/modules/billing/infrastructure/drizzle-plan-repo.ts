import { eq } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import { plans } from "../../../db/schema/plans.js";
import type { PlanRow, PlansReader } from "../application/ports.js";

/** Bảng plans: kb_app chỉ đọc (danh mục gói). */
export class DrizzlePlansRepo implements PlansReader {
  constructor(private db: Db) {}
  async get(code: string): Promise<PlanRow | null> {
    const p = (await this.db.select().from(plans).where(eq(plans.code, code)).limit(1))[0];
    return p ? { code: p.code, name: p.name, kind: p.kind as PlanRow["kind"], pagesPerDossier: p.pagesPerDossier, priceVnd: p.priceVnd, pricePerDeclarationVnd: p.pricePerDeclarationVnd } : null;
  }
}
