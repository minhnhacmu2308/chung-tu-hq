// Thông điệp Hải quan trả sau (FPT VNACCSREP – loại P trong REP_VNACCS: phân luồng, thông quan, kiểm tra thực tế, chỉ thị, kết quả tờ khai bổ sung).
// Thông báo (thuế, lệ phí, chỉ thị, kiểm tra thực tế, HYS) chỉ ghi nhật ký của đúng tờ/hồ sơ, không đổi trạng thái; lỗi kèm dữ liệu và phần tử thiếu số lưu thẳng UNMATCHED.
// Lấy một lần (FPT không trả lại – docs/vnaccs-api "Câu hỏi đã chốt"): cả lô ghi ngay vào hộp thư customs_inbox, rồi mới áp từng thông điệp
// (nhật ký của đúng tờ khai + luồng/thông quan, cùng transaction với đánh dấu APPLIED). Chưa khớp tờ khai → giữ PENDING, lượt sau thử lại.
// Gọi đầu mỗi lượt customs-poll (lượt tự động CHỈ lấy VNACCSREP, không tra IID/IEX) và đầu nút "Tra cứu trạng thái" (sau đó tra IID/IEX).
// Job customs-messages (3 giờ) gọi thêm cho mọi doanh nghiệp có tài khoản VNACCS – lấy cả khi không còn hồ sơ nào đang hỏi.
import type { CustomsOperation } from "@kb/contracts";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { createLogger } from "../../../shared/log.js";
import { meterSafely } from "../../../shared/usage.js";
import { applyCustomsResponse, finishDossier, NO_CHANGE, recordApplied, touchOf, type DossierTouch, type ResponseApplied } from "./_customs-response.js";
import type { CustomsDeps, GatewayMessage, InboxRow, ResultRow } from "./customs-ports.js";

/** Số lượt thử khớp tờ khai trước khi bỏ (UNMATCHED – vẫn giữ trong hộp thư để tra). */
export const INBOX_MAX_ATTEMPTS = 50;
const BATCH = 100;
const log = createLogger({ name: "core" });

/** Khóa chống ghi trùng khi FPT gửi lại cùng thông điệp (không có thời điểm → thêm trạng thái để hai thông điệp khác nhau không gộp). */
export const inboxKey = (m: GatewayMessage) => [m.kind, m.code, m.declarationNo, m.at ?? "", m.msgType ?? "", m.at ? "" : `${m.status?.status ?? ""}/${m.status?.channel ?? ""}`].join("|");

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
    const errors = messages.filter((m) => m.kind === "ERROR");
    if (errors.length) log.warn("VNACCSREP trả lỗi kèm thông điệp – đã giữ thông điệp, lỗi lưu hộp thư (UNMATCHED)", { orgId: ctx.orgId, errors: errors.flatMap((m) => m.errors ?? []) });
    await deps.uow.asOrg(ctx, (r) => r.inbox.insertMany(messages.map((m, i) => {
      // Không gắn được tờ khai (lỗi, thiếu số) → UNMATCHED ngay: vẫn lưu để tra, không thử khớp 50 lượt. Lỗi không có khóa tự nhiên → khóa theo lần lấy.
      const unmatchable = m.kind === "ERROR" || !m.declarationNo;
      const dedupKey = m.kind === "ERROR" ? `${inboxKey(m)}|${now.toISOString()}|${i}` : inboxKey(m);
      return { id: deps.idGen.next("cin"), orgId: ctx.orgId, dedupKey, message: m, status: unmatchable ? "UNMATCHED" as const : "PENDING" as const, attempts: 0, receivedAt: now, appliedAt: null };
    })));
  }
  return applyInbox(deps, ctx);
}

/** Áp thông điệp PENDING của doanh nghiệp (cũ trước). Mỗi thông điệp một transaction: nhật ký + kết quả + APPLIED. */
export async function applyInbox(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }): Promise<number> {
  const pending = await deps.uow.asOrg(ctx, (r) => r.inbox.listPending(ctx.orgId, BATCH));
  const touched = new Map<string, DossierTouch>();
  let applied = 0;
  for (const row of pending) {
    const target = await targetOf(deps, ctx, row.message);
    if (!target) {
      const attempts = row.attempts + 1;
      await deps.uow.asOrg(ctx, (r) => r.inbox.update(ctx.orgId, row.id, { attempts, ...(attempts >= INBOX_MAX_ATTEMPTS ? { status: "UNMATCHED" as const } : {}) }));
      continue;
    }
    const res = await apply(deps, ctx, row, target);
    if (res === null) continue; // job khác (cùng doanh nghiệp) đã áp thông điệp này
    recordApplied(touchOf(touched, target.dossierId), target.branch, res);
    applied++;
  }
  // Tờ vừa thông quan nhờ thông điệp – lượt hỏi trạng thái sau sẽ thấy CLEARED và dừng, nên báo ở đây (mỗi tờ một lần).
  for (const [dossierId, t] of touched) await finishDossier(deps, ctx, dossierId, t);
  return applied;
}

/** Nơi ghi thông điệp: hồ sơ + tờ khai nhánh; `result` vắng khi tờ chưa có kết quả truyền (HYS khai trước IDA/EDA). */
type Target = { dossierId: string; branch: number; result: ResultRow | null };

/**
 * Tờ khai nhánh của thông điệp: AMA theo số tờ khai bổ sung (TK_SYN); HYS theo số tiếp nhận (bộ HYS → hồ sơ, tờ 1);
 * ERROR không gắn được; còn lại (tờ khai, thuế, lệ phí, chỉ thị, kiểm tra thực tế) theo số tờ khai.
 */
async function targetOf(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, m: GatewayMessage): Promise<Target | null> {
  if (m.kind === "ERROR" || !m.declarationNo) return null;
  return deps.uow.asOrg(ctx, async (r) => {
    if (m.kind === "HYS") {
      const h = await r.hys.findByReceipt(ctx.orgId, m.declarationNo);
      return h ? { dossierId: h.dossierId, branch: 1, result: await r.results.get(ctx.orgId, h.dossierId, 1) } : null;
    }
    if (m.kind === "AMA") {
      const a = await r.amendments.findBySyn(ctx.orgId, m.declarationNo);
      const res = a ? await r.results.get(ctx.orgId, a.dossierId, a.branch) : null;
      return res ? { dossierId: res.dossierId, branch: res.branch, result: res } : null;
    }
    const res = await r.results.findByNumber(ctx.orgId, m.declarationNo);
    return res ? { dossierId: res.dossierId, branch: res.branch, result: res } : null;
  });
}

/** Nghiệp vụ ghi nhật ký: AMA → AMC, HYS → HYS, còn lại theo chiều (xuất IEX, nhập IID). */
const opOf = (m: GatewayMessage): CustomsOperation =>
  m.kind === "AMA" ? "AMC" : m.kind === "HYS" ? "HYS" : (m.direction ?? (m.kind === "EDA" ? "XK" : "NK")) === "XK" ? "IEX" : "IID";

/** Chỉ thị Hải quan (vaD8000/vaE8000): các dòng cthQ_Dnn/Tnn/Inn (ngày, tên, nội dung) có nội dung – để người khai đọc ngay trong nhật ký. */
function instructionsOf(m: GatewayMessage): { ngay: string; tieuDe: string; noiDung: string }[] | undefined {
  if (m.kind !== "INSTRUCTION" || !m.detail) return undefined;
  const text = (k: string) => (typeof m.detail?.[k] === "string" ? (m.detail[k] as string).trim() : "");
  const rows = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0"))
    .map((n) => ({ ngay: text(`cthQ_D${n}`), tieuDe: text(`cthQ_T${n}`), noiDung: text(`cthQ_I${n}`) }))
    .filter((x) => x.tieuDe || x.noiDung);
  return rows.length ? rows : undefined;
}

/**
 * Giữ thông điệp (PENDING → APPLIED có điều kiện, khóa dòng) + ghi nhật ký + cập nhật kết quả trong một transaction.
 * Hai job customs-poll cùng doanh nghiệp chạy song song: job sau chờ khóa, thấy đã APPLIED → null (không ghi/báo trùng).
 * Trả kết quả áp trạng thái (tờ vừa thông quan, luồng mới); null khi job khác đã áp.
 */
async function apply(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, row: InboxRow, target: Target): Promise<ResponseApplied | null> {
  const m = row.message;
  const op = opOf(m);
  const now = deps.clock.now();
  const instructions = instructionsOf(m);
  return deps.uow.asOrg(ctx, async (r) => {
    if (!(await r.inbox.claim(ctx.orgId, row.id, now))) return null;
    const latest = target.result ? ((await r.results.getForUpdate(ctx.orgId, target.dossierId, target.branch)) ?? target.result) : null;
    await r.messages.insert({
      id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId: target.dossierId, branch: target.branch, operation: op, direction: "IN", result: "OK",
      summary: `Hải quan gửi ${m.code}${m.name ? ` – ${m.name}` : ""}`,
      // EDI bản in (loại B) và nội dung thô của thông báo giữ trong customs_inbox (dòng row.id) – nhật ký chỉ ghi tóm tắt để nhẹ.
      payloadMasked: {
        maThongDiep: m.code, [m.kind === "HYS" ? "soTiepNhan" : "soToKhai"]: m.declarationNo, ...(m.at ? { thoiGian: m.at } : {}), ...(m.status ? { trangThai: m.status.status, phanLuong: m.status.channel } : {}),
        ...(m.msgType ? { loaiThongDiep: m.msgType } : {}), ...(instructions ? { chiThi: instructions } : {}),
        ...(m.ediBase64 ? { coEdi: true } : {}), ...(m.ediBase64 || m.detail ? { hopThuId: row.id } : {}),
      },
      externalRef: latest?.externalId ?? null, at: now,
    });
    if (!m.status || !latest) return NO_CHANGE;
    // Luồng / thông quan / từ chối: cùng hàm xử lý phản hồi với tra cứu IID/IEX và phản hồi trả ngay (applyCustomsResponse).
    return applyCustomsResponse(r, latest, { kind: "STATUS", status: m.status }, now);
  });
}
