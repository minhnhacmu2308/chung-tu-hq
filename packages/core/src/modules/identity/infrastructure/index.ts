import type { Redis } from "ioredis";
import type { Env } from "../../../config/env.js";
import type { Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { OrgAuditWriter } from "../../../shared/audit.js";
import type { IdentityDeps, SecretStore } from "../application/ports.js";
import { AesSecretStore } from "./aes-secret-store.js";
import { DrizzleOrgAudit } from "./drizzle-org-audit.js";
import { Argon2Hasher } from "./argon2-hasher.js";
import { DrizzlePlansReader } from "./drizzle-plans-reader.js";
import { DrizzleIdentityUow, type CreditGrantTx } from "./drizzle-uow.js";
import { FakeTaxRegistryLookup } from "./fake-tax-registry.js";
import { InMemoryRateLimiter } from "./in-memory-rate-limiter.js";
import { ConsoleMailer, SmtpMailer } from "./mailer.js";
import { createNotifier } from "./notifier.js";
import { RedisRateLimiter } from "./redis-rate-limiter.js";

export { AesSecretStore, Argon2Hasher, ConsoleMailer, createNotifier, DrizzleIdentityUow, DrizzlePlansReader, FakeTaxRegistryLookup, InMemoryRateLimiter, RedisRateLimiter, SmtpMailer };

export type { CreditGrantTx };

/** Nối toàn bộ hạ tầng identity theo cấu hình môi trường. Gọi từ container của apps. `grantCredits`: ghi tặng lượt cùng transaction (billing cung cấp). */
export function createIdentityInfrastructure(opts: { db: Db; redis?: Redis; env: Env; clock?: Clock; grantCredits?: CreditGrantTx }): IdentityDeps & { secrets: SecretStore; audit: OrgAuditWriter } {
  const clock = opts.clock ?? systemClock;
  const uow = new DrizzleIdentityUow(opts.db, opts.grantCredits);
  return {
    uow,
    audit: new DrizzleOrgAudit(uow, clock),
    plans: new DrizzlePlansReader(opts.db),
    hasher: new Argon2Hasher(),
    rateLimiter: opts.redis ? new RedisRateLimiter(opts.redis) : new InMemoryRateLimiter(clock),
    mailer: opts.env.MAIL === "smtp" && opts.env.SMTP_URL ? new SmtpMailer(opts.env.SMTP_URL) : new ConsoleMailer(),
    taxRegistry: new FakeTaxRegistryLookup(),
    clock,
    idGen: ulidIdGen,
    appUrl: opts.env.APP_URL,
    secrets: AesSecretStore.fromEnv(opts.env),
  };
}
