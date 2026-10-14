import { eq } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import { plans } from "../../../db/schema/plans.js";
import type { PlansReader } from "../application/ports.js";

export class DrizzlePlansRepo implements PlansReader {
  constructor(private db: Db) {}
  async get(code: string) {
    const p = (await this.db.select().from(plans).where(eq(plans.code, code)).limit(1))[0];
    return p ? { code: p.code, name: p.name, dossiersPerMonth: p.dossiersPerMonth, pagesPerDossier: p.pagesPerDossier } : null;
  }
}
