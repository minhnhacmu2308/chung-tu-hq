// Gửi nội dung tờ khai theo từng tờ khai nhánh (spec tách tờ khai §6.1–6.4): khóa outbox, ghim phiên bản + lần duyệt, guard từng tờ,
// và enqueueBranchPreDeclare (chuỗi nối tiếp của worker, người khai bấm, truyền lại sau mở lại). Dùng chung submit / perform / worker.
import { branchCount, declarationRequiredGaps, lockedSheetCount, opFor, orderedOperation, recallExempt, requiredGapsText, sameRateWeek, sheetCountChanged, sheetOrderWait, vnDateOf, weekStart, type CustomsOperation, type CustomsStage } from "@kb/contracts";
import { domainError, reasonError, type DomainError } from "../../../shared/errors.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { branchPayload } from "../domain/branches.js";
import { buildFptRequest, type DeclarationPayload } from "../domain/declaration-to-fpt.js";
import { coarseState, stageOf } from "../domain/state-machine.js";
import type { CustomsDeps, DeclarationSnapshot, OutboxRow, ResultRow } from "./customs-ports.js";

/** Khóa idempotency outbox. Nhánh 1 giữ đúng dạng cũ (dữ liệu đang chạy không bị gửi trùng); nhánh ≥ 2 thêm `:b<no>`. */
export const outboxKey = (dossierId: string, op: string, version: number, retry = 0, branch = 1) => `${dossierId}:${op}:v${version}${retry ? `:retry${retry}` : ""}${branch > 1 ? `:b${branch}` : ""}`;

/** Phiên bản tờ khai trong khóa outbox (`:v<n>`); khóa theo số lần gửi (`:n<k>`) không có → null. */
export const outboxVersion = (key: string): number | null => {
  const m = /:v(\d+)(?::|$)/.exec(key);
  return m ? Number(m[1]) : null;
};

/**
 * Ghim nội dung đã truyền: phiên bản + lần phê duyệt. Mở lại → duyệt lại giữ phiên bản nhưng đổi lần duyệt, nên outbox của lần truyền trước
 * (payload.pin) không còn khớp – không gửi nội dung cũ. Lô một tờ không ghim (giữ hành vi cũ).
 */
export const pinOf = (snap: Pick<DeclarationSnapshot, "version" | "approvedAt">) => `v${snap.version}@${snap.approvedAt ?? ""}`;
export const pinOfOutbox = (o: Pick<OutboxRow, "payload">): string | undefined => (o.payload as { pin?: unknown } | null)?.pin as string | undefined;

/**
 * Outbox nội dung đã ghim (khóa `:v<n>` ở tờ ≥ 2, hoặc payload.pin) mà tờ khai không còn SUBMITTED đúng phiên bản/lần duyệt đó → lý do không gửi.
 * Không ghim (khóa theo lượt `:n<k>` không phiên bản, hoặc tờ 1 của lô một tờ) → null: áp guard thường.
 */
export function stalePinReason(snap: DeclarationSnapshot | null, ob: Pick<OutboxRow, "branch" | "idempotencyKey" | "payload">): string | null {
  const pin = pinOfOutbox(ob);
  const version = ob.branch > 1 || pin !== undefined ? outboxVersion(ob.idempotencyKey) : null;
  if (version === null && pin === undefined) return null;
  if (snap && snap.status === "SUBMITTED" && (version === null || snap.version === version) && (pin === undefined || pinOf(snap) === pin)) return null;
  const now = snap ? `v${snap.version}${pin !== undefined && pinOf(snap) !== pin && snap.version === version ? " – đã duyệt lại" : ""}` : "không còn tờ khai";
  return `tờ khai đã mở lại hoặc đổi phiên bản sau khi xếp gửi (v${version ?? "?"}, hiện ${now})`;
}

/** Nghiệp vụ gửi nội dung tờ khai cho tờ ở giai đoạn này (truyền lại sau mở lại, spec §6.4); null = tờ không cần gửi nội dung. */
export function contentOpFor(stage: CustomsStage, kind: "IDA" | "EDA"): CustomsOperation | null {
  const direction = kind === "IDA" ? "NK" : "XK";
  if (stage === "NOT_SENT" || stage === "RECALLED") return opFor(direction, "IDA");
  if (stage === "AMEND_RECALLED") return opFor(direction, "IDA01");
  return null;
}

/** Bất biến 7 cho khai chính thức lô nhiều tờ: HS chưa xác nhận hoặc còn BLOCKER FAIL → không khai. */
export async function declareBlockError(deps: CustomsDeps, ctx: { orgId: OrgId }, dossierId: string, snap: { unconfirmedHs: number }): Promise<DomainError | null> {
  if (snap.unconfirmedHs > 0) return reasonError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n: snap.unconfirmedHs });
  const blockers = await deps.validation.blockerFails(ctx.orgId, dossierId);
  return blockers > 0 ? reasonError("BLOCKER_FAILED", "BLOCKER_RULES_FAILED", { n: blockers }) : null;
}

/** Nghiệp vụ khai chính thức cho tờ ở giai đoạn này (khai chính thức cả lô): PRE_DECLARED → IDC/EDC, AMEND_PRE_DECLARED → IDE/EDE; khác null. */
export function declareOpFor(stage: CustomsStage, kind: "IDA" | "EDA"): CustomsOperation | null {
  const direction = kind === "IDA" ? "NK" : "XK";
  if (stage === "PRE_DECLARED") return opFor(direction, "IDC");
  if (stage === "AMEND_PRE_DECLARED") return opFor(direction, "IDE");
  return null;
}

/**
 * Truyền lại nội dung / mở lại lô nhiều tờ (spec §6.4, quyết định R3): chỉ tiêu chung dùng chung mọi tờ, nên mọi tờ đã có số tờ khai còn nhận nội dung
 * phải đang được gọi về sửa (RECALLED / AMEND_RECALLED) – nếu không, Hải quan giữ giá trị cũ trên tờ đó. Tờ chưa có số không tính. Worker không tự gọi về (IDB/IDD).
 * Miễn (R7): tờ đã thông quan / sửa sau thông quan / bị từ chối – không nhận nội dung nữa (gọi về không được); lệch chỉ tiêu chung sau thông quan sửa qua AMA (Q8).
 */
export function recallFirstError(results: Pick<ResultRow, "branch" | "declarationNo" | "state" | "raw">[]): DomainError | null {
  if (results.length <= 1) return null;
  const notRecalled = results.filter((r) => r.declarationNo && !recallExempt(stageOf(r)) && stageOf(r) !== "RECALLED" && stageOf(r) !== "AMEND_RECALLED").map((r) => r.branch);
  return notRecalled.length ? reasonError("INVALID_STATE", "SHEETS_RECALL_FIRST", { sheets: notRecalled.join(", ") }) : null;
}

/**
 * Số tờ hiện tại (theo dòng hàng) khác số tờ đã khai sau khi có tờ được cấp số (lockedSheetCount – Hải quan đã nhận TK_DNO đó) → không gửi nội dung
 * tờ nào (vd lô 50 dòng đã có số tăng lên 51: không gửi tờ 1 với TK_DNO = 2 mà không có tờ 2). Cùng điều kiện luật R-BRANCH-COUNT-LOCKED, kiểm ở mã nguồn
 * để không phụ thuộc luật đã chạy lại hay chưa.
 */
export function sheetCountError(results: Pick<ResultRow, "branch" | "declarationNo">[], now: number): DomainError | null {
  const planned = lockedSheetCount(results);
  return sheetCountChanged(planned, now) ? reasonError("BLOCKER_FAILED", "SHEET_COUNT_CHANGED", { planned, now }) : null;
}

/**
 * Thứ tự truyền (spec §6.2/§6.4 – luôn gửi Hải quan theo thứ tự tờ): tờ `branch` ≥ 2 chỉ nhận nội dung (IDA/IDA01/EDA/EDA01) khi mọi tờ trước còn nhận
 * nội dung đã được gửi ở lần truyền này (không còn NOT_SENT / RECALLED / AMEND_RECALLED; miễn tờ đã thông quan / bị từ chối – R7). Không thì Hải quan nhận
 * tờ k với TK_FIC và chỉ tiêu chung cũ của tờ trước. Dùng chung performOperation (mọi giai đoạn) và enqueueBranchPreDeclare (chuỗi + người khai).
 * Khai chính thức (IDC/IDE/EDC/EDE, orderedOperation = DECLARE) chờ cùng điều kiện (mọi tờ trước đã khai tạm xong; KHÔNG bắt tờ trước đã khai chính thức – D2)
 * nhưng báo SHEET_ORDER_DECLARE. Nghiệp vụ không theo thứ tự tờ → null.
 */
export function sheetOrderError(results: Pick<ResultRow, "branch" | "state" | "raw">[], branch: number, op: CustomsOperation): DomainError | null {
  const kind = orderedOperation(op);
  if (!kind) return null;
  const waitFor = sheetOrderWait(results.map((r) => ({ no: r.branch, stage: stageOf(r) })), branch);
  return waitFor === null ? null : reasonError("INVALID_STATE", kind === "CONTENT" ? "SHEET_ORDER" : "SHEET_ORDER_DECLARE", { sheet: branch, waitFor });
}

/**
 * Khóa outbox nội dung của lô nhiều tờ: lần đầu (nth = 1) đúng dạng outboxKey; các lần sau trong cùng phiên bản (truyền lại sau mở lại)
 * thêm `:n<nth>` (nth = số outbox cùng nghiệp vụ của tờ + 1) – hai bên cùng đếm (người khai / worker) ra cùng một khóa, unique chặn trùng.
 */
export const contentKey = (dossierId: string, op: string, version: number, nth: number, branch = 1) =>
  nth <= 1 ? outboxKey(dossierId, op, version, 0, branch) : `${dossierId}:${op}:v${version}:n${nth}${branch > 1 ? `:b${branch}` : ""}`;

/**
 * Ai xếp khai tạm nhánh: worker nối tiếp – tờ khai phải còn SUBMITTED đúng phiên bản đã truyền ở các tờ trước (không trộn nội dung hai phiên bản);
 * người dùng (gửi lại sau mở lại, duyệt lại) – tờ khai APPROVED.
 */
export type PreDeclareMode = { by: "chain"; version: number; /** Ghim của outbox kích hoạt (vắng = chỉ so phiên bản). */ pin?: string } | { by: "user" };

/** Số tờ khai giả CHỈ để kiểm tờ 2..N lúc truyền lần đầu (số tờ 1 chưa có) – thông điệp dựng với số này bị bỏ, không bao giờ gửi. */
export const CHECK_ONLY_FIRST_NO = "000000000000";

export type Sheet = { no: number; of: number; payload: DeclarationPayload; /** Vị trí dòng đầu của tờ trong dòng hàng cả lô (đã sắp theo lineNo). */ offset: number; blockers: string[] };
export const sheetOf = (p: DeclarationPayload, no: number, firstNo: string | null): Sheet => {
  const b = branchPayload(p, no, firstNo);
  return { no, of: b.range.of, payload: b.payload, offset: b.range.index[0], blockers: b.blockers };
};
/** Lô nhiều tờ: thông báo lỗi nêu số tờ; lô một tờ giữ nguyên câu cũ. */
const tag = (s: Sheet, text: string) => (s.of > 1 ? `Tờ ${s.no}/${s.of}: ${text}` : text);
const sheetParam = (s: Sheet) => (s.of > 1 ? { sheet: `${s.no}/${s.of}` } : {});

/** Ô bắt buộc trống trên dòng hàng của tờ (cùng quy tắc nút Ký số ở giao diện). Chỉ số dòng trong chi tiết theo cả lô. */
export function gapsError(s: Sheet): DomainError | null {
  const items = [...s.payload.items].sort((a, b) => a.lineNo - b.lineNo);
  const gaps = declarationRequiredGaps(s.payload.kind, Object.entries(s.payload.fields).map(([code, f]) => ({ code, value: f.value })), items);
  if (!gaps.length) return null;
  const requiredGaps = gaps.map((g) => (g.line === undefined ? g : { ...g, line: g.line + s.offset }));
  return reasonError("VALIDATION", "REQUIRED_FIELDS_MISSING_SUBMIT", { n: gaps.length, fields: tag(s, requiredGapsText(gaps, items.map((i) => i.lineNo))), ...sheetParam(s) }, { requiredGaps });
}

/** Dựng thông điệp FPT của tờ; blocker (kể cả của tách tờ) hoặc sai đặc tả FPT → lỗi nêu số tờ. */
export function buildSheet(s: Sheet): Result<ReturnType<typeof buildFptRequest>> {
  const built = buildFptRequest(s.payload);
  const blockers = [...s.blockers, ...built.blockers];
  if (blockers.length) return err(reasonError("BLOCKER_FAILED", "DECLARATION_NOT_TRANSMITTABLE", { blockers: tag(s, blockers.join("; ")), ...sheetParam(s) }));
  // Sai đặc tả FPT (thiếu ô Required, sai kiểu/độ dài) → Hải quan/FPT từ chối: chặn trước khi đánh dấu đã khai thay vì để cổng gửi báo lỗi sau.
  if (built.issues.length) return err(reasonError("VALIDATION", "DECLARATION_SPEC_INVALID", { issues: tag(s, built.issues.join("; ")), ...sheetParam(s) }, { issues: built.issues }));
  return ok(built);
}


/**
 * Gửi nội dung tờ khai cho tờ `branch` theo giai đoạn của tờ (contentOpFor: IDA/EDA lần đầu hoặc sau gọi về, IDA01/EDA01 sau gọi sửa đổi)
 * – dùng cho chuỗi nối tiếp (worker), người khai bấm khai tạm tờ bị dừng, và truyền lại sau mở lại (spec §6.2–6.4).
 * Giữ bất biến 7 (tờ khai đã duyệt, HS đủ, không BLOCKER, đúng tuần tỷ giá) + guard của tờ; tờ 2..N dùng số tờ khai của tờ 1 (TK_FIC).
 * Idempotent: tờ đã có outbox cùng nghiệp vụ đang chờ hoặc cùng ghim (job chạy lại) → không tạo thêm (chỉ đẩy lại job chưa từng xử lý);
 * hai bên cùng lúc (worker + người khai, hai job) → cùng khóa contentKey, unique chặn bản thứ hai.
 * `user`: lần gửi này là lần truyền của người khai → tờ khai SUBMITTED trước khi đẩy job (worker kiểm ghim trước khi gửi).
 */
export async function enqueueBranchPreDeclare(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, dossierId: string, branch: number, mode: PreDeclareMode): Promise<Result<void>> {
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
  if (mode.by === "chain" && (snap.status !== "SUBMITTED" || snap.version !== mode.version || (mode.pin !== undefined && pinOf(snap) !== mode.pin)))
    return err(domainError("INVALID_STATE", `Tờ khai đã mở lại, duyệt lại hoặc đổi phiên bản sau khi truyền (đã truyền v${mode.version}, hiện v${snap.version}) – không khai tạm tự động; duyệt lại rồi truyền lại`));
  if (mode.by === "user" && snap.status !== "APPROVED") return err(reasonError("NOT_APPROVED", "DECLARATION_NOT_REAPPROVED"));
  if (snap.unconfirmedHs > 0) return err(reasonError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n: snap.unconfirmedHs }));
  if (!sameRateWeek(snap.exchangeRateDate, vnDateOf(deps.clock.now())))
    return err(reasonError("RATE_WEEK_CHANGED", "RATE_WEEK_CHANGED_REBUILD", { week: weekStart(snap.exchangeRateDate) }));
  const blockers = await deps.validation.blockerFails(ctx.orgId, dossierId);
  if (blockers > 0) return err(reasonError("BLOCKER_FAILED", "BLOCKER_RULES_FAILED", { n: blockers }));
  const { results, outbox } = await deps.uow.asOrg(ctx, async (r) => ({ results: await r.results.listForDossier(ctx.orgId, dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, dossierId) }));
  const count = sheetCountError(results, branchCount(snap.payload.items.length));
  if (count) return err(count);
  const first = results.find((r) => r.branch === 1) ?? null;
  const target = results.find((r) => r.branch === branch) ?? null;
  if (!target) return err(reasonError("INVALID_STATE", "NOT_SUBMITTED_YET"));
  const op = contentOpFor(stageOf(target), snap.payload.kind);
  if (!op) return err(domainError("INVALID_STATE", `Tờ ${branch}: không ở giai đoạn gửi nội dung tờ khai`));
  const order = sheetOrderError(results, branch, op);
  if (order) return err(order);
  const s = sheetOf(snap.payload, branch, branch === 1 ? null : first?.declarationNo ?? null);
  const gaps = gapsError(s);
  if (gaps) return err(gaps);
  const built = buildSheet(s);
  if (!built.ok) return built;

  const pin = pinOf(snap);
  const same = outbox.filter((o) => o.branch === branch && o.operation === op);
  // Đã xếp ở lần truyền này (đang chờ, hoặc cùng ghim – đã gửi/bị từ chối → người khai Gửi lại): không tạo thêm.
  // (Dòng PENDING chưa từng xử lý do job quét outbox kẹt đẩy lại – requeueStuckOutbox.)
  if (same.some((o) => o.status === "PENDING" || pinOfOutbox(o) === pin)) return ok(undefined);
  const now = deps.clock.now();
  const key = contentKey(dossierId, op, snap.version, same.length + 1, branch);
  const row: OutboxRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch, declarationId: snap.declarationId, operation: op, idempotencyKey: key, payload: { request: built.value.request, warnings: built.value.warnings, issues: built.value.issues, certificateId: target.raw?.certificateId, pin }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now };
  const toSend = await deps.uow.asOrg(ctx, async (r): Promise<OutboxRow | null> => {
    const existing = await r.outbox.findByKey(ctx.orgId, key);
    if (existing) return existing.status === "PENDING" && existing.attempts === 0 ? existing : null;
    try {
      await r.outbox.insert(row);
    } catch (e) {
      // Bên kia (job khác / người khai) vừa tạo cùng khóa → đã được xếp gửi, không tạo trùng.
      if (/duplicate key|unique/i.test(e instanceof Error ? e.message : String(e))) return null;
      throw e;
    }
    // Gửi mới sau một lần lỗi: bỏ cờ lỗi gửi, giữ giai đoạn.
    if (target.state === "SEND_FAILED") await r.results.upsert({ ...target, state: coarseState(stageOf(target)), updatedAt: now });
    return row;
  });
  if (!toSend) return ok(undefined);
  if (mode.by === "user" && toSend === row) {
    await deps.declarations.markSubmitted(ctx, dossierId);
    await deps.dossiers.update(ctx.orgId, dossierId, { status: "SUBMITTED", step: "submit" });
  }
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: toSend.id }, { jobId: `customs-send:${toSend.id}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok(undefined);
}
