import type { MailProvider } from "@kb/contracts";
import type { Env } from "../../../config/env.js";
import type { Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { asOrgId, asUserId, ulidIdGen } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import { ok } from "../../../shared/result.js";
import { classifyByFileName, uploadDocuments, type DossierDeps, type ObjectStorage } from "../../dossier/index.js";
import type { IdentityDeps } from "../../identity/index.js";
import type { DossierIntake, MailboxDeps, MailProviderAdapter } from "../application/ports.js";
import { DrizzleMailboxUow } from "./drizzle-uow.js";
import { FakeDevMailProvider } from "./fake-dev-provider.js";
import { GmailProvider } from "./gmail-provider.js";
import { HmacStateSigner } from "./hmac-state-signer.js";
import { OutlookProvider } from "./outlook-provider.js";

export { DrizzleMailboxUow, FakeDevMailProvider, GmailProvider, HmacStateSigner, OutlookProvider };

/** Gmail / Outlook thật (MAILBOX_PROVIDER=live) hoặc hộp thư giả lập (fake – dev/demo). */
export function createMailProviders(env: Env, clock: Clock = systemClock): Record<MailProvider, MailProviderAdapter> {
  if (env.MAILBOX_PROVIDER === "fake") return { GMAIL: new FakeDevMailProvider("GMAIL", clock), OUTLOOK: new FakeDevMailProvider("OUTLOOK", clock) };
  return {
    GMAIL: new GmailProvider({ clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET, clock }),
    OUTLOOK: new OutlookProvider({ clientId: env.MICROSOFT_OAUTH_CLIENT_ID, clientSecret: env.MICROSOFT_OAUTH_CLIENT_SECRET, tenant: env.MICROSOFT_OAUTH_TENANT, clock }),
  };
}

/**
 * Nối hạ tầng hộp thư chứng từ. Mã hóa token dùng chung khóa org_secrets của identity (APP_MASTER_KEY);
 * file đính kèm lưu cùng kho chứng từ; xếp file vào hồ sơ đi qua use case tải chứng từ của module dossier.
 */
export function createMailboxInfrastructure(opts: {
  db: Db; env: Env; queue: JobQueue; dossier: DossierDeps; identity: IdentityDeps; storage?: ObjectStorage; providers?: Record<MailProvider, MailProviderAdapter>; clock?: Clock;
}): MailboxDeps {
  const clock = opts.clock ?? systemClock;
  const sys = (orgId: string) => ({ orgId: asOrgId(orgId), userId: asUserId("") });
  const dossiers: DossierIntake = {
    list: async (orgId) =>
      (await opts.dossier.uow.asOrg(sys(orgId), (r) => r.dossiers.list(orgId, {}))).map((d) => ({ id: d.id, code: d.code, partner: d.partner, billNo: d.billNo, status: d.status, updatedAt: d.updatedAt })),
    addFiles: async (ctx, dossierId, files) => {
      const r = await uploadDocuments(opts.dossier, ctx, dossierId, files);
      return r.ok ? ok({ added: r.value.length }) : r;
    },
    guessKind: classifyByFileName,
  };
  return {
    uow: new DrizzleMailboxUow(opts.db),
    providers: opts.providers ?? createMailProviders(opts.env, clock),
    cipher: opts.identity.secrets ?? null,
    state: new HmacStateSigner(opts.env.APP_MASTER_KEY),
    storage: opts.storage ?? opts.dossier.storage,
    queue: opts.queue,
    dossiers,
    members: {
      names: async (orgId, userIds) =>
        userIds.length ? Object.fromEntries((await opts.identity.uow.asOrg(sys(orgId), (r) => r.users.findByIds(userIds))).map((u) => [u.id, u.name])) : {},
    },
    redirectUri: `${opts.env.APP_URL.replace(/\/$/, "")}/api/mailbox/oauth/callback`,
    clock,
    idGen: ulidIdGen,
  };
}
