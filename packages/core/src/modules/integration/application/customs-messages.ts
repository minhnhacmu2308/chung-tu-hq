// Thông điệp Hải quan trả sau (FPT VNACCSREP – loại P trong REP_VNACCS: phân luồng, thông quan, kiểm tra thực tế, chỉ thị, kết quả tờ khai bổ sung).
// Lấy một lần (FPT không trả lại – docs/vnaccs-api "Câu hỏi đã chốt"): cả lô ghi ngay vào hộp thư customs_inbox, rồi mới áp từng thông điệp
// (nhật ký của đúng tờ khai + luồng/thông quan, cùng transaction với đánh dấu APPLIED). Chưa khớp tờ khai → giữ PENDING, lượt sau thử lại.
// Gọi đầu mỗi lượt hỏi trạng thái (customs-poll); tra IID/IEX vẫn chạy sau đó để chắc trạng thái.
import { AWAITING_CLEARANCE, type CustomsOperation } from "@kb/contracts";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { createLogger } from "../../../shared/log.js";
import { meterSafely } from "../../../shared/usage.js";
import { mergeCustomsInfo } from "../domain/customs-info.js";
import { coarseState, stageOf } from "../domain/state-machine.js";
import type { CustomsDeps, GatewayMessage, InboxRow, ResultRow } from "./customs-ports.js";
import { syncDossierClearance } from "./_clearance.js";

/** Số lượt thử khớp tờ khai trước khi bỏ (UNMATCHED – vẫn giữ trong hộp thư để tra). */
export const INBOX_MAX_ATTEMPTS = 50;
const BATCH = 100;
const log = createLogger({ name: "core" });

/** Khóa chống ghi trùng khi FPT gửi lại cùng thông điệp (không có thời điểm → thêm trạng thái để hai thông điệp khác nhau không gộp). */
export const inboxKey = (m: GatewayMessage) => [m.kind, m.code, m.declarationNo, m.at ?? "", m.at ? "" : `${m.status?.status ?? ""}/${m.status?.channel ?? ""}`].join("|");

/** Lấy (lỗi lấy không chặn lượt hỏi trạng thái) → lưu cả lô → áp thông điệp đang chờ. Trả số thông điệp đã áp. */
export async function pullCustomsMessages(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }): Promise<number> {
  if (!deps.gateway.pullMessages) return 0;
  let messages: GatewayMessage[] = [];
  try {
    messages = await deps.gateway.pullMessages(ctx.orgId);
    await meterSafely(deps.usage, { orgId: ctx.orgId, dossierId: null, provider: "CUSTOMS_HUB", kind: "CUSTOMS_QUERY", operation: "VNACCSREP", quantity: 1, meta: { messages: messages.length } });
  } catch (e) {
    // Lỗi tài khoản/mạng không chặn lượt hỏi trạng thái; ghi log để thấy lỗi tài khoản FPT.
    log.warn("VNACCSREP lỗi – bỏ qua lượt lấy thông điệp", { orgId: ctx.orgId, err: e });
    messages = [];
  }
  // Lô chỉ mất nếu ghi hộp thư lỗi ngay sau khi lấy (FPT không trả lại) – cửa sổ nhỏ, chấp nhận (QUY-TRINH §9.2).
  if (messages.length) {
    const now = deps.clock.now();
    await deps.uow.asOrg(ctx, (r) => r.inbox.insertMany(messages.map((m) => ({ id: deps.idGen.next("cin"), orgId: ctx.orgId, dedupKey: inboxKey(m), message: m, status: "PENDING" as const, attempts: 0, receivedAt: now, appliedAt: null }))));
  }
  return applyInbox(deps, ctx);
}

/** Áp thông điệp PENDING của doanh nghiệp (cũ trước). Mỗi thông điệp một transaction: nhật ký + kết quả + APPLIED. */
export async function applyInbox(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }): Promise<number> {
  const pending = await deps.uow.asOrg(ctx, (r) => r.inbox.listPending(ctx.orgId, BATCH));
  const touched = new Map<string, { cleared: Set<number>; declarationNo?: string }>();
  let applied = 0;
  for (const row of pending) {
    const target = await targetOf(deps, ctx, row.message);
    if (!target) {
      const attempts = row.attempts + 1;
      await deps.uow.asOrg(ctx, (r) => r.inbox.update(ctx.orgId, row.id, { attempts, ...(attempts >= INBOX_MAX_ATTEMPTS ? { status: "UNMATCHED" as const } : {}) }));
      continue;
    }
    const cleared = await apply(deps, ctx, row, target);
    if (cleared === null) continue; // job khác (cùng doanh nghiệp) đã áp thông điệp này
    const t = touched.get(target.dossierId) ?? { cleared: new Set<number>() };
    if (cleared) {
      t.cleared.add(target.branch);
      t.declarationNo = row.message.declarationNo;
    }
    touched.set(target.dossierId, t);
    applied++;
  }
  for (const [dossierId, t] of touched) {
    const summary = await syncDossierClearance(deps, ctx, dossierId);
    if (t.cleared.size) {
      // Tờ vừa chuyển sang thông quan nhờ thông điệp – lượt hỏi trạng thái sau sẽ thấy CLEARED và dừng, nên báo ở đây (mỗi tờ một lần).
      const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
      for (const branch of t.cleared) {
        const sheet = summary.of > 1 ? ` – Tờ ${branch}/${summary.of}` : "";
        await deps.notify?.notify(ctx.orgId, { dossierOwnerOf: dossierId, roles: ["APPROVER"] }, { title: `${dossier?.code ?? "Hồ sơ"}${sheet} đã thông quan`, body: `Số tờ khai ${t.declarationNo ?? ""} – Hải quan báo thông quan.`, href: `/dossiers/${dossierId}?step=submit` });
      }
    }
    await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  }
  return applied;
}

/** Tờ khai nhánh của thông điệp: AMA theo số tờ khai bổ sung (TK_SYN), còn lại theo số tờ khai. */
async function targetOf(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, m: GatewayMessage): Promise<ResultRow | null> {
  return deps.uow.asOrg(ctx, async (r) => {
    if (m.kind !== "AMA") return r.results.findByNumber(ctx.orgId, m.declarationNo);
    const a = await r.amendments.findBySyn(ctx.orgId, m.declarationNo);
    return a ? r.results.get(ctx.orgId, a.dossierId, a.branch) : null;
  });
}

/**
 * Giữ thông điệp (PENDING → APPLIED có điều kiện, khóa dòng) + ghi nhật ký + cập nhật kết quả trong một transaction.
 * Hai job customs-poll cùng doanh nghiệp chạy song song: job sau chờ khóa, thấy đã APPLIED → null (không ghi/báo trùng).
 * Trả true khi tờ vừa chuyển sang thông quan.
 */
async function apply(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, row: InboxRow, target: ResultRow): Promise<boolean | null> {
  const m = row.message;
  const op: CustomsOperation = m.kind === "AMA" ? "AMC" : m.kind === "EDA" ? "IEX" : "IID";
  const now = deps.clock.now();
  return deps.uow.asOrg(ctx, async (r) => {
    if (!(await r.inbox.claim(ctx.orgId, row.id, now))) return null;
    const latest = (await r.results.get(ctx.orgId, target.dossierId, target.branch)) ?? target;
    await r.messages.insert({
      id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId: latest.dossierId, branch: latest.branch, operation: op, direction: "IN", result: "OK",
      summary: `Hải quan gửi ${m.code}${m.name ? ` – ${m.name}` : ""}`,
      payloadMasked: { maThongDiep: m.code, soToKhai: m.declarationNo, ...(m.at ? { thoiGian: m.at } : {}), ...(m.status ? { trangThai: m.status.status, phanLuong: m.status.channel } : {}) },
      externalRef: latest.externalId, at: now,
    });
    const st = m.status;
    if (!st) return false;
    const stage = stageOf(latest);
    // Chỉ tờ khai đang chờ thông quan mới đổi giai đoạn (thông điệp cũ đến muộn không kéo lùi trạng thái).
    const waiting = AWAITING_CLEARANCE.has(stage);
    const nextStage = waiting && st.rejected ? "REJECTED" : waiting && st.cleared ? "CLEARED" : stage;
    await r.results.upsert({
      ...latest, state: coarseState(nextStage, latest.state === "SEND_FAILED" && nextStage === stage),
      ...(waiting ? { clearanceStatus: st.rejected ? "REJECTED" as const : st.cleared ? "CLEARED" as const : "INSPECTING" as const } : {}),
      ...(st.channel ? { channel: st.channel } : {}),
      raw: { ...(latest.raw ?? {}), stage: nextStage, lastStatus: st.status, ...(st.info ? { customsInfo: mergeCustomsInfo(latest.raw?.customsInfo, { ...st.info, receivedAt: now.toISOString() }) } : {}) },
      updatedAt: now,
    });
    return nextStage === "CLEARED" && stage !== "CLEARED";
  });
}
