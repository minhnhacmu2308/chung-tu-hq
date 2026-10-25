// Bước 6: luồng nghiệp vụ Hải quan (mock). Quy tắc bấm được / chuyển giai đoạn dùng chung với backend: @kb/contracts customs-flow.
// Mỗi nghiệp vụ gửi đi: thông điệp OUT ngay, thông điệp IN "đến" sau ~2,5 giây (màn hình chỉ thấy thông điệp có at <= bây giờ → poll).
// Khi phản hồi đã đến, settle() áp stageAfter + tác dụng phụ (số tờ khai, phân luồng, mở lại tờ khai, thông quan…).
import {
  baseOp, CUSTOMS_OPERATIONS, dossierCustomsSummary, hasDeclarationNumber, opFor, isChanneled, isContentOperation, isRecallOperation, nextCustomsOperation,
  awaitingContent, operationAvailability, operationsFor, orderedOperation, queryOpFor, isActiveSheet, recallOpFor, sentSheetsCheck, sentSheetsReason, sentSnapshotDiff, sentSnapshotOf, sheetApproved, sheetOrderWait, stageAfter,
  declarationEditScope, editBlockFor, sheetOfLine, type DeclarationEditScope, type DeclarationStatus, type EditSheet, type EditTarget, type SentSnapshot,
  type BranchSubmission, type CustomsRow, type CustomsStage, type OperationAvailabilityInput, type OperationResult, type RecallAllResult, type PipelineRow, type PipelineStatus,
  type CustomsError, type CustomsInfo, type ResendResult, type SubmissionView,
} from "@kb/contracts";
import { computeTaxes } from "@/mocks/declaration-builder";
import { formatVnd } from "@/lib/format";
import { fromMinor, sumMinor, toMinor } from "@/lib/decimal";
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import {
  basePayload, branchKey, branchesOf, CHANNEL_NOTES, CHANNEL_VI, channelFor, containersFor, declarationNoFor, emptyFlow, estimatedTaxVnd, parseBranchKey,
  type BranchMessage, type CustomsFlow,
} from "@/mocks/customs-sim";
import type { MockDb } from "@/mocks/db";
import { assertNoGaps } from "@/mocks/required-gaps";
import { reasonApiError } from "@/mocks/reason-error";
import { amendmentDelta, applyPostOperation, createAmendment, openAmendment } from "@/mocks/post-amendment-sim";
import type { CustomsMessage, CustomsOperation, CustomsSummary, CustomsResult, Declaration, DigitalCertificate, Dossier, LineItem } from "@/mocks/types";

export const customsKeys = {
  all: ["customs"] as const,
  submission: (id: string) => ["customs", "submission", id] as const,
  list: ["customs", "list"] as const,
  certificates: ["customs", "certificates"] as const,
};

/** Hải quan (mô phỏng) trả lời mỗi nghiệp vụ sau 2,5 giây. */
export const LIVE_REPLY_MS = 2_500;
/** Luồng xanh: thông quan sau khai chính thức vài giây. */
export const GREEN_CLEAR_MS = 5_000;
/** Luồng vàng/đỏ: thông quan vài giây sau khi đã gửi HYS (mô phỏng kiểm tra hồ sơ). */
export const INSPECTION_CLEAR_MS = 6_000;
/** Lệ phí cảng biển mô phỏng – KHÔNG phải biểu phí thật. */
const PORT_FEE_DEMO_VND = "250000";

const FALLBACK_CERTS = (db: MockDb): DigitalCertificate[] => [
  { id: "cert_vnpt", subject: db.org.name, issuer: "VNPT-CA", serial: "5404FFFEB7033FB316D672201B7B8F3F", validTo: "2027-12-31", isDefault: true },
  { id: "cert_viettel", subject: db.org.name, issuer: "Viettel-CA", serial: "540101093A7C21D1E8B3", validTo: "2026-11-30", isDefault: false },
];

export const listCertificates = () => query((db) => (db.certificates.length ? db.certificates : FALLBACK_CERTS(db)));

/* ---------------- Trạng thái ---------------- */

/** Một tờ khai nhánh của hồ sơ: `branch` (tờ thứ mấy) / `of` (tổng số tờ), `items` = dòng hàng của tờ (50 dòng/tờ). Lô ≤ 50 dòng: một tờ, hành vi như trước. */
type Ctx = { dossier: Dossier; decl: Declaration | undefined; branch: number; of: number; items: LineItem[]; flow: CustomsFlow; result: CustomsResult | undefined };

/** Kết quả Hải quan của tờ: tờ 1 ở customsResults, tờ k ≥ 2 ở customsBranchResults. */
function resultOf(db: MockDb, dossierId: string, no: number): CustomsResult | undefined {
  return no <= 1 ? db.customsResults.find((x) => x.dossierId === dossierId) : db.customsBranchResults?.[branchKey(dossierId, no)];
}

function flowOf(db: MockDb, dossierId: string, no = 1): CustomsFlow {
  db.customsFlows ??= {};
  const key = branchKey(dossierId, no);
  let f = db.customsFlows[key];
  if (!f) {
    const r = resultOf(db, dossierId, no);
    f = { ...emptyFlow(), ...(r ? { stage: r.clearanceStatus === "CLEARED" ? "CLEARED" : "DECLARED" } : {}) };
    db.customsFlows[key] = f;
  }
  return f;
}

/**
 * Các tờ khai nhánh để tính phạm vi sửa (EditSheet – như port customsSheets của backend). Mock không lưu số tờ khai riêng cho mọi tờ:
 * giai đoạn đã có số (hasDeclarationNumber) mà chưa có kết quả → dùng số tờ làm số giả để tờ được tính là còn hiệu lực.
 */
export const editSheetsOf = (db: MockDb, dossierId: string): EditSheet[] =>
  branchesOf(db.lineItems.filter((i) => i.dossierId === dossierId)).map((sh) => {
    const stage = flowOf(db, dossierId, sh.no).stage;
    return { no: sh.no, stage, declarationNo: hasDeclarationNumber(stage) ? (resultOf(db, dossierId, sh.no)?.declarationNo ?? String(sh.no)) : null };
  });

/** Phạm vi sửa tờ khai của hồ sơ (cùng declarationEditScope với backend + FE). */
export function editScopeOf(db: MockDb, dossierId: string, status?: DeclarationStatus): DeclarationEditScope {
  const decl = db.declarations.find((d) => d.dossierId === dossierId);
  return declarationEditScope(status ?? decl?.status ?? "DRAFT", editSheetsOf(db, dossierId));
}

/** Đích sửa; `LINE_NO` = ô dòng hàng của dòng có lineNo (tờ theo danh sách dòng hiện tại). */
export type MockEditTarget = Exclude<EditTarget, { kind: "LINE" }> | { kind: "LINE_NO"; lineNo: number };
export function toEditTargetMock(db: MockDb, dossierId: string, t: MockEditTarget): EditTarget {
  return t.kind === "LINE_NO" ? { kind: "LINE", sheet: sheetOfLine(db.lineItems.filter((i) => i.dossierId === dossierId).map((i) => i.lineNo), t.lineNo) } : t;
}

/**
 * Đổi bộ chứng từ (tải lên / đổi loại / đọc lại / xóa) – như backend dossier: hồ sơ đã truyền / thông quan / hủy → lỗi cũ của hồ sơ (canModify;
 * `checkLock` = false cho đọc lại – backend vốn không kiểm khóa ở đó); còn lại lô nhiều tờ còn tờ chưa gọi về → COMMON_LOCKED_SHEETS (tính như nháp,
 * nên hồ sơ đã duyệt còn tờ hiệu lực cũng bị chặn).
 */
export function documentSetMockError(db: MockDb, dossierId: string, checkLock = true): ApiError | null {
  const d = db.dossiers.find((x) => x.id === dossierId);
  if (!d) return null;
  if (d.status === "SUBMITTED" || d.status === "CLEARED") return checkLock ? new ApiError("DOSSIER_LOCKED", "Hồ sơ đã truyền, không sửa được") : null;
  if (d.status === "CANCELLED") return checkLock ? new ApiError("INVALID_STATE", "Hồ sơ đã hủy") : null;
  return editScopeMockError(db, dossierId, { kind: "ADD_REMOVE_LINES" }, "DRAFT");
}

/**
 * Lô nhiều tờ còn tờ chưa gọi về → lỗi COMMON_LOCKED_SHEETS / LINE_SHEET_LOCKED (cùng editBlockFor với backend); lô một tờ / khóa theo trạng thái tờ khai
 * (DECLARATION_LOCKED) → null để kiểm sẵn có của từng API báo như cũ.
 */
export function editScopeMockError(db: MockDb, dossierId: string, target: MockEditTarget, status?: DeclarationStatus): ApiError | null {
  if (branchCountOf(db, dossierId) <= 1) return null;
  const b = editBlockFor(editScopeOf(db, dossierId, status), toEditTargetMock(db, dossierId, target));
  return b && b.reasonCode !== "DECLARATION_LOCKED" ? reasonApiError("INVALID_STATE", b.reasonCode, b.params) : null;
}

function load(db: MockDb, dossierId: string, branch = 1): Ctx {
  const dossier = db.dossiers.find((d) => d.id === dossierId);
  if (!dossier) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
  const sheets = branchesOf(db.lineItems.filter((i) => i.dossierId === dossierId));
  const sheet = sheets[branch - 1];
  if (!sheet) throw new ApiError("NOT_FOUND", `Hồ sơ chỉ có ${sheets.length} tờ khai – không có tờ ${branch}`);
  return {
    dossier,
    decl: db.declarations.find((d) => d.dossierId === dossierId),
    branch,
    of: sheets.length,
    items: sheet.items,
    flow: flowOf(db, dossierId, branch),
    result: resultOf(db, dossierId, branch),
  };
}

/** Thuế dự kiến (nhập khẩu + GTGT) của tờ: lô một tờ = thuế cả tờ khai (như trước); lô nhiều tờ = tổng các dòng của tờ (cộng số nguyên VND). */
function branchTaxVnd(db: MockDb, c: Ctx, decl: Declaration): string {
  if (c.of === 1) return estimatedTaxVnd(decl);
  const ids = new Set(c.items.map((i) => i.id));
  const all = db.lineItems.filter((i) => i.dossierId === c.dossier.id).sort((a, b) => a.lineNo - b.lineNo);
  const sum = computeTaxes(c.dossier, all, decl.valueAdjustments).perItem.filter((p) => ids.has(p.itemId)).reduce((n, p) => n + BigInt(p.importDutyVnd) + BigInt(p.vatVnd), 0n);
  return String(sum);
}

/** Hồ sơ CLEARED chỉ khi mọi tờ khai nhánh đã thông quan. */
function syncDossierCleared(db: MockDb, dossier: Dossier, force = false) {
  const sheets = branchesOf(db.lineItems.filter((i) => i.dossierId === dossier.id));
  const s = dossierCustomsSummary(sheets.map((sh) => ({ stage: flowOf(db, dossier.id, sh.no).stage, state: "APPROVED" as const })));
  if (!s.allCleared) return;
  if (force) Object.assign(dossier, { status: "CLEARED", step: "submit", updatedAt: nowIso() });
  else if (dossier.status === "SUBMITTED" || dossier.status === "APPROVED") Object.assign(dossier, { status: "CLEARED", updatedAt: nowIso() });
}

/** Tờ đã có số tờ khai (khác NOT_SENT) của lô. */
const numberedSheets = (db: MockDb, dossierId: string) =>
  branchesOf(db.lineItems.filter((i) => i.dossierId === dossierId)).map((sh) => ({ no: sh.no, stage: flowOf(db, dossierId, sh.no).stage })).filter((x) => hasDeclarationNumber(x.stage));

/**
 * Ảnh chụp nội dung tờ `no` như gửi Hải quan (cùng sentSnapshotOf với backend sheetSnapshot): chỉ tiêu tờ khai + TK_DNO (số tờ) + TK_TP (tổng trị giá hóa đơn
 * cả lô, giữ nếu người khai nhập – đổi trị giá dòng làm đổi 1.51), dòng hàng của tờ, khoản điều chỉnh, container, tiền tệ.
 */
function sheetSnapshotOf(db: MockDb, dossierId: string, no: number): SentSnapshot | null {
  const decl = db.declarations.find((d) => d.dossierId === dossierId);
  const dossier = db.dossiers.find((d) => d.id === dossierId);
  if (!decl || !dossier) return null;
  const all = db.lineItems.filter((i) => i.dossierId === dossierId);
  const sheets = branchesOf(all);
  const fields = Object.fromEntries(decl.fields.map((f) => [f.code, f.value]));
  const total = fromMinor(sumMinor(all.map((i) => toMinor(i.amount, 4))), 4);
  const items = (sheets[no - 1]?.items ?? []).map((i) => ({ id: i.id, lineNo: i.lineNo, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, amount: i.amount, origin: i.origin, hsConfirmed: i.hsConfirmed ?? null, importDutyRate: i.importDutyRate ?? null, vatRate: i.vatRate ?? null, policyNote: i.policyNote ?? null }));
  return sentSnapshotOf({ fields: { ...fields, TK_DNO: String(sheets.length), TK_TP: fields["TK_TP"]?.trim() || total }, items, adjustments: decl.valueAdjustments, containers: containersOf(db, dossier), currency: fields["MA_TT"] ?? "" });
}

/** Tờ của lô kèm ảnh chụp đã gửi và nội dung hiện tại (lô nhiều tờ). */
const sentSheetsOf = (db: MockDb, dossierId: string) =>
  branchesOf(db.lineItems.filter((i) => i.dossierId === dossierId)).map((sh) => {
    const flow = flowOf(db, dossierId, sh.no);
    return { no: sh.no, stage: flow.stage, declarationNo: hasDeclarationNumber(flow.stage) ? resultOf(db, dossierId, sh.no)?.declarationNo ?? null : null, sent: flow.sent ?? null, current: sheetSnapshotOf(db, dossierId, sh.no)! };
  });

/**
 * Lô nhiều tờ (thay R3, như backend sentSheetsError): tờ chưa gọi về (còn hiệu lực ở Hải quan) phải giữ đúng nội dung đã gửi; lệch → SENT_SHEETS_CHANGED,
 * không có ảnh chụp → SENT_SHEETS_UNVERIFIED (chặn duyệt + truyền). Lô một tờ → null.
 */
export function sentSheetsMockError(db: MockDb, dossierId: string): ApiError | null {
  if (branchCountOf(db, dossierId) <= 1) return null;
  const decl = db.declarations.find((d) => d.dossierId === dossierId);
  if (!decl) return null;
  const r = sentSheetsReason(decl.kind, sentSheetsCheck(sentSheetsOf(db, dossierId)));
  return r ? reasonApiError("BLOCKER_FAILED", r.reason, r.params) : null;
}

/** Nghiệp vụ gửi nội dung tờ theo giai đoạn khi truyền lại (IDA/EDA lần đầu hoặc sau gọi về, IDA01/EDA01 sau gọi sửa đổi); null = tờ không cần gửi. */
function contentOpFor(stage: CustomsStage, direction: Dossier["direction"]): CustomsOperation | null {
  if (stage === "NOT_SENT" || stage === "RECALLED") return opFor(direction, "IDA");
  if (stage === "AMEND_RECALLED") return opFor(direction, "IDA01");
  return null;
}

/** Thông điệp đã đến của tờ, cũ trước. */
const seenOf = (db: MockDb, c: Ctx, now: number): BranchMessage[] =>
  db.customsMessages.filter((m) => m.dossierId === c.dossier.id && (m.branch ?? 1) === c.branch && Date.parse(m.at) <= now).sort((a, b) => a.at.localeCompare(b.at));

const containersOf = (db: MockDb, d: Dossier) => containersFor(d, db.documents, db.fields);

function availabilityInput(db: MockDb, c: Ctx): OperationAvailabilityInput {
  return {
    direction: c.dossier.direction,
    stage: c.flow.stage,
    // Sau thông quan: "đã duyệt" là bản khai bổ sung AMA, không phải tờ khai gốc (tờ khai gốc giữ nguyên, khóa).
    // Lô nhiều tờ đang truyền lần lượt (tờ khai SUBMITTED) vẫn là đã duyệt – cùng quy tắc backend (sheetApproved).
    approved: sheetApproved({ stage: c.flow.stage, of: c.of, declarationStatus: c.decl?.status, amendmentStatus: openAmendment(db, c.dossier.id, c.branch)?.status ?? null }),
    channel: isChanneled(c.flow.stage) ? (c.result?.channel ?? null) : null,
    hasContainers: containersOf(db, c.dossier).length > 0,
    pending: c.flow.pending ? [c.flow.pending.op] : [],
    done: c.flow.done,
  };
}

function message(dossierId: string, op: CustomsOperation, dir: "OUT" | "IN", result: CustomsMessage["result"], summary: string, atMs: number, payload: Record<string, unknown>, branch = 1): BranchMessage {
  return { id: newId("msg"), dossierId, ...(branch > 1 ? { branch } : {}), operation: op, direction: dir, result, summary, at: new Date(atMs).toISOString(), payloadPreview: JSON.stringify({ nghiepVu: op, ...payload }, null, 2) };
}

/** Mở lại tờ khai để sửa: bản nháp, hủy phê duyệt, hồ sơ về bước Review (như reopenDeclaration). */
function reopen(db: MockDb, dossierId: string) {
  const decl = db.declarations.find((d) => d.dossierId === dossierId);
  const dossier = db.dossiers.find((d) => d.id === dossierId);
  if (!decl || !dossier) return;
  const { approvedBy: _b, approvedAt: _a, ...rest } = decl;
  db.declarations[db.declarations.indexOf(decl)] = { ...rest, status: "DRAFT" };
  Object.assign(dossier, { status: "NEEDS_REVIEW", step: "review", suspectFields: decl.fields.filter((f) => f.suspect).length, updatedAt: nowIso() });
}

const hysNoOf = (no: string) => `HYS${no.slice(-6)}`;
const receiptOf = (no: string) => `BL-${no.slice(-6)}`;

/** Phản hồi đã đến → áp giai đoạn mới và tác dụng phụ. */
function apply(db: MockDb, c: Ctx) {
  const p = c.flow.pending!;
  c.flow.pending = null;
  const at = Date.parse(p.doneAt);
  if (p.outcome === "ERROR") {
    c.flow.rejection = { operation: p.op, at: p.doneAt, errors: p.errors ?? [] };
    return;
  }
  if (c.flow.rejection?.operation === p.op) delete c.flow.rejection;
  const next = stageAfter(c.flow.stage, p.op);
  if (next === null) return;
  c.flow.stage = next;
  if (!c.flow.done.includes(p.op)) c.flow.done.push(p.op);
  // Nội dung tờ Hải quan vừa nhận (như raw.sent ở backend); gửi nội dung không kèm ảnh chụp (lô một tờ) → bỏ ảnh chụp cũ.
  if (isContentOperation(p.op) && p.op !== "AMA") {
    if (p.sent) c.flow.sent = p.sent;
    else delete c.flow.sent;
  }
  const r = c.result;
  const b = baseOp(p.op);
  if (r) {
    r.updatedAt = p.doneAt;
    if (isContentOperation(p.op) && c.decl) r.customsTaxVnd = branchTaxVnd(db, c, c.decl);
    if (b === "IDA") {
      if (c.branch === 1) c.dossier.declarationNo = r.declarationNo;
      r.clearanceStatus = "WAITING";
    }
    if (b === "IDC" || b === "IDE") {
      if (c.branch === 1) c.dossier.channel = r.channel;
      r.clearanceStatus = r.channel === "GREEN" ? "WAITING" : "INSPECTING";
      if (b === "IDE") c.flow.amendments += 1;
      c.flow.clearAt = r.channel === "GREEN" ? new Date(at + GREEN_CLEAR_MS).toISOString() : c.flow.done.includes("HYS") ? new Date(at + INSPECTION_CLEAR_MS).toISOString() : null;
    }
    if (p.op === "HYS") {
      c.flow.side.hysNo = hysNoOf(r.declarationNo);
      if (c.flow.stage === "DECLARED" && r.channel !== "GREEN" && !c.flow.clearAt) c.flow.clearAt = new Date(at + INSPECTION_CLEAR_MS).toISOString();
    }
    if (p.op === "CONT") c.flow.side.containers = containersOf(db, c.dossier);
    if (p.op === "PORT_FEE") c.flow.side.portFeeReceipt = receiptOf(r.declarationNo);
    if (p.op === "AMC") {
      c.flow.postAmendments += 1;
      r.clearanceStatus = "CLEARED";
      syncDossierCleared(db, c.dossier, true);
    }
  }
  if (b === "IDD") c.flow.clearAt = null;
  if (p.op === "AMA" || p.op === "AMB" || p.op === "AMC") applyPostOperation(db, c.dossier.id, c.branch, p.op, p.doneAt, r?.declarationNo ?? "");
  else if (isRecallOperation(p.op)) {
    // Gọi về tất cả: còn tờ đích kế tiếp → gọi về tiếp, chưa mở lại (như chainSheets của backend). Hết chuỗi / gọi về một tờ → tự mở lại
    // khi tờ khai còn APPROVED/SUBMITTED (đã nháp thì giữ nguyên) – như reopenAfterRecall của backend (spec §2.3).
    const continued = p.chain === "recall" && chainRecall(db, c, at);
    if (!continued && (c.decl?.status === "APPROVED" || c.decl?.status === "SUBMITTED")) reopen(db, c.dossier.id);
  }
  // Lô nhiều tờ: tờ k khai tạm (lần đầu, hoặc truyền lại sau gọi về) xong → tờ kế tiếp cần gửi nội dung nối tiếp theo giai đoạn của nó
  // (chưa có số / RECALLED → IDA, AMEND_RECALLED → IDA01), bỏ qua tờ không cần gửi (đã thông quan…) – như chainNextBranch của backend.
  if ((b === "IDA" || b === "IDA01") && c.branch < c.of) {
    const no = Array.from({ length: c.of - c.branch }, (_, i) => c.branch + 1 + i).find((k) => contentOpFor(flowOf(db, c.dossier.id, k).stage, c.dossier.direction));
    const next = no ? load(db, c.dossier.id, no) : null;
    const nextOp = next ? contentOpFor(next.flow.stage, c.dossier.direction) : null;
    if (next && nextOp && !next.flow.pending) send(db, next, nextOp, at);
  }
  // Khai chính thức cả lô: tờ k xong (IDC/IDE) → khai chính thức tờ kế tiếp đang khai tạm – như chainDeclare của backend. Lỗi guard → ghi lỗi trên tờ đó, dừng chuỗi.
  if (p.chain === "declare" && c.branch < c.of) chainDeclare(db, c, at);
}

/** Nghiệp vụ khai chính thức cho tờ ở giai đoạn này (declareOpFor của backend); null = tờ không chờ khai chính thức. */
function declareOpFor(stage: CustomsStage, direction: Dossier["direction"]): CustomsOperation | null {
  if (stage === "PRE_DECLARED") return opFor(direction, "IDC");
  if (stage === "AMEND_PRE_DECLARED") return opFor(direction, "IDE");
  return null;
}

function chainDeclare(db: MockDb, c: Ctx, at: number) {
  const no = Array.from({ length: c.of - c.branch }, (_, i) => c.branch + 1 + i).find((k) => declareOpFor(flowOf(db, c.dossier.id, k).stage, c.dossier.direction));
  if (!no) return;
  const next = load(db, c.dossier.id, no);
  const op = declareOpFor(next.flow.stage, c.dossier.direction)!;
  try {
    if (next.flow.pending) return;
    // Tờ khai bị mở lại (DRAFT – đang sửa) → dừng chuỗi (như backend chainSheets).
    if (db.declarations.find((d) => d.dossierId === c.dossier.id)?.status === "DRAFT") throw reasonApiError("NOT_APPROVED", "DECLARATION_NOT_REAPPROVED");
    if (next.items.some((i) => !i.hsConfirmed)) throw reasonApiError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n: next.items.filter((i) => !i.hsConfirmed).length });
    send(db, next, op, at, "declare");
  } catch (e) {
    const text = e instanceof ApiError ? e.message : String(e);
    db.customsMessages.push(message(c.dossier.id, op, "IN", "ERROR", `Tờ ${no}/${c.of}: chưa khai chính thức tự động – ${text}`, at, { error: text }, no));
  }
}

/** Tờ đích của gọi về tất cả (như recallTargets của backend): tờ còn hiệu lực ở Hải quan + nghiệp vụ gọi về đang bật (null = đang chờ phản hồi). */
function recallTargetsOf(db: MockDb, dossierId: string) {
  return numberedSheets(db, dossierId)
    .filter((x) => isActiveSheet({ stage: x.stage, declarationNo: "x" }))
    .map((x) => ({ no: x.no, op: recallOpFor(operationAvailability(availabilityInput(db, load(db, dossierId, x.no)))) }));
}

/** Gọi về tất cả: tờ k gọi về xong → gọi về tờ đích kế tiếp. Tờ đó chưa gọi về được → ghi lỗi trên tờ, dừng. Trả true khi đã gửi tiếp. */
function chainRecall(db: MockDb, c: Ctx, at: number): boolean {
  const next = recallTargetsOf(db, c.dossier.id).find((t) => t.no > c.branch);
  if (!next) return false;
  if (!next.op) {
    const text = `đang chờ phản hồi nghiệp vụ khác của tờ ${next.no}`;
    db.customsMessages.push(message(c.dossier.id, opFor(c.dossier.direction, "IDB"), "IN", "ERROR", `Tờ ${next.no}/${c.of}: chưa gọi về tự động – ${text}`, at, { error: text }, next.no));
    return false;
  }
  send(db, load(db, c.dossier.id, next.no), next.op, at, "recall");
  return true;
}

/** Thông quan mô phỏng: hỏi trạng thái định kỳ (IID/IEX) trả "Đã thông quan". */
function clearIfDue(db: MockDb, c: Ctx, now: number) {
  const due = c.flow.clearAt ? Date.parse(c.flow.clearAt) : null;
  if (due === null || due > now || c.flow.pending) return;
  c.flow.clearAt = null;
  if (c.flow.stage !== "DECLARED" || !c.result) return;
  const q = queryOpFor(c.dossier.direction);
  const no = c.result.declarationNo;
  const after = c.result.channel === "GREEN" ? "Đã thông quan" : "Đã thông quan sau kiểm tra hồ sơ";
  db.customsMessages.push(
    message(c.dossier.id, q, "OUT", "OK", "Hỏi trạng thái tờ khai định kỳ", due - 800, { soToKhai: no, yeuCau: "Tra cứu" }, c.branch),
    message(c.dossier.id, q, "IN", "OK", `Trạng thái tờ khai: ${after}`, due, { soToKhai: no, trangThai: "Thông quan" }, c.branch),
  );
  c.flow.stage = "CLEARED";
  c.result.clearanceStatus = "CLEARED";
  c.result.updatedAt = new Date(due).toISOString();
  syncDossierCleared(db, c.dossier);
}

/** Áp mọi phản hồi đã đến. Gọi đầu mỗi thao tác đọc/ghi. */
function settle(db: MockDb, now: number) {
  // Lặp đến khi hết việc đến hạn: phản hồi tờ k có thể khai tạm nối tiếp tờ k+1, và phản hồi đó cũng đã đến hạn.
  for (let round = 0; round < 50; round++) {
    let changed = false;
    for (const key of Object.keys(db.customsFlows ?? {})) {
      const { dossierId, no } = parseBranchKey(key);
      if (!db.dossiers.some((d) => d.id === dossierId)) continue;
      let c: Ctx;
      try { c = load(db, dossierId, no); } catch { continue; } // tờ thừa sau khi số dòng giảm
      if (c.flow.pending && Date.parse(c.flow.pending.doneAt) <= now) {
        apply(db, c);
        changed = true;
      }
      const clearAt = c.flow.clearAt;
      clearIfDue(db, c, now);
      if (c.flow.clearAt !== clearAt) changed = true;
    }
    if (!changed) break;
  }
}

/* ---------------- Gửi nghiệp vụ ---------------- */

/** Bất biến 7: nghiệp vụ gửi nội dung chỉ khi tờ khai đã duyệt và HS đủ. */
/** Bản khai bổ sung gửi được: đã duyệt, có ít nhất một dòng hàng, đủ ô bắt buộc. */
function assertAmendmentSendable(db: MockDb, c: Ctx) {
  const a = openAmendment(db, c.dossier.id, c.branch);
  if (!a || a.status !== "APPROVED") throw reasonApiError("NOT_APPROVED", "AMENDMENT_NOT_APPROVED");
  if (!a.lines.length) throw new ApiError("NO_LINES", "Bản khai bổ sung chưa có dòng hàng");
  if (!a.header["TK_REC"]?.trim()) throw new ApiError("MISSING_FIELD", "Chưa nhập mã lý do khai bổ sung");
}

function assertSendable(db: MockDb, c: Ctx) {
  if (!c.decl) throw new ApiError("NOT_FOUND", "Chưa có tờ khai");
  if (c.decl.status !== "APPROVED") throw reasonApiError("NOT_APPROVED", "DECLARATION_NOT_APPROVED");
  const unconfirmed = c.items.filter((i) => !i.hsConfirmed).length;
  if (unconfirmed) throw reasonApiError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n: unconfirmed });
  // Dữ liệu có thể đổi sau khi duyệt – kiểm lại trước khi gửi.
  assertNoGaps(db, c.decl, "khai");
}

const STAGE_TEXT: Record<CustomsStage, string> = {
  NOT_SENT: "Chưa khai báo",
  PRE_DECLARED: "Đã khai tạm, chưa khai chính thức",
  RECALLED: "Tờ khai tạm đang gọi về sửa",
  DECLARED: "Đã phân luồng – chờ thông quan",
  AMEND_RECALLED: "Đang sửa đổi bổ sung (đã gọi tờ khai về)",
  AMEND_PRE_DECLARED: "Đã khai tạm sửa đổi, chờ khai chính thức sửa đổi",
  CLEARED: "Đã thông quan",
  POST_EDITING: "Đã thông quan – đang sửa sau thông quan",
  POST_PRE_DECLARED: "Đã thông quan – đã khai tạm AMA, chờ khai chính thức",
  POST_RECALLED: "Đã thông quan – bản khai AMA đang gọi về sửa",
  REJECTED: "Hải quan từ chối / hủy tờ khai",
};

function statusText(c: Ctx) {
  if (c.flow.stage === "DECLARED" && c.result) {
    return c.result.channel === "GREEN" ? "Luồng xanh – chờ thông quan" : c.result.channel === "YELLOW" ? "Luồng vàng – chờ kiểm tra chi tiết hồ sơ" : "Luồng đỏ – chờ kiểm tra thực tế hàng hóa";
  }
  return STAGE_TEXT[c.flow.stage];
}

/** Nội dung thông điệp gửi/nhận của từng nghiệp vụ (mô phỏng). */
function texts(db: MockDb, c: Ctx, op: CustomsOperation, no: string): { out: string; in: string; payload: Record<string, unknown> } {
  const r = c.result!;
  const tax = c.decl ? branchTaxVnd(db, c, c.decl) : r.customsTaxVnd;
  // Ô 1.2 của tờ khai nhánh: tờ 1 ghi "F", tờ k ≥ 2 ghi số tờ khai của tờ 1; số tờ / tổng số tờ.
  const sheetCells = c.of > 1 ? { TK_FIC: c.branch === 1 ? "F" : (resultOf(db, c.dossier.id, 1)?.declarationNo ?? ""), TK_BNO: c.branch, TK_DNO: c.of } : {};
  const amend = c.flow.amendments + 1;
  const post = c.flow.postAmendments + 1;
  const payload = { soToKhai: no };
  switch (baseOp(op)) {
    case "IDA":
      return {
        out: `Khai tạm thông tin tờ khai (${op})${c.flow.stage === "RECALLED" ? " sau khi gọi sửa" : ""}`,
        in: `${c.flow.stage === "RECALLED" ? "Hải quan tiếp nhận khai tạm lại" : "Hải quan cấp số"} tờ khai ${no} – thuế dự kiến ${formatVnd(tax)}`,
        payload: { ...basePayload(c.dossier, db.org.taxCode), ...sheetCells, soToKhai: no, thueDuKien: `${tax} VND` },
      };
    case "IDB":
      return { out: `Gọi sửa đổi tờ khai tạm (${op})`, in: "Hải quan chấp nhận gọi sửa – tờ khai mở lại để sửa và phê duyệt lại", payload };
    case "IDC":
      return { out: `Khai chính thức tờ khai (${op}) – đã ký số`, in: `Kết quả phân luồng: luồng ${CHANNEL_VI[r.channel]}`, payload: { ...payload, chuKySo: "Đã ký", maPhanLuong: r.channel === "GREEN" ? 1 : r.channel === "YELLOW" ? 2 : 3 } };
    case "IDD":
      return { out: `Gọi tờ khai đã phân luồng để sửa đổi bổ sung (${op})`, in: `Hải quan chấp nhận – tờ khai mở lại để sửa đổi bổ sung lần ${amend}`, payload };
    case "IDA01":
      return { out: `Khai tạm sửa đổi bổ sung lần ${amend} (${op})`, in: `Hải quan tiếp nhận khai tạm sửa đổi lần ${amend} – thuế dự kiến ${formatVnd(tax)}`, payload: { ...payload, lanSua: amend, thueDuKien: `${tax} VND` } };
    case "IDE":
      return { out: `Khai chính thức sửa đổi bổ sung lần ${amend} (${op}) – đã ký số`, in: `Hải quan chấp nhận sửa đổi bổ sung lần ${amend} – giữ luồng ${CHANNEL_VI[r.channel]}`, payload: { ...payload, lanSua: amend, chuKySo: "Đã ký" } };
    case "AMA": {
      const a = openAmendment(db, c.dossier.id, c.branch);
      const delta = a ? amendmentDelta(a) : "0";
      return {
        out: `Khai tạm bản khai bổ sung sau thông quan lần ${post} (AMA) – ${a?.lines.length ?? 0} dòng hàng`,
        in: `Hải quan tiếp nhận bản khai bổ sung AMA lần ${post} – tiền thuế ${delta.startsWith("-") ? "giảm" : "tăng"} ${formatVnd(delta.replace("-", ""))}`,
        payload: { ...payload, lanSua: post, lyDo: a?.header["TK_REC"] ?? "", soDong: a?.lines.length ?? 0, tangGiamThue: `${delta} VND` },
      };
    }
    case "AMB":
      return { out: "Gọi sửa bản khai tạm AMA (AMB)", in: "Bản khai AMA đã gọi về – sửa bản khai bổ sung, phê duyệt lại rồi khai AMA", payload };
    case "AMC":
      return { out: "Khai chính thức bản khai AMA (AMC) – đã ký số", in: `Hải quan chấp nhận khai bổ sung sau thông quan lần ${post}`, payload: { ...payload, lanSua: post, chuKySo: "Đã ký" } };
    case "HYS": {
      const files = db.documents.filter((d) => d.dossierId === c.dossier.id).length || 3;
      return { out: `Gửi hồ sơ chứng từ điện tử (${files} tệp đính kèm)`, in: `Hải quan tiếp nhận hồ sơ – số tiếp nhận ${hysNoOf(no)}`, payload: { ...payload, soTep: files, soTiepNhan: hysNoOf(no) } };
    }
    case "CONT": {
      const list = containersOf(db, c.dossier);
      return { out: `Đăng ký container qua khu vực giám sát (${list.length} container)`, in: `Đã đăng ký qua khu vực giám sát: ${list.join(", ")}`, payload: { ...payload, soVanDon: c.dossier.billNo, container: list } };
    }
    case "PORT_FEE":
      return {
        out: "Khai nộp lệ phí cảng biển",
        in: `Đã có biên lai ${receiptOf(no)} – số tiền mô phỏng ${formatVnd(PORT_FEE_DEMO_VND)}, không phải biểu phí thật`,
        payload: { ...payload, bienLai: receiptOf(no), soTienMoPhong: `${PORT_FEE_DEMO_VND} VND`, ghiChu: "Mô phỏng – không phải biểu phí thật" },
      };
    default:
      return { out: `Gửi ${op}`, in: `Hải quan tiếp nhận ${op}`, payload };
  }
}

/** Luật mô phỏng: khai tạm khi địa chỉ đối tác nước ngoài còn trống → lỗi đúng dạng errorList của FPT (indexCode = mã trường VNACCS). */
function rejectionErrors(c: Ctx, op: CustomsOperation): CustomsError[] {
  if (baseOp(op) !== "IDA" || !c.decl) return [];
  const nk = c.dossier.direction === "NK";
  const addr = c.decl.fields.find((f) => f.code === (nk ? "NXK_DC" : "NNK_DC"))?.value.trim() ?? "";
  if (addr && addr !== "—") return [];
  return [{ code: "MOCK-REQ", field: nk ? "EPA" : "CGA", message: nk ? "Chưa nhập địa chỉ người xuất khẩu" : "Chưa nhập địa chỉ người nhập khẩu", solution: "Nhập địa chỉ theo hóa đơn/hợp đồng rồi khai lại" }];
}

/** Gửi một nghiệp vụ: OUT ngay, IN sau LIVE_REPLY_MS; giai đoạn đổi khi IN đã đến. */
function send(db: MockDb, c: Ctx, op: CustomsOperation, now: number, chain?: "declare" | "recall") {
  if (!c.result) {
    if (!c.decl) throw new ApiError("NOT_FOUND", "Chưa có tờ khai");
    const channel = channelFor(c.dossier, c.branch);
    c.result = {
      dossierId: c.dossier.id,
      declarationNo: c.branch === 1 ? (c.dossier.declarationNo ?? declarationNoFor(c.dossier)) : declarationNoFor(c.dossier, c.branch),
      channel,
      channelNote: CHANNEL_NOTES[channel],
      clearanceStatus: "WAITING",
      customsTaxVnd: branchTaxVnd(db, c, c.decl),
      updatedAt: new Date(now).toISOString(),
    };
    if (c.branch === 1) db.customsResults = db.customsResults.filter((r) => r.dossierId !== c.dossier.id).concat(c.result);
    else (db.customsBranchResults ??= {})[branchKey(c.dossier.id, c.branch)] = c.result;
  }
  const t = texts(db, c, op, c.result.declarationNo);
  const doneAt = now + LIVE_REPLY_MS;
  const errors = rejectionErrors(c, op);
  if (errors.length) {
    // Hải quan (mô phỏng) từ chối khai tạm: nhật ký ghi lỗi, màn Review gắn lỗi vào đúng ô chỉ tiêu.
    const summary = `${CUSTOMS_OPERATIONS[op].label} bị từ chối: ${errors.map((e) => `${e.code} (${e.field}): ${e.message}`).join("; ")}`;
    db.customsMessages.push(message(c.dossier.id, op, "OUT", "OK", t.out, now, t.payload, c.branch), message(c.dossier.id, op, "IN", "ERROR", summary, doneAt, { errorList: errors }, c.branch));
    c.flow.pending = { op, outcome: "ERROR", doneAt: new Date(doneAt).toISOString(), errors, ...(chain ? { chain } : {}) };
    return;
  }
  db.customsMessages.push(message(c.dossier.id, op, "OUT", "OK", t.out, now, t.payload, c.branch), message(c.dossier.id, op, "IN", "OK", t.in, doneAt, { ...t.payload, ketQua: "Thành công" }, c.branch));
  const sent = c.of > 1 && isContentOperation(op) && op !== "AMA" ? sheetSnapshotOf(db, c.dossier.id, c.branch) : null;
  c.flow.pending = { op, outcome: "OK", doneAt: new Date(doneAt).toISOString(), ...(chain ? { chain } : {}), ...(sent ? { sent } : {}) };
  if (isContentOperation(op) && op !== "AMA" && c.decl) {
    c.decl.status = "SUBMITTED";
    Object.assign(c.dossier, { status: "SUBMITTED", step: "submit", updatedAt: nowIso() });
  }
}

/** Tra cứu trạng thái: trả lời ngay, không đổi giai đoạn. */
function answerQuery(db: MockDb, c: Ctx, now: number): OperationResult {
  if (!hasDeclarationNumber(c.flow.stage) || !c.result) throw new ApiError("OPERATION_LOCKED", "Chưa có số tờ khai để tra cứu – khai tạm trước");
  const q = queryOpFor(c.dossier.direction);
  const text = statusText(c);
  db.customsMessages.push(
    message(c.dossier.id, q, "OUT", "OK", "Tra cứu trạng thái tờ khai", now, { soToKhai: c.result.declarationNo, yeuCau: "Tra cứu" }, c.branch),
    message(c.dossier.id, q, "IN", "OK", `Trạng thái tờ khai: ${text}`, now, { soToKhai: c.result.declarationNo, trangThai: text }, c.branch),
  );
  return { sent: false, message: `Trạng thái tờ khai: ${text}` };
}

function perform(db: MockDb, dossierId: string, op: CustomsOperation, now: number, branch = 1, chain?: "declare" | "recall"): OperationResult {
  settle(db, now);
  const c = load(db, dossierId, branch);
  if (op === queryOpFor(c.dossier.direction)) return answerQuery(db, c, now);
  if (CUSTOMS_OPERATIONS[op].kind === "query") throw new ApiError("INVALID_OPERATION", "Tờ khai nhập tra cứu bằng IID, tờ khai xuất bằng IEX");
  const a = operationAvailability(availabilityInput(db, c)).find((x) => x.op === op);
  if (!a) throw new ApiError("INVALID_OPERATION", `Nghiệp vụ ${op} không dùng cho tờ khai ${c.dossier.direction === "NK" ? "nhập" : "xuất"} khẩu`);
  if (!a.enabled) throw new ApiError("OPERATION_LOCKED", a.reason || "Nghiệp vụ chưa thực hiện được ở giai đoạn này", 400, { reason: a.reasonCode, params: a.reasonParams });
  if (a.action === "EDIT") throw new ApiError("NOT_APPROVED", a.reason ?? "Sửa tờ khai và phê duyệt lại trước", 400, { reason: a.reasonCode, params: a.reasonParams });
  if (a.action === "START_POST_EDIT") throw reasonApiError("POST_EDIT_REQUIRED", "START_POST_EDIT_FIRST", undefined, "Lập bản khai bổ sung ở bước 7 “Sửa sau thông quan” trước khi khai AMA");
  if (c.of > 1 && isContentOperation(op) && op !== "AMA") {
    // Tờ chưa gọi về phải giữ đúng nội dung đã gửi (SENT_SHEETS_CHANGED – thay R3, cùng quy tắc backend).
    const changed = sentSheetsMockError(db, dossierId);
    if (changed) throw changed;
    if (c.branch > 1) {
      // Tờ 1 phải có số (ô 1.2 của tờ k mang số tờ 1).
      if (!hasDeclarationNumber(flowOf(db, dossierId, 1).stage)) throw new ApiError("INVALID_STATE", `Tờ ${c.branch}: tờ 1 chưa có số tờ khai – khai tạm tờ 1 trước`);
      // Luôn truyền theo thứ tự tờ (§6.2/§6.4, cùng quy tắc backend): tờ trước còn chờ gửi nội dung (chưa gửi / gọi về chưa gửi lại; miễn tờ đã thông quan – R7) → chờ.
      const waitFor = sheetOrderWait(Array.from({ length: c.of }, (_, i) => ({ no: i + 1, stage: flowOf(db, dossierId, i + 1).stage })), c.branch);
      if (waitFor !== null) throw reasonApiError("INVALID_STATE", "SHEET_ORDER", { sheet: c.branch, waitFor });
      if (c.flow.stage === "NOT_SENT" && !hasDeclarationNumber(flowOf(db, dossierId, c.branch - 1).stage)) throw new ApiError("INVALID_STATE", `Tờ ${c.branch}: tờ ${c.branch - 1} chưa khai tạm – khai tạm lần lượt từng tờ`);
    }
  }
  if (c.of > 1 && orderedOperation(op) === "DECLARE") {
    // Khai chính thức tờ k: mọi tờ trước đã khai tạm xong (cùng sheetOrderWait với backend; không bắt tờ trước đã khai chính thức).
    const waitFor = sheetOrderWait(Array.from({ length: c.of }, (_, i) => ({ no: i + 1, stage: flowOf(db, dossierId, i + 1).stage })), c.branch);
    if (waitFor !== null) throw reasonApiError("INVALID_STATE", "SHEET_ORDER_DECLARE", { sheet: c.branch, waitFor });
    // Tờ còn hiệu lực phải giữ đúng nội dung đã gửi (như backend): gọi về một phần rồi sửa chỉ tiêu chung → không khai chính thức tờ khác.
    const changed = sentSheetsMockError(db, dossierId);
    if (changed) throw changed;
  }
  if (op === "AMA") assertAmendmentSendable(db, c);
  else if (isContentOperation(op)) assertSendable(db, c);
  send(db, c, op, now, chain);
  return { sent: true, message: `Đã gửi ${op} – ${CUSTOMS_OPERATIONS[op].label.toLowerCase()}. Chờ Hải quan phản hồi.` };
}

/** Thực hiện một nghiệp vụ theo quy tắc chung (operationAvailability); bị khóa → lỗi kèm lý do. */
/** `branch`: tờ khai nhánh của lô > 50 dòng (mặc định tờ 1). */
export const performOperation = (dossierId: string, op: CustomsOperation, branch = 1) => mutate((db) => perform(db, dossierId, op, Date.now(), branch));

/** Ký số và khai tạm lần đầu (IDA/EDA). Khai chính thức (IDC/EDC) là thao tác riêng của người khai. */
export const submitDeclaration = (dossierId: string, certificateId: string) =>
  mutate((db) => {
    if (!certificateId) throw reasonApiError("NO_CERT", "CERTIFICATE_REQUIRED");
    const dossier = db.dossiers.find((d) => d.id === dossierId);
    if (!dossier) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    settle(db, Date.now());
    const c = load(db, dossierId);
    // Lô nhiều tờ: gọi về một phần được; tờ chưa gọi về phải giữ đúng nội dung đã gửi (SENT_SHEETS_CHANGED); tờ 1 đang chờ sửa đổi (AMEND_RECALLED) gửi IDA01.
    const changed = sentSheetsMockError(db, dossierId);
    if (changed) throw changed;
    // Lô nhiều tờ: tờ đầu tiên cần gửi nội dung theo giai đoạn (tờ đã thông quan bỏ qua – R7); worker (apply) nối tiếp các tờ sau.
    const target = c.of > 1 ? Array.from({ length: c.of }, (_, i) => i + 1).find((no) => contentOpFor(flowOf(db, dossierId, no).stage, dossier.direction)) ?? 1 : 1;
    const stage = target === 1 ? c.flow.stage : flowOf(db, dossierId, target).stage;
    const op = c.of > 1 ? contentOpFor(stage, dossier.direction) : stage === "NOT_SENT" || stage === "RECALLED" ? opFor(dossier.direction, "IDA") : null;
    if (!op) throw new ApiError("ALREADY_SUBMITTED", "Tờ khai đã được khai tạm – không gửi trùng");
    perform(db, dossierId, op, Date.now(), target);
  });

/** Bắt đầu sửa đổi sau thông quan: CLEARED → POST_EDITING, lập bản khai bổ sung AMA (tờ khai gốc không mở lại). */
/** Lập bản khai bổ sung cho tờ (đã settle): tờ phải đã thông quan. Dùng cho startPostAmendment và nhân bản chỉ tiêu chung sang tờ khác. */
export function beginAmendment(db: MockDb, dossierId: string, branch: number) {
  const c = load(db, dossierId, branch);
  const a = operationAvailability(availabilityInput(db, c)).find((x) => x.op === "AMA");
  if (!a || a.action !== "START_POST_EDIT" || !a.enabled) throw new ApiError("INVALID_STATE", a?.reason || "Chỉ sửa sau thông quan khi tờ khai đã thông quan", 400, { reason: a?.reasonCode, params: a?.reasonParams });
  if (!c.decl || !c.result) throw new ApiError("NOT_FOUND", "Chưa có tờ khai đã thông quan");
  // AMA là bản khai riêng: tờ khai gốc giữ nguyên (khóa), lập bản khai bổ sung điền sẵn từ tờ khai gốc + số Hải quan trả về.
  createAmendment(db, c.dossier, c.decl, customsInfoOf(db, c, c.flow.stage, seenOf(db, c, Date.now())), c.result.declarationNo, branch);
  c.flow.stage = "POST_EDITING";
  Object.assign(c.dossier, { step: "review", updatedAt: nowIso() });
}

export const startPostAmendment = (dossierId: string, branch = 1) =>
  mutate((db) => {
    settle(db, Date.now());
    beginAmendment(db, dossierId, branch);
  });

/** Thông tin Hải quan trả về hiện tại của hồ sơ (bản khai bổ sung dùng làm phần "Trước"). */
export function customsInfoNow(db: MockDb, dossierId: string, branch = 1): CustomsInfo | null {
  const c = load(db, dossierId, branch);
  return customsInfoOf(db, c, c.flow.stage, seenOf(db, c, Date.now()));
}

/** Số tờ khai Hải quan đã trả cho tờ (null khi chưa khai tạm) – bản khai bổ sung tham chiếu. */
export const branchDeclarationNo = (db: MockDb, dossierId: string, branch = 1): string | null => resultOf(db, dossierId, branch)?.declarationNo ?? null;
/** Giai đoạn của tờ (chưa có luồng → NOT_SENT). */
export const branchStageOf = (db: MockDb, dossierId: string, branch: number): CustomsStage => flowOf(db, dossierId, branch).stage;
/** Số tờ khai nhánh của lô (theo số dòng hàng). */
export const branchCountOf = (db: MockDb, dossierId: string): number => branchesOf(db.lineItems.filter((i) => i.dossierId === dossierId)).length;
/** Tờ đang chờ phản hồi một nghiệp vụ. */
export const branchBusy = (db: MockDb, dossierId: string, branch: number): boolean => Boolean(flowOf(db, dossierId, branch).pending);

/**
 * Trạng thái Hải quan gộp của hồ sơ cho danh sách / đầu hồ sơ ("Thông quan k/N", tờ bị từ chối / lỗi gửi) – như backend (dossierCustomsSummary).
 * Chưa tờ nào truyền → undefined (hồ sơ không có `customs`).
 */
export function customsSummaryOf(db: MockDb, dossierId: string): CustomsSummary | undefined {
  const sheets = branchesOf(db.lineItems.filter((i) => i.dossierId === dossierId));
  const flows = (sheets.length ? sheets : [{ no: 1 }]).map((sh) => ({ no: sh.no, stage: db.customsFlows?.[branchKey(dossierId, sh.no)]?.stage ?? "NOT_SENT" }));
  const msgs = db.customsMessages.filter((m) => m.dossierId === dossierId);
  if (!msgs.length && flows.every((f) => f.stage === "NOT_SENT")) return undefined;
  const last = (no: number) => msgs.filter((m) => (m.branch ?? 1) === no).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  const s = dossierCustomsSummary(flows.map((f) => ({ stage: f.stage, state: last(f.no)?.result === "ERROR" ? ("SEND_FAILED" as const) : ("APPROVED" as const) })));
  return { of: s.of, cleared: s.cleared, problems: s.problems };
}

/** Chốt các phản hồi đã đến (màn hình bản khai bổ sung đọc trạng thái mới nhất). */
export const settleCustoms = (db: MockDb) => settle(db, Date.now());

/**
 * Gửi lại một nghiệp vụ bị lỗi. Nguyên tắc chống gửi trùng (ADR 0005): luôn tra cứu (IID/IEX) trước,
 * chỉ gửi lại khi Hải quan chưa ghi nhận.
 */
export const resendOperation = (dossierId: string, op: CustomsOperation, branch = 1) =>
  mutate((db): ResendResult => {
    const now = Date.now();
    settle(db, now);
    const c = load(db, dossierId, branch);
    if (!c.result) throw new ApiError("NOT_FOUND", "Hồ sơ chưa truyền");
    const q = queryOpFor(c.dossier.direction);
    if (op === q) {
      const r = answerQuery(db, c, now);
      return { resent: false, message: r.message };
    }
    if (c.flow.pending) throw new ApiError("BUSY", `Đang chờ phản hồi ${c.flow.pending.op}`);
    const last = db.customsMessages.filter((m) => m.dossierId === dossierId && (m.branch ?? 1) === branch && m.operation === op && Date.parse(m.at) <= now).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    if (last?.result !== "ERROR") throw new ApiError("NOTHING_TO_RESEND", `${op} không có lỗi cần gửi lại`);
    const no = c.result.declarationNo;
    const text = statusText(c);
    const t = texts(db, c, op, no);
    const outAt = now + 2_400;
    const doneAt = outAt + LIVE_REPLY_MS;
    db.customsMessages.push(
      message(dossierId, q, "OUT", "OK", "Tra cứu trạng thái trước khi gửi lại", now, { soToKhai: no, yeuCau: "Tra cứu" }, branch),
      message(dossierId, q, "IN", "OK", `Chưa ghi nhận ${op} mới nhất – được phép gửi lại (trạng thái: ${text})`, now + 1_200, { soToKhai: no, trangThai: text }, branch),
      message(dossierId, op, "OUT", "OK", `Gửi lại: ${t.out}`, outAt, { ...t.payload, lanGui: 2 }, branch),
      message(dossierId, op, "IN", "OK", t.in, doneAt, { ...t.payload, ketQua: "Thành công" }, branch),
    );
    c.flow.pending = { op, outcome: "OK", doneAt: new Date(doneAt).toISOString() };
    return { resent: true, message: `Đang gửi lại ${CUSTOMS_OPERATIONS[op].label.toLowerCase()}` };
  });

/* ---------------- Đọc ---------------- */

function clearanceOf(stage: CustomsStage, r: CustomsResult): CustomsResult["clearanceStatus"] {
  if (stage === "REJECTED") return "REJECTED";
  if (stage === "CLEARED" || stage.startsWith("POST_")) return "CLEARED";
  if (stage === "DECLARED" || stage.startsWith("AMEND_")) return r.channel === "GREEN" ? "WAITING" : "INSPECTING";
  return "WAITING";
}

const vnDateOf = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
const vnTimeOf = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(11, 19);
const INSPECTION_CODE = { GREEN: "1", YELLOW: "2", RED: "3" } as const;

/**
 * Thông tin Hải quan trả về (mô phỏng): số tờ khai, trị giá/thuế/tỷ giá theo tờ khai nháp (Hải quan mock tính giống ứng dụng),
 * ngày giờ đăng ký + mã phân loại kiểm tra sau khai chính thức, chỉ thị khi luồng vàng/đỏ, cấp phép khi thông quan.
 */
function customsInfoOf(db: MockDb, c: Ctx, stage: CustomsStage, seen: CustomsMessage[]): CustomsInfo | null {
  const r = c.result;
  if (!r || !c.decl || !hasDeclarationNumber(stage)) return null;
  const items = c.items;
  const allItems = db.lineItems.filter((i) => i.dossierId === c.dossier.id).sort((a, b) => a.lineNo - b.lineNo);
  const tAll = computeTaxes(c.dossier, allItems, c.decl.valueAdjustments);
  const ids = new Set(items.map((i) => i.id));
  // Thuế tính trên cả lô (điều chỉnh trị giá phân bổ theo cả lô); tổng của tờ = tổng các dòng của tờ (số nguyên VND, không dùng số thực).
  const perItem = tAll.perItem.filter((p) => ids.has(p.itemId));
  const sumVnd = (pick: (p: (typeof perItem)[number]) => string) => String(perItem.reduce((n, p) => n + BigInt(pick(p)), 0n));
  const t = c.of === 1
    ? tAll
    : { ...tAll, perItem, customsValueVnd: sumVnd((p) => p.customsValueVnd), importDutyVnd: sumVnd((p) => p.importDutyVnd), vatVnd: sumVnd((p) => p.vatVnd) };
  const nk = c.dossier.direction === "NK";
  const opAt = (ops: CustomsOperation[]) => seen.filter((m) => m.direction === "IN" && m.result === "OK" && ops.includes(m.operation)).at(0)?.at;
  const registeredAt = isChanneled(stage) ? opAt(["IDC", "EDC"]) : undefined;
  const cleared = stage === "CLEARED" || stage.startsWith("POST_");
  const clearedAt = cleared ? seen.filter((m) => m.direction === "IN").at(-1)?.at : undefined;
  const channel = isChanneled(stage) ? r.channel : undefined;
  const taxes = nk
    ? [{ code: "N", name: "Thuế nhập khẩu", amountVnd: t.importDutyVnd }, { code: "V", name: "Thuế GTGT", amountVnd: t.vatVnd }]
    : [{ name: "Thuế xuất khẩu", amountVnd: "0" }];
  const total = nk ? String(BigInt(t.importDutyVnd) + BigInt(t.vatVnd)) : "0";
  const hs = items[0]?.hsConfirmed;
  return {
    receivedAt: seen.at(-1)?.at ?? r.updatedAt,
    declarationNo: r.declarationNo,
    customsOfficeName: c.dossier.customsOffice,
    subsection: "00",
    ...(hs ? { representativeHs: hs.replace(/\D/g, "").slice(0, 4) } : {}),
    pages: 3,
    lines: items.length,
    exchangeRates: c.dossier.currency === "VND" ? [] : [{ currency: c.dossier.currency, rate: t.exchangeRate }],
    totalCustomsValue: { amount: t.customsValueVnd, currency: "VND" },
    taxes,
    totalTaxVnd: total,
    items: items.map((it, idx) => {
      const tax = t.perItem.find((p) => p.itemId === it.id);
      return {
        lineNo: idx + 1,
        ...(it.hsConfirmed ? { hsCode: it.hsConfirmed.replace(/\D/g, "") } : {}),
        ...(tax ? { customsValue: tax.customsValueVnd, customsValueCurrency: "VND", taxAmountVnd: nk ? tax.importDutyVnd : "0" } : {}),
        taxRate: nk ? (it.importDutyRate ?? "0") : "0",
      };
    }),
    ...(registeredAt ? { registeredDate: vnDateOf(registeredAt), registeredTime: vnTimeOf(registeredAt) } : {}),
    ...(channel ? { inspectionCode: INSPECTION_CODE[channel] } : {}),
    ...(channel && channel !== "GREEN"
      ? {
          directiveKind: "A",
          directives: [{ ...(registeredAt ? { date: vnDateOf(registeredAt) } : {}), title: "Nộp chứng từ giấy tờ", content: "Đề nghị nộp bộ chứng từ (hóa đơn, vận đơn, phiếu đóng gói) qua nghiệp vụ HYS để kiểm tra hồ sơ." }],
        }
      : { directives: [] }),
    ...(clearedAt ? { permitDate: vnDateOf(clearedAt), permitTime: vnTimeOf(clearedAt), chiefName: "Chi cục trưởng (mô phỏng)" } : {}),
  };
}

/** Trạng thái truyền của một tờ khai nhánh (pipeline, thông điệp, kết quả…). */
function branchView(db: MockDb, c: Ctx, now: number): BranchSubmission {
  const input = availabilityInput(db, c);
  const avail = operationAvailability(input);
  const all = db.customsMessages.filter((m) => m.dossierId === c.dossier.id && (m.branch ?? 1) === c.branch).sort((a, b) => a.at.localeCompare(b.at));
  const seen = all.filter((m) => Date.parse(m.at) <= now);
  const stage = c.flow.stage;

  const pipeline: PipelineRow[] = operationsFor(c.dossier.direction).map((op) => {
    const a = avail.find((x) => x.op === op)!;
    const last = seen.filter((m) => m.operation === op).at(-1);
    const status: PipelineStatus =
      c.flow.pending?.op === op ? "SENDING" : !last ? "NOT_SENT" : last.result === "ERROR" ? "ERROR" : last.result === "PENDING" ? "SENDING" : "OK";
    return {
      op,
      label: CUSTOMS_OPERATIONS[op].label,
      status,
      phase: CUSTOMS_OPERATIONS[op].phase,
      enabled: a.enabled,
      action: a.action,
      ...(a.reason ? { reason: a.reason } : {}),
      ...(a.reasonCode ? { reasonCode: a.reasonCode } : {}),
      ...(a.reasonParams ? { reasonParams: a.reasonParams } : {}),
      ...(last ? { at: last.at, summary: last.summary } : {}),
    };
  });

  const r = c.result;
  const result: Partial<CustomsResult> | null =
    r && hasDeclarationNumber(stage)
      ? {
          dossierId: c.dossier.id,
          declarationNo: r.declarationNo,
          ...(isChanneled(stage) ? { channel: r.channel, channelNote: r.channelNote } : {}),
          customsTaxVnd: r.customsTaxVnd,
          clearanceStatus: clearanceOf(stage, r),
          updatedAt: seen.at(-1)?.at ?? r.updatedAt,
        }
      : null;

  return {
    no: c.branch,
    of: c.of,
    stage,
    // Gửi lỗi: thông điệp mới nhất của tờ là lỗi (gửi lại / gửi tiếp thành công thì hết).
    state: seen.at(-1)?.result === "ERROR" ? "SEND_FAILED" : "APPROVED",
    declarationNo: result?.declarationNo ?? null,
    channel: result?.channel ?? null,
    started: all.length > 0,
    inProgress: Boolean(c.flow.pending) || Boolean(c.flow.clearAt) || all.some((m) => Date.parse(m.at) > now),
    nextOp: nextCustomsOperation(input),
    queryOp: queryOpFor(c.dossier.direction),
    amendments: c.flow.amendments,
    postAmendments: c.flow.postAmendments,
    pipeline,
    messages: [...seen].reverse().map(({ branch: _b, ...m }): CustomsMessage => m),
    result,
    customsInfo: customsInfoOf(db, c, stage, seen),
    rejection: c.flow.rejection ?? null,
    sentChanges: sentChangesOf(db, c),
  };
}

/** Lô nhiều tờ, tờ còn hiệu lực có ảnh chụp: chỉ tiêu chung / dòng hàng khác nội dung đã gửi (như backend getSubmission); khác → null. */
function sentChangesOf(db: MockDb, c: Ctx): BranchSubmission["sentChanges"] {
  if (c.of <= 1 || !c.flow.sent) return null;
  const s = sentSheetsOf(db, c.dossier.id).find((x) => x.no === c.branch);
  if (!s || !sentSheetsCheck([s]).changed.length) return null;
  return sentSnapshotDiff(s.current, c.flow.sent);
}

/** Trường cấp hồ sơ = tờ 1 (tương thích); `branches` mọi tờ theo thứ tự; `summary` gộp bằng dossierCustomsSummary (giống backend). */
function view(db: MockDb, dossierId: string, now: number): SubmissionView {
  const first = load(db, dossierId, 1);
  const branches = Array.from({ length: first.of }, (_, i) => branchView(db, i === 0 ? first : load(db, dossierId, i + 1), now));
  const { no: _no, of: _of, state: _state, declarationNo: _dn, channel: _ch, sentChanges: _sc, ...legacy } = branches[0]!;
  const s = dossierCustomsSummary(branches);
  return {
    declarationStatus: first.decl?.status ?? "NOT_CREATED",
    hsUnconfirmed: db.lineItems.filter((i) => i.dossierId === dossierId && !i.hsConfirmed).length,
    ...legacy,
    branches,
    summary: { of: s.of, cleared: s.cleared, problems: s.problems },
  };
}

export const getSubmission = (dossierId: string) =>
  mutate((db) => {
    const now = Date.now();
    settle(db, now);
    return view(db, dossierId, now);
  });

/** Danh sách tờ khai đã duyệt / đang / đã truyền cho màn "Khai báo Hải quan": mỗi tờ khai nhánh một dòng (các dòng cùng hồ sơ liền nhau). */
export const listCustomsDeclarations = () =>
  mutate((db): CustomsRow[] => {
    const now = Date.now();
    settle(db, now);
    const groups = db.declarations
      .filter((d) => d.status === "APPROVED" || d.status === "SUBMITTED" || (db.customsFlows?.[d.dossierId]?.stage ?? "NOT_SENT") !== "NOT_SENT")
      .flatMap((decl): CustomsRow[][] => {
        const d = db.dossiers.find((x) => x.id === decl.dossierId);
        if (!d) return [];
        const v = view(db, d.id, now);
        return [v.branches.map((b): CustomsRow => {
          const last = b.messages[0];
          const pending = b.pipeline.some((p) => p.status === "SENDING");
          const state: CustomsRow["state"] =
            b.stage === "NOT_SENT" ? (pending ? "SENDING" : "READY") : pending ? "SENDING" : b.result?.clearanceStatus === "CLEARED" ? "CLEARED" : "INSPECTING";
          return {
            dossierId: d.id,
            dossierCode: d.code,
            branch: b.no,
            of: b.of,
            direction: d.direction,
            partner: d.partner,
            typeCode: d.typeCode,
            state,
            stage: b.stage,
            updatedAt: last?.at ?? decl.approvedAt ?? d.updatedAt,
            ...(last ? { lastOperation: last.operation } : {}),
            ...(b.result?.declarationNo ? { declarationNo: b.result.declarationNo } : {}),
            ...(b.result?.channel ? { channel: b.result.channel, channelNote: CHANNEL_NOTES[b.result.channel] } : {}),
            ...(b.result?.customsTaxVnd ? { customsTaxVnd: b.result.customsTaxVnd } : {}),
          };
        })];
      });
    const latest = (g: CustomsRow[]) => g.map((r) => r.updatedAt).sort().at(-1)!;
    return groups.sort((a, b) => latest(b).localeCompare(latest(a))).flat();
  });

/**
 * Gọi về tất cả tờ (như recallAllSheets của backend): gọi về tờ đích đầu tiên, các tờ sau nối tiếp khi tờ trước xong (apply → chainRecall);
 * lệnh cuối xong → tự mở lại tờ khai. Lô một tờ / không còn tờ cần gọi về / có tờ đích đang chờ phản hồi → lỗi như backend, không gửi tờ nào.
 */
export const recallAllSheets = (dossierId: string) =>
  mutate((db): RecallAllResult => {
    settle(db, Date.now());
    const c = load(db, dossierId);
    if (c.of <= 1) throw reasonApiError("VALIDATION", "RECALL_ALL_SINGLE_SHEET");
    const targets = recallTargetsOf(db, dossierId);
    if (!targets.length) throw reasonApiError("INVALID_STATE", "RECALL_ALL_NONE");
    const blocked = targets.filter((t) => !t.op);
    if (blocked.length) throw reasonApiError("INVALID_STATE", "RECALL_ALL_BLOCKED", { sheets: blocked.map((t) => t.no).join(", ") });
    const first = targets[0]!;
    return { ...perform(db, dossierId, first.op!, Date.now(), first.no, "recall"), sheets: targets.map((t) => t.no) };
  });

/**
 * Khai chính thức cả lô (như declareAllSheets của backend): IDC/IDE tờ đầu tiên đang khai tạm, các tờ sau nối tiếp khi tờ trước xong (apply → chainDeclare).
 * Lô một tờ / còn nghiệp vụ đang chạy / còn tờ chờ gửi nội dung / không còn tờ chờ → lỗi như backend.
 */
export const declareAllSheets = (dossierId: string) =>
  mutate((db): OperationResult => {
    settle(db, Date.now());
    const c = load(db, dossierId);
    if (c.of <= 1) throw reasonApiError("VALIDATION", "DECLARE_ALL_SINGLE_SHEET");
    const sheets = Array.from({ length: c.of }, (_, i) => ({ no: i + 1, stage: flowOf(db, dossierId, i + 1).stage }));
    if (sheets.some((s) => flowOf(db, dossierId, s.no).pending)) throw reasonApiError("INVALID_STATE", "DECLARE_ALL_PENDING");
    const waiting = sheets.find((s) => awaitingContent(s.stage));
    if (waiting) {
      const blocked = sheets.find((s) => s.no > waiting.no && declareOpFor(s.stage, c.dossier.direction));
      if (blocked) throw reasonApiError("INVALID_STATE", "SHEET_ORDER_DECLARE", { sheet: blocked.no, waitFor: waiting.no });
      throw reasonApiError("INVALID_STATE", "DECLARE_ALL_NOT_PRE_DECLARED", { sheet: waiting.no });
    }
    const target = sheets.find((s) => declareOpFor(s.stage, c.dossier.direction));
    if (!target) throw reasonApiError("INVALID_STATE", "DECLARE_ALL_NONE");
    const unconfirmed = c.items.filter((i) => !i.hsConfirmed).length;
    if (unconfirmed) throw reasonApiError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n: unconfirmed });
    return perform(db, dossierId, declareOpFor(target.stage, c.dossier.direction)!, Date.now(), target.no, "declare");
  });
