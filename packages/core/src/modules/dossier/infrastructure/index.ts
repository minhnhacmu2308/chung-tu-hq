import type { Redis } from "ioredis";
import type { Env } from "../../../config/env.js";
import type { Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { DossierDeps, ObjectStorage, QuotaChecker } from "../application/ports.js";
import { DrizzleDossierUow } from "./drizzle-uow.js";
import { PdfLibInspector } from "./pdf-inspector.js";
import { RedisProgressPublisher } from "./redis-publisher.js";
import { S3ObjectStorage } from "./s3-storage.js";
import { FflateUnzipper } from "./unzipper.js";

export { DrizzleDossierUow, FflateUnzipper, PdfLibInspector, RedisProgressPublisher, S3ObjectStorage };

export function createDossierInfrastructure(opts: { db: Db; redis: Redis; env: Env; queue: JobQueue; quota: QuotaChecker; storage?: ObjectStorage; clock?: Clock }): DossierDeps {
  return {
    uow: new DrizzleDossierUow(opts.db),
    queue: opts.queue,
    storage: opts.storage ?? new S3ObjectStorage(opts.env, opts.env.S3_BUCKET),
    publisher: new RedisProgressPublisher(opts.redis),
    pdf: new PdfLibInspector(),
    unzipper: new FflateUnzipper(),
    quota: opts.quota,
    clock: opts.clock ?? systemClock,
    idGen: ulidIdGen,
  };
}
