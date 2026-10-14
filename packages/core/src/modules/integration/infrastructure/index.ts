import type { IntegrationId } from "@kb/contracts";
import type { Env } from "../../../config/env.js";
import type { Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { IntegrationDeps, IntegrationProbe } from "../application/ports.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { DeclarationDeps } from "../../declaration/index.js";
import type { DossierDeps } from "../../dossier/index.js";
import type { IdentityDeps } from "../../identity/index.js";
import type { ValidationDeps } from "../../validation/index.js";
import type { CustomsDeps, CustomsGateway } from "../application/customs-ports.js";
import { FakeCustomsGateway } from "../application/test/fake-customs-gateway.js";
import { createCertificateReader, createCustomsDossierPort, createCustomsValidationReader, createDeclarationReader } from "./customs-adapters.js";
import { DrizzleCustomsUow } from "./drizzle-customs-uow.js";
import { DrizzleIntegrationStatusRepo } from "./drizzle-status-repo.js";
import { FptHttpClientStub, FptVnaccsGateway, type FptHttpClient, type VnaccsCredentialsReader } from "./fpt-vnaccs-gateway.js";

export { DrizzleCustomsUow, DrizzleIntegrationStatusRepo, FakeCustomsGateway, FptHttpClientStub, FptVnaccsGateway, type FptHttpClient, type VnaccsCredentialsReader };
export { createCertificateReader, createCustomsDossierPort, createCustomsValidationReader, createDeclarationReader };

/** Gateway theo env: fake (dev/demo) hoặc FPT (khung HTTP – T1). */
export function createCustomsGateway(env: Env, creds: VnaccsCredentialsReader, http?: FptHttpClient): CustomsGateway {
  if (env.CUSTOMS_GATEWAY === "fpt") return new FptVnaccsGateway(http ?? new FptHttpClientStub(), creds);
  return new FakeCustomsGateway();
}

export function createCustomsInfrastructure(opts: {
  db: Db; env: Env; queue: JobQueue; declaration: DeclarationDeps; dossier: DossierDeps; validation: ValidationDeps; identity: IdentityDeps; creds?: VnaccsCredentialsReader; gateway?: CustomsGateway; clock?: Clock;
}): CustomsDeps {
  const gateway = opts.gateway ?? createCustomsGateway(opts.env, opts.creds ?? { get: async () => null });
  return {
    uow: new DrizzleCustomsUow(opts.db), queue: opts.queue, gateway,
    declarations: createDeclarationReader(opts.declaration), dossiers: createCustomsDossierPort(opts.dossier), validation: createCustomsValidationReader(opts.validation), certificates: createCertificateReader(opts.identity),
    pollDelayMs: gateway.name === "fake-customs" ? 3_000 : 30_000, clock: opts.clock ?? systemClock, idGen: ulidIdGen,
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
}): IntegrationDeps {
  const clock = opts.clock ?? systemClock;
  const probes: Record<IntegrationId, IntegrationProbe> = {
    HSCODEPRO: { configured: true, probe: async () => ({ ok: true, detail: opts.env.HS_CLASSIFIER === "fake" ? "Giả lập (chưa nối hscodepro thật)" : `API ${opts.env.HSCODEPRO_URL}` }) },
    AI_PROVIDER: { configured: true, probe: async () => ({ ok: true, detail: opts.env.AI_PROVIDER === "fake" ? "Giả lập (AI_PROVIDER=fake)" : `Claude · ${opts.env.AI_MODEL}` }) },
    CUSTOMS_HUB: {
      configured: true,
      probe: async (orgId) => {
        const cert = await opts.defaultCertificate(orgId);
        if (!cert) return { ok: false, detail: "Chưa chọn chứng thư số mặc định." };
        const days = (new Date(cert.validTo).getTime() - clock.now().getTime()) / 86_400_000;
        if (days < 30) return { ok: false, detail: "Chứng thư số mặc định sắp hết hạn – Customs Hub từ chối ký thử (mã E-CERT-EXPIRING)." };
        return { ok: true, detail: `Ký thử thành công bằng chứng thư ${cert.issuer} · ${opts.env.CUSTOMS_GATEWAY === "fake" ? "môi trường giả lập" : "FPT.VNACCS"}` };
      },
    },
    EINVOICE: { configured: false, probe: async () => ({ ok: false, detail: "" }) },
  };
  return { statusRepo: new DrizzleIntegrationStatusRepo(opts.db), probes, clock, idGen: ulidIdGen };
}
