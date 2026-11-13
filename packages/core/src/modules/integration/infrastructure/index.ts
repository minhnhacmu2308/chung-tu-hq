import type { IntegrationId } from "@kb/contracts";
import type { Env } from "../../../config/env.js";
import type { Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import { CUSTOMS_POLL_DELAY_MS } from "../application/poll-status.js";
import type { IntegrationDeps, IntegrationProbe } from "../application/ports.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { DeclarationDeps } from "../../declaration/index.js";
import type { DossierDeps } from "../../dossier/index.js";
import type { IdentityDeps } from "../../identity/index.js";
import type { ValidationDeps } from "../../validation/index.js";
import type { CustomsDeps, CustomsGateway } from "../application/customs-ports.js";
import { FakeCustomsGateway } from "../application/test/fake-customs-gateway.js";
import { createCertificateReader, createCustomsDossierPort, createCustomsValidationReader, createDeclarationReader, createVnaccsCredentialsReader } from "./customs-adapters.js";
import { customsHubProbe } from "./customs-hub-probe.js";
import { DrizzleCustomsUow } from "./drizzle-customs-uow.js";
import { DrizzleIntegrationStatusRepo } from "./drizzle-status-repo.js";
import type { Redis } from "ioredis";
import { FPT_PATHS, FptRestClient, FptTransientError } from "./fpt-rest-client.js";
import { RedisFptTrace, type FptExchange } from "./fpt-trace.js";
import { FptHttpClientStub, FptVnaccsGateway, type FptHttpClient, type VnaccsCredentialsReader } from "./fpt-vnaccs-gateway.js";

export { RedisFptTrace, toTraceEntry, type FptExchange } from "./fpt-trace.js";
export { DrizzleCustomsUow, DrizzleIntegrationStatusRepo, FakeCustomsGateway, FPT_PATHS, FptHttpClientStub, FptRestClient, FptTransientError, FptVnaccsGateway, type FptHttpClient, type VnaccsCredentialsReader };
export { createCertificateReader, createCustomsDossierPort, createCustomsValidationReader, createDeclarationReader, createVnaccsCredentialsReader };

/** Tài khoản VNACCS chung từ env (dev/test với fpt-mock) – dùng khi doanh nghiệp chưa có tài khoản riêng. */
export function envVnaccsCredentials(env: Env): VnaccsCredentialsReader {
  const { FPT_VNACCS_USER_ID: u, FPT_VNACCS_PASSWORD: p, FPT_VNACCS_TERMINAL_ID: t, FPT_VNACCS_TERMINAL_ACCESS_KEY: k } = env;
  const creds = u && p && t && k ? { useR_ID: u, password: p, terminaL_ID: t, terminaL_ACCESS_KEY: k } : null;
  return { get: async () => creds };
}

/** Gateway theo env: fake (dev/demo) hoặc FPT (HTTP thật – dev trỏ apps/fpt-mock). */
export function createCustomsGateway(env: Env, creds: VnaccsCredentialsReader, http?: FptHttpClient, clock?: Clock): CustomsGateway {
  if (env.CUSTOMS_GATEWAY !== "fpt") return new FakeCustomsGateway();
  return new FptVnaccsGateway(http ?? createFptHttpClient(env) ?? new FptHttpClientStub(), creds, clock ? { now: () => clock.now() } : {});
}

/** Client HTTP FPT theo env; thiếu cấu hình → null. */
export function createFptHttpClient(env: Env, opts: { timeoutMs?: number; trace?: (e: FptExchange) => void } = {}): FptRestClient | null {
  if (!env.FPT_API_BASE_URL || !env.FPT_API_USERNAME || !env.FPT_API_PASSWORD) return null;
  return new FptRestClient({ baseUrl: env.FPT_API_BASE_URL, username: env.FPT_API_USERNAME, password: env.FPT_API_PASSWORD, timeoutMs: opts.timeoutMs ?? env.FPT_API_TIMEOUT_MS, ...(opts.trace ? { trace: opts.trace } : {}) });
}

export function createCustomsInfrastructure(opts: {
  db: Db; env: Env; queue: JobQueue; declaration: DeclarationDeps; dossier: DossierDeps; validation: ValidationDeps; identity: IdentityDeps; creds?: VnaccsCredentialsReader; gateway?: CustomsGateway; clock?: Clock;
  /** GỠ LỖI TẠM (FPT_DEBUG_TRACE): nơi lưu nhật ký API FPT. */
  redis?: Redis;
}): CustomsDeps {
  // GỠ LỖI TẠM (FPT_DEBUG_TRACE): chỉ khi gọi FPT thật qua HTTP.
  const fptTrace = !opts.gateway && opts.env.FPT_DEBUG_TRACE && opts.env.CUSTOMS_GATEWAY === "fpt" && opts.redis ? new RedisFptTrace(opts.redis) : undefined;
  const http = fptTrace ? createFptHttpClient(opts.env, { trace: (e) => fptTrace.record(e) }) ?? undefined : undefined;
  const creds = opts.creds ?? createVnaccsCredentialsReader(opts.identity, envVnaccsCredentials(opts.env));
  const gateway = opts.gateway ?? createCustomsGateway(opts.env, creds, http, opts.clock ?? systemClock);
  return {
    ...(fptTrace ? { fptTrace } : {}),
    ...(!opts.gateway && opts.env.FPT_DEBUG_TRACE ? { fptDebug: true } : {}),
    uow: new DrizzleCustomsUow(opts.db), queue: opts.queue, gateway,
    declarations: createDeclarationReader(opts.declaration), dossiers: createCustomsDossierPort(opts.dossier), validation: createCustomsValidationReader(opts.validation), certificates: createCertificateReader(opts.identity),
    audit: opts.declaration.audit, org: { fourEyes: async (orgId) => (await opts.declaration.org.get(orgId)).fourEyes },
    vnaccsUserId: async (orgId) => (await creds.get(orgId))?.useR_ID ?? null,
    pollDelayMs: gateway.name === "fake-customs" ? 3_000 : CUSTOMS_POLL_DELAY_MS, clock: opts.clock ?? systemClock, idGen: ulidIdGen,
  };
}

/**
 * Probe theo cấu hình môi trường. Adapter thật (FPT, hscodepro, Claude) nối ở các giai đoạn sau;
 * `defaultCertificate` lấy từ identity để mô phỏng "ký thử" như mock.
 */
export function createIntegrationInfrastructure(opts: {
  db: Db;
  env: Env;
  clock?: Clock;
  defaultCertificate: (orgId: string) => Promise<{ issuer: string; validTo: string } | null>;
  /** Tài khoản VNACCS của org (Kiểm tra kết nối khi CUSTOMS_GATEWAY=fpt). */
  vnaccs?: VnaccsCredentialsReader;
}): IntegrationDeps {
  const clock = opts.clock ?? systemClock;
  const probes: Record<IntegrationId, IntegrationProbe> = {
    HSCODEPRO: { configured: true, probe: async () => ({ ok: true, detail: opts.env.HS_CLASSIFIER === "fake" ? "Giả lập (chưa nối hscodepro thật)" : `API ${opts.env.HSCODEPRO_URL}` }) },
    AI_PROVIDER: { configured: true, probe: async () => ({ ok: true, detail: opts.env.AI_PROVIDER === "fake" ? "Giả lập (AI_PROVIDER=fake)" : `Claude · ${opts.env.AI_MODEL}` }) },
    // "Kiểm tra kết nối" chạy trong request web → timeout ngắn hơn job truyền.
    CUSTOMS_HUB: customsHubProbe({ env: opts.env, clock, defaultCertificate: opts.defaultCertificate, fpt: createFptHttpClient(opts.env, { timeoutMs: 10_000 }), ...(opts.vnaccs ? { vnaccs: opts.vnaccs } : {}) }),
    EINVOICE: { configured: false, probe: async () => ({ ok: false, detail: "" }) },
  };
  return { statusRepo: new DrizzleIntegrationStatusRepo(opts.db), probes, clock, idGen: ulidIdGen };
}
