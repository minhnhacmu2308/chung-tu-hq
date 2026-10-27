import type { Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { ObjectStorage, PdfInspector } from "../../dossier/index.js";
import type { AiProvider, UsageRecorder } from "../../extraction/index.js";
import type { TeachDeps, TeachLotPort } from "../application/ports.js";
import { DrizzleTeachUow } from "./drizzle-uow.js";

export { DrizzleTeachUow };

/** Nối hạ tầng Dạy khai báo: storage/pdf của dossier, AI/usage của extraction, dữ liệu lô do container nối (TeachLotPort). */
export function createTeachInfrastructure(opts: { db: Db; queue: JobQueue; storage: ObjectStorage; pdf: PdfInspector; ai: AiProvider; usage: UsageRecorder; lots: TeachLotPort; clock?: Clock }): TeachDeps {
  return { uow: new DrizzleTeachUow(opts.db), storage: opts.storage, queue: opts.queue, ai: opts.ai, usage: opts.usage, pdf: opts.pdf, lots: opts.lots, clock: opts.clock ?? systemClock, idGen: ulidIdGen };
}
export { billCandidates, createTeachLotPort } from "./lot-port.js";
