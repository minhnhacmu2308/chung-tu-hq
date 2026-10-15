import type { Db } from "../../../db/client.js";
import { systemClock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { DossierProfileReader, ValidationDeps } from "../application/ports.js";
import { DrizzleValidationUow } from "./drizzle-uow.js";

export { DrizzleValidationUow };
/** `dossiers` (tùy chọn): composition root nối từ module dossier để luật biết nhập/xuất, phương thức vận chuyển. */
export const createValidationInfrastructure = (opts: { db: Db; dossiers?: DossierProfileReader }): ValidationDeps => ({
  uow: new DrizzleValidationUow(opts.db), idGen: ulidIdGen, clock: systemClock, ...(opts.dossiers ? { dossiers: opts.dossiers } : {}),
});
