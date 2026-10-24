// Bước 6: luồng nghiệp vụ Hải quan (mock). Quy tắc bấm được / chuyển giai đoạn dùng chung với backend: @kb/contracts customs-flow.
// Mỗi nghiệp vụ gửi đi: thông điệp OUT ngay, thông điệp IN "đến" sau ~2,5 giây (màn hình chỉ thấy thông điệp có at <= bây giờ → poll).
// Khi phản hồi đã đến, settle() áp stageAfter + tác dụng phụ (số tờ khai, phân luồng, mở lại tờ khai, thông quan…).
import {
  baseOp, CUSTOMS_OPERATIONS, hasDeclarationNumber, isChanneled, isContentOperation, isRecallOperation, nextCustomsOperation,
  operationAvailability, operationsFor, queryOpFor, stageAfter,
  type CustomsRow, type CustomsStage, type OperationAvailabilityInput, type OperationResult, type PipelineRow, type PipelineStatus,
  type CustomsError, type CustomsInfo, type ResendResult, type SubmissionView,
} from "@kb/contracts";
import { computeTaxes } from "@/mocks/declaration-builder";
import { formatVnd } from "@/lib/format";
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import {
  basePayload, CHANNEL_NOTES, CHANNEL_VI, channelFor, containersFor, declarationNoFor, emptyFlow, estimatedTaxVnd, type CustomsFlow,
} from "@/mocks/customs-sim";
import type { MockDb } from "@/mocks/db";
import { assertNoGaps } from "@/mocks/required-gaps";
import { reasonApiError } from "@/mocks/reason-error";
import { amendmentDelta, applyPostOperation, createAmendment, openAmendment } from "@/mocks/post-amendment-sim";
import type { CustomsMessage, CustomsOperation, CustomsResult, Declaration, DigitalCertificate, Dossier } from "@/mocks/types";

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

type Ctx = { dossier: Dossier; decl: Declaration | undefined; flow: CustomsFlow; result: CustomsResult | undefined };

function flowOf(db: MockDb, dossierId: string): CustomsFlow {
  db.customsFlows ??= {};
  let f = db.customsFlows[dossierId];
  if (!f) {
    const r = db.customsResults.find((x) => x.dossierId === dossierId);
    f = { ...emptyFlow(), ...(r ? { stage: r.clearanceStatus === "CLEARED" ? "CLEARED" : "DECLARED" } : {}) };
    db.customsFlows[dossierId] = f;
  }
  return f;
}

/** Giai đoạn truyền của hồ sơ – API sửa chỉ tiêu dùng để chặn sửa theo giai đoạn (giống backend). */
export const customsStageOf = (db: MockDb, dossierId: string): CustomsStage => flowOf(db, dossierId).stage;

function load(db: MockDb, dossierId: string): Ctx {
  const dossier = db.dossiers.find((d) => d.id === dossierId);
  if (!dossier) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
  return {
    dossier,
    decl: db.declarations.find((d) => d.dossierId === dossierId),
    flow: flowOf(db, dossierId),
    result: db.customsResults.find((r) => r.dossierId === dossierId),
  };
}

const containersOf = (db: MockDb, d: Dossier) => containersFor(d, db.documents, db.fields);

function availabilityInput(db: MockDb, c: Ctx): OperationAvailabilityInput {
  return {
    direction: c.dossier.direction,
    stage: c.flow.stage,
    // Sau thông quan: "đã duyệt" là bản khai bổ sung AMA, không phải tờ khai gốc (tờ khai gốc giữ nguyên, khóa).
    approved: c.flow.stage.startsWith("POST_") ? openAmendment(db, c.dossier.id)?.status === "APPROVED" : c.decl?.status === "APPROVED",
    channel: isChanneled(c.flow.stage) ? (c.result?.channel ?? null) : null,
    hasContainers: containersOf(db, c.dossier).length > 0,
    pending: c.flow.pending ? [c.flow.pending.op] : [],
    done: c.flow.done,
  };
}

function message(dossierId: string, op: CustomsOperation, dir: "OUT" | "IN", result: CustomsMessage["result"], summary: string, atMs: number, payload: Record<string, unknown>): CustomsMessage {
  return { id: newId("msg"), dossierId, operation: op, direction: dir, result, summary, at: new Date(atMs).toISOString(), payloadPreview: JSON.stringify({ nghiepVu: op, ...payload }, null, 2) };
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
  const r = c.result;
  const b = baseOp(p.op);
  if (r) {
    r.updatedAt = p.doneAt;
    if (isContentOperation(p.op) && c.decl) r.customsTaxVnd = estimatedTaxVnd(c.decl);
    if (b === "IDA") {
      c.dossier.declarationNo = r.declarationNo;
      r.clearanceStatus = "WAITING";
    }
    if (b === "IDC" || b === "IDE") {
      c.dossier.channel = r.channel;
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
      Object.assign(c.dossier, { status: "CLEARED", step: "submit", updatedAt: nowIso() });
    }
  }
  if (b === "IDD") c.flow.clearAt = null;
  if (p.op === "AMA" || p.op === "AMB" || p.op === "AMC") applyPostOperation(db, c.dossier.id, p.op, p.doneAt, r?.declarationNo ?? "");
  else if (isRecallOperation(p.op)) reopen(db, c.dossier.id);
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
    message(c.dossier.id, q, "OUT", "OK", "Hỏi trạng thái tờ khai định kỳ", due - 800, { soToKhai: no, yeuCau: "Tra cứu" }),
    message(c.dossier.id, q, "IN", "OK", `Trạng thái tờ khai: ${after}`, due, { soToKhai: no, trangThai: "Thông quan" }),
  );
  c.flow.stage = "CLEARED";
  c.result.clearanceStatus = "CLEARED";
  c.result.updatedAt = new Date(due).toISOString();
  if (c.dossier.status === "SUBMITTED" || c.dossier.status === "APPROVED") Object.assign(c.dossier, { status: "CLEARED", updatedAt: nowIso() });
}

/** Áp mọi phản hồi đã đến. Gọi đầu mỗi thao tác đọc/ghi. */
function settle(db: MockDb, now: number) {
  for (const id of Object.keys(db.customsFlows ?? {})) {
    if (!db.dossiers.some((d) => d.id === id)) continue;
    const c = load(db, id);
    if (c.flow.pending && Date.parse(c.flow.pending.doneAt) <= now) apply(db, c);
    clearIfDue(db, c, now);
  }
}

/* ---------------- Gửi nghiệp vụ ---------------- */

/** Bất biến 7: nghiệp vụ gửi nội dung chỉ khi tờ khai đã duyệt và HS đủ. */
/** Bản khai bổ sung gửi được: đã duyệt, có ít nhất một dòng hàng, đủ ô bắt buộc. */
function assertAmendmentSendable(db: MockDb, c: Ctx) {
  const a = openAmendment(db, c.dossier.id);
  if (!a || a.status !== "APPROVED") throw reasonApiError("NOT_APPROVED", "AMENDMENT_NOT_APPROVED");
  if (!a.lines.length) throw new ApiError("NO_LINES", "Bản khai bổ sung chưa có dòng hàng");
  if (!a.header["TK_REC"]?.trim()) throw new ApiError("MISSING_FIELD", "Chưa nhập mã lý do khai bổ sung");
}

function assertSendable(db: MockDb, c: Ctx) {
  if (!c.decl) throw new ApiError("NOT_FOUND", "Chưa có tờ khai");
  if (c.decl.status !== "APPROVED") throw reasonApiError("NOT_APPROVED", "DECLARATION_NOT_APPROVED");
  const unconfirmed = db.lineItems.filter((i) => i.dossierId === c.dossier.id && !i.hsConfirmed).length;
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
  const tax = c.decl ? estimatedTaxVnd(c.decl) : r.customsTaxVnd;
  const amend = c.flow.amendments + 1;
  const post = c.flow.postAmendments + 1;
  const payload = { soToKhai: no };
  switch (baseOp(op)) {
    case "IDA":
      return {
        out: `Khai tạm thông tin tờ khai (${op})${c.flow.stage === "RECALLED" ? " sau khi gọi sửa" : ""}`,
        in: `${c.flow.stage === "RECALLED" ? "Hải quan tiếp nhận khai tạm lại" : "Hải quan cấp số"} tờ khai ${no} – thuế dự kiến ${formatVnd(tax)}`,
        payload: { ...basePayload(c.dossier, db.org.taxCode), soToKhai: no, thueDuKien: `${tax} VND` },
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
      const a = openAmendment(db, c.dossier.id);
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
function send(db: MockDb, c: Ctx, op: CustomsOperation, now: number) {
  if (!c.result) {
    if (!c.decl) throw new ApiError("NOT_FOUND", "Chưa có tờ khai");
    const channel = channelFor(c.dossier);
    c.result = {
      dossierId: c.dossier.id,
      declarationNo: c.dossier.declarationNo ?? declarationNoFor(c.dossier),
      channel,
      channelNote: CHANNEL_NOTES[channel],
      clearanceStatus: "WAITING",
      customsTaxVnd: estimatedTaxVnd(c.decl),
      updatedAt: new Date(now).toISOString(),
    };
    db.customsResults = db.customsResults.filter((r) => r.dossierId !== c.dossier.id).concat(c.result);
  }
  const t = texts(db, c, op, c.result.declarationNo);
  const doneAt = now + LIVE_REPLY_MS;
  const errors = rejectionErrors(c, op);
  if (errors.length) {
    // Hải quan (mô phỏng) từ chối khai tạm: nhật ký ghi lỗi, màn Review gắn lỗi vào đúng ô chỉ tiêu.
    const summary = `${CUSTOMS_OPERATIONS[op].label} bị từ chối: ${errors.map((e) => `${e.code} (${e.field}): ${e.message}`).join("; ")}`;
    db.customsMessages.push(message(c.dossier.id, op, "OUT", "OK", t.out, now, t.payload), message(c.dossier.id, op, "IN", "ERROR", summary, doneAt, { errorList: errors }));
    c.flow.pending = { op, outcome: "ERROR", doneAt: new Date(doneAt).toISOString(), errors };
    return;
  }
  db.customsMessages.push(message(c.dossier.id, op, "OUT", "OK", t.out, now, t.payload), message(c.dossier.id, op, "IN", "OK", t.in, doneAt, { ...t.payload, ketQua: "Thành công" }));
  c.flow.pending = { op, outcome: "OK", doneAt: new Date(doneAt).toISOString() };
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
    message(c.dossier.id, q, "OUT", "OK", "Tra cứu trạng thái tờ khai", now, { soToKhai: c.result.declarationNo, yeuCau: "Tra cứu" }),
    message(c.dossier.id, q, "IN", "OK", `Trạng thái tờ khai: ${text}`, now, { soToKhai: c.result.declarationNo, trangThai: text }),
  );
  return { sent: false, message: `Trạng thái tờ khai: ${text}` };
}

function perform(db: MockDb, dossierId: string, op: CustomsOperation, now: number): OperationResult {
  settle(db, now);
  const c = load(db, dossierId);
  if (op === queryOpFor(c.dossier.direction)) return answerQuery(db, c, now);
  if (CUSTOMS_OPERATIONS[op].kind === "query") throw new ApiError("INVALID_OPERATION", "Tờ khai nhập tra cứu bằng IID, tờ khai xuất bằng IEX");
  const a = operationAvailability(availabilityInput(db, c)).find((x) => x.op === op);
  if (!a) throw new ApiError("INVALID_OPERATION", `Nghiệp vụ ${op} không dùng cho tờ khai ${c.dossier.direction === "NK" ? "nhập" : "xuất"} khẩu`);
  if (!a.enabled) throw new ApiError("OPERATION_LOCKED", a.reason || "Nghiệp vụ chưa thực hiện được ở giai đoạn này", 400, { reason: a.reasonCode, params: a.reasonParams });
  if (a.action === "EDIT") throw new ApiError("NOT_APPROVED", a.reason ?? "Sửa tờ khai và phê duyệt lại trước", 400, { reason: a.reasonCode, params: a.reasonParams });
  if (a.action === "START_POST_EDIT") throw reasonApiError("POST_EDIT_REQUIRED", "START_POST_EDIT_FIRST", undefined, "Lập bản khai bổ sung ở bước 7 “Sửa sau thông quan” trước khi khai AMA");
  if (op === "AMA") assertAmendmentSendable(db, c);
  else if (isContentOperation(op)) assertSendable(db, c);
  send(db, c, op, now);
  return { sent: true, message: `Đã gửi ${op} – ${CUSTOMS_OPERATIONS[op].label.toLowerCase()}. Chờ Hải quan phản hồi.` };
}

/** Thực hiện một nghiệp vụ theo quy tắc chung (operationAvailability); bị khóa → lỗi kèm lý do. */
export const performOperation = (dossierId: string, op: CustomsOperation) => mutate((db) => perform(db, dossierId, op, Date.now()));

/** Ký số và khai tạm lần đầu (IDA/EDA). Khai chính thức (IDC/EDC) là thao tác riêng của người khai. */
export const submitDeclaration = (dossierId: string, certificateId: string) =>
  mutate((db) => {
    if (!certificateId) throw reasonApiError("NO_CERT", "CERTIFICATE_REQUIRED");
    const dossier = db.dossiers.find((d) => d.id === dossierId);
    if (!dossier) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    settle(db, Date.now());
    const c = load(db, dossierId);
    if (c.flow.stage !== "NOT_SENT" && c.flow.stage !== "RECALLED") throw new ApiError("ALREADY_SUBMITTED", "Tờ khai đã được khai tạm – không gửi trùng");
    perform(db, dossierId, dossier.direction === "NK" ? "IDA" : "EDA", Date.now());
  });

/** Bắt đầu sửa đổi sau thông quan: CLEARED → POST_EDITING, lập bản khai bổ sung AMA (tờ khai gốc không mở lại). */
export const startPostAmendment = (dossierId: string) =>
  mutate((db) => {
    settle(db, Date.now());
    const c = load(db, dossierId);
    const a = operationAvailability(availabilityInput(db, c)).find((x) => x.op === "AMA");
    if (!a || a.action !== "START_POST_EDIT" || !a.enabled) throw new ApiError("INVALID_STATE", a?.reason || "Chỉ sửa sau thông quan khi tờ khai đã thông quan", 400, { reason: a?.reasonCode, params: a?.reasonParams });
    if (!c.decl || !c.result) throw new ApiError("NOT_FOUND", "Chưa có tờ khai đã thông quan");
    // AMA là bản khai riêng: tờ khai gốc giữ nguyên (khóa), lập bản khai bổ sung điền sẵn từ tờ khai gốc + số Hải quan trả về.
    const seen = db.customsMessages.filter((m) => m.dossierId === dossierId && Date.parse(m.at) <= Date.now()).sort((a, b) => a.at.localeCompare(b.at));
    createAmendment(db, c.dossier, c.decl, customsInfoOf(db, c, c.flow.stage, seen), c.result.declarationNo);
    c.flow.stage = "POST_EDITING";
    Object.assign(c.dossier, { step: "review", updatedAt: nowIso() });
  });

/** Thông tin Hải quan trả về hiện tại của hồ sơ (bản khai bổ sung dùng làm phần "Trước"). */
export function customsInfoNow(db: MockDb, dossierId: string): CustomsInfo | null {
  const c = load(db, dossierId);
  const seen = db.customsMessages.filter((m) => m.dossierId === dossierId && Date.parse(m.at) <= Date.now()).sort((a, b) => a.at.localeCompare(b.at));
  return customsInfoOf(db, c, c.flow.stage, seen);
}

/** Chốt các phản hồi đã đến (màn hình bản khai bổ sung đọc trạng thái mới nhất). */
export const settleCustoms = (db: MockDb) => settle(db, Date.now());

/**
 * Gửi lại một nghiệp vụ bị lỗi. Nguyên tắc chống gửi trùng (ADR 0005): luôn tra cứu (IID/IEX) trước,
 * chỉ gửi lại khi Hải quan chưa ghi nhận.
 */
export const resendOperation = (dossierId: string, op: CustomsOperation) =>
  mutate((db): ResendResult => {
    const now = Date.now();
    settle(db, now);
    const c = load(db, dossierId);
    if (!c.result) throw new ApiError("NOT_FOUND", "Hồ sơ chưa truyền");
    const q = queryOpFor(c.dossier.direction);
    if (op === q) {
      const r = answerQuery(db, c, now);
      return { resent: false, message: r.message };
    }
    if (c.flow.pending) throw new ApiError("BUSY", `Đang chờ phản hồi ${c.flow.pending.op}`);
    const last = db.customsMessages.filter((m) => m.dossierId === dossierId && m.operation === op && Date.parse(m.at) <= now).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    if (last?.result !== "ERROR") throw new ApiError("NOTHING_TO_RESEND", `${op} không có lỗi cần gửi lại`);
    const no = c.result.declarationNo;
    const text = statusText(c);
    const t = texts(db, c, op, no);
    const outAt = now + 2_400;
    const doneAt = outAt + LIVE_REPLY_MS;
    db.customsMessages.push(
      message(dossierId, q, "OUT", "OK", "Tra cứu trạng thái trước khi gửi lại", now, { soToKhai: no, yeuCau: "Tra cứu" }),
      message(dossierId, q, "IN", "OK", `Chưa ghi nhận ${op} mới nhất – được phép gửi lại (trạng thái: ${text})`, now + 1_200, { soToKhai: no, trangThai: text }),
      message(dossierId, op, "OUT", "OK", `Gửi lại: ${t.out}`, outAt, { ...t.payload, lanGui: 2 }),
      message(dossierId, op, "IN", "OK", t.in, doneAt, { ...t.payload, ketQua: "Thành công" }),
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
  const items = db.lineItems.filter((i) => i.dossierId === c.dossier.id).sort((a, b) => a.lineNo - b.lineNo);
  const t = computeTaxes(c.dossier, items, c.decl.valueAdjustments);
  const nk = c.dossier.direction === "NK";
  const opAt = (ops: CustomsOperation[]) => seen.filter((m) => m.direction === "IN" && m.result === "OK" && ops.includes(m.operation)).at(0)?.at;
  const registeredAt = isChanneled(stage) ? opAt(["IDC", "EDC"]) : undefined;
  const cleared = stage === "CLEARED" || stage.startsWith("POST_");
  const clearedAt = cleared ? seen.filter((m) => m.direction === "IN").at(-1)?.at : undefined;
  const channel = isChanneled(stage) ? r.channel : undefined;
  const taxes = nk
    ? [{ code: "N", name: "Thuế nhập khẩu", amountVnd: t.importDutyVnd }, { code: "V", name: "Thuế GTGT", amountVnd: t.vatVnd }]
    : [{ name: "Thuế xuất khẩu", amountVnd: "0" }];
  const total = nk ? String(Number(t.importDutyVnd) + Number(t.vatVnd)) : "0";
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
    items: items.map((it) => {
      const tax = t.perItem.find((p) => p.itemId === it.id);
      return {
        lineNo: it.lineNo,
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

function view(db: MockDb, dossierId: string, now: number): SubmissionView {
  const c = load(db, dossierId);
  const input = availabilityInput(db, c);
  const avail = operationAvailability(input);
  const all = db.customsMessages.filter((m) => m.dossierId === dossierId).sort((a, b) => a.at.localeCompare(b.at));
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
          dossierId,
          declarationNo: r.declarationNo,
          ...(isChanneled(stage) ? { channel: r.channel, channelNote: r.channelNote } : {}),
          customsTaxVnd: r.customsTaxVnd,
          clearanceStatus: clearanceOf(stage, r),
          updatedAt: seen.at(-1)?.at ?? r.updatedAt,
        }
      : null;

  return {
    declarationStatus: c.decl?.status ?? "NOT_CREATED",
    hsUnconfirmed: db.lineItems.filter((i) => i.dossierId === dossierId && !i.hsConfirmed).length,
    started: all.length > 0,
    inProgress: Boolean(c.flow.pending) || Boolean(c.flow.clearAt) || all.some((m) => Date.parse(m.at) > now),
    stage,
    nextOp: nextCustomsOperation(input),
    queryOp: queryOpFor(c.dossier.direction),
    amendments: c.flow.amendments,
    postAmendments: c.flow.postAmendments,
    pipeline,
    messages: [...seen].reverse(),
    result,
    customsInfo: customsInfoOf(db, c, stage, seen),
    rejection: c.flow.rejection ?? null,
  };
}

export const getSubmission = (dossierId: string) =>
  mutate((db) => {
    const now = Date.now();
    settle(db, now);
    return view(db, dossierId, now);
  });

/** Danh sách tờ khai đã duyệt / đang / đã truyền cho màn "Khai báo Hải quan". */
export const listCustomsDeclarations = () =>
  mutate((db): CustomsRow[] => {
    const now = Date.now();
    settle(db, now);
    return db.declarations
      .filter((d) => d.status === "APPROVED" || d.status === "SUBMITTED" || (db.customsFlows?.[d.dossierId]?.stage ?? "NOT_SENT") !== "NOT_SENT")
      .flatMap((decl) => {
        const d = db.dossiers.find((x) => x.id === decl.dossierId);
        if (!d) return [];
        const v = view(db, d.id, now);
        const last = v.messages[0];
        const pending = v.pipeline.some((p) => p.status === "SENDING");
        const state: CustomsRow["state"] =
          v.stage === "NOT_SENT" ? (pending ? "SENDING" : "READY") : pending ? "SENDING" : v.result?.clearanceStatus === "CLEARED" ? "CLEARED" : "INSPECTING";
        return [{
          dossierId: d.id,
          dossierCode: d.code,
          direction: d.direction,
          partner: d.partner,
          typeCode: d.typeCode,
          state,
          stage: v.stage,
          updatedAt: last?.at ?? decl.approvedAt ?? d.updatedAt,
          ...(last ? { lastOperation: last.operation } : {}),
          ...(v.result?.declarationNo ? { declarationNo: v.result.declarationNo } : {}),
          ...(v.result?.channel ? { channel: v.result.channel, channelNote: CHANNEL_NOTES[v.result.channel] } : {}),
          ...(v.result?.customsTaxVnd ? { customsTaxVnd: v.result.customsTaxVnd } : {}),
        }];
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
