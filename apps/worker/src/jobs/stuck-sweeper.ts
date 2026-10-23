import { failStaleAgentRuns, type DeclarationDeps } from "@kb/core/modules/declaration";
import { requeueStuckDocuments, type DossierDeps } from "@kb/core/modules/dossier";
import { listActiveOrganizationIds, type IdentityDeps } from "@kb/core/modules/identity";
import { requeueStuckOutbox, type CustomsDeps } from "@kb/core/modules/integration";
import { failStaleMailSyncs, type MailboxDeps } from "@kb/core/modules/mailbox";
import { createLogger } from "@kb/core/shared";

const log = createLogger({ name: "worker" });

export type SweeperDeps = { identity: IdentityDeps; dossier: DossierDeps; declaration: DeclarationDeps; customs: CustomsDeps; mailbox: MailboxDeps };
export type SweepResult = { orgs: number; documents: number; agentRuns: number; outbox: number; mailboxes: number };

/**
 * Job quét định kỳ (5 phút): ghi DB và đẩy job không cùng transaction nên job có thể mất → bản ghi kẹt "đang xử lý".
 * Mỗi doanh nghiệp: chứng từ QUEUED quá lâu → đẩy lại; outbox chưa gửi → đẩy lại; agent treo → ERROR; hộp thư treo SYNCING → ERROR.
 * Lỗi ở một doanh nghiệp không chặn doanh nghiệp khác.
 */
export async function stuckSweeperJob(deps: SweeperDeps): Promise<SweepResult> {
  const total: SweepResult = { orgs: 0, documents: 0, agentRuns: 0, outbox: 0, mailboxes: 0 };
  for (const orgId of await listActiveOrganizationIds(deps.identity)) {
    total.orgs++;
    try {
      const [docs, runs, outbox, mail] = await Promise.all([
        requeueStuckDocuments(deps.dossier, { orgId }),
        failStaleAgentRuns(deps.declaration, { orgId }),
        requeueStuckOutbox(deps.customs, { orgId }),
        failStaleMailSyncs(deps.mailbox, { orgId }),
      ]);
      total.documents += docs.requeued.length;
      total.agentRuns += runs.failed.length;
      total.outbox += outbox.requeued.length;
      total.mailboxes += mail.failed.length;
      if (docs.requeued.length || runs.failed.length || outbox.requeued.length || mail.failed.length) {
        log.warn("đã gỡ bản ghi kẹt", { queue: "stuck-sweeper", orgId, documents: docs.requeued, agentRuns: runs.failed, outbox: outbox.requeued, mailboxes: mail.failed });
      }
    } catch (e) {
      log.error("quét bản ghi kẹt lỗi ở một doanh nghiệp – bỏ qua, tiếp tục", { queue: "stuck-sweeper", orgId, err: e });
    }
  }
  return total;
}
