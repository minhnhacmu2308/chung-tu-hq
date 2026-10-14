import type { Db } from "../../../db/client.js";
import { systemClock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { ValidationDeps } from "../application/ports.js";
import { DrizzleValidationUow } from "./drizzle-uow.js";

export { DrizzleValidationUow };
export const createValidationInfrastructure = (opts: { db: Db }): ValidationDeps => ({ uow: new DrizzleValidationUow(opts.db), idGen: ulidIdGen, clock: systemClock });
