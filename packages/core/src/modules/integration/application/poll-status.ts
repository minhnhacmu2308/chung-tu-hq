// Worker `customs-poll`: sau khai chính thức (IDC/IDE), mỗi lượt CHỈ lấy thông điệp Hải quan (VNACCSREP) – thông điệp phân luồng / thông quan /
// từ chối được áp vào kết quả tờ khai trong pullCustomsMessages (hộp thư customs_inbox) – rồi xếp lượt kế theo delay tới khi thông quan/từ chối.
// KHÔNG tự hỏi IID/IEX (tránh nghẽn cổng Hải quan); muốn chắc trạng thái thì người khai bấm "Tra cứu trạng thái" (queryNow: VNACCSREP + IID/IEX).
// Lô nhiều tờ: mỗi tờ khai nhánh một job (payload `branch`, vắng = 1); hồ sơ CLEARED khi mọi tờ thông quan (syncDossierClearance trong applyInbox).
import { AWAITING_CLEARANCE } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { stageOf } from "../domain/state-machine.js";
import { reconcileCatalogDeclarationNo } from "./_catalog-numbers.js";
import { syncDossierClearance } from "./_clearance.js";
import { pullCustomsMessages } from "./customs-messages.js";
import type { CustomsDeps } from "./customs-ports.js";

export { syncDossierClearance };

/** `branch`: tờ khai nhánh (vắng = 1 – job tạo trước khi tách tờ khai). */
export type PollStatusInput = { orgId: string; userId: string; dossierId: string; attempt: number; branch?: number | undefined };
export const MAX_POLLS = 200;
/**
 * Khoảng cách giữa hai lượt lấy thông điệp tự động (cổng FPT thật / mock HTTP): 30 phút – chỉ là lưới an toàn. Cách chính là người khai bấm
 * "Tra cứu trạng thái" (lấy VNACCSREP + IID/IEX ngay); không hỏi dồn để tránh nghẽn cổng Hải quan.
 * 200 lượt × 30 phút ≈ 100 giờ (~4 ngày).
 */
export const CUSTOMS_POLL_DELAY_MS = 30 * 60_000;

export async function pollStatus(deps: CustomsDeps, input: PollStatusInput): Promise<Result<{ done: boolean; cleared: boolean }>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const branch = input.branch ?? 1;
  // VNACCSREP: lấy + áp thông điệp (nhật ký IN, luồng, thông quan/từ chối, báo thông quan, phát sự kiện) – lỗi lấy chỉ log, không chặn lượt.
  await pullCustomsMessages(deps, ctx);
  const result = await deps.uow.asOrg(ctx, (r) => r.results.get(input.orgId, input.dossierId, branch));
  if (!result) return err(domainError("NOT_FOUND", "Hồ sơ chưa truyền"));
  // C6: ghi bù số tờ khai vào danh mục nếu chưa ghi (crash sau commit, danh mục lỗi lượt trước) – lỗi chỉ log.
  await reconcileCatalogDeclarationNo(deps, ctx, result, result.updatedAt);
  const stage = stageOf(result);
  // Hải quan đã báo Hủy (TK_TRANGTHAI "R") → ngừng hỏi, chờ người duyệt xác nhận hủy (applyCustomsResponse đã báo).
  if (!result.externalId || !AWAITING_CLEARANCE.has(stage) || result.raw?.cancelReportedAt) return ok({ done: true, cleared: stage === "CLEARED" });
  const done = input.attempt >= MAX_POLLS;
  if (!done) {
    const now = deps.clock.now();
    await deps.queue.enqueue("customs-poll", { ...input, attempt: input.attempt + 1 }, { jobId: `customs-poll:${input.dossierId}:${now.getTime()}:${input.attempt + 1}${branch > 1 ? `:b${branch}` : ""}`, delayMs: deps.pollDelayMs });
  }
  return ok({ done, cleared: false });
}
