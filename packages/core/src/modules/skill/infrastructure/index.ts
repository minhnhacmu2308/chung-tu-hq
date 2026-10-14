import type { Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { ObjectStorage, PdfInspector } from "../../dossier/index.js";
import type { AiProvider, UsageRecorder } from "../../extraction/index.js";
import type { SkillDeps, UserNames } from "../application/ports.js";
import { DrizzleSkillUow } from "./drizzle-uow.js";

export { DrizzleSkillUow };

/** Nối hạ tầng skill: dùng chung storage/pdf của dossier, AI/usage của extraction (container truyền vào). */
export function createSkillInfrastructure(opts: { db: Db; queue: JobQueue; storage: ObjectStorage; pdf: PdfInspector; ai: AiProvider; usage: UsageRecorder; users: UserNames; clock?: Clock }): SkillDeps {
  return { uow: new DrizzleSkillUow(opts.db), storage: opts.storage, queue: opts.queue, ai: opts.ai, usage: opts.usage, users: opts.users, pdf: opts.pdf, clock: opts.clock ?? systemClock, idGen: ulidIdGen };
}
