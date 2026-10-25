// Tờ khai nhánh (lô > 50 dòng → N tờ, spec tách tờ khai §6.5/§8) trên bước Khai báo / Sửa sau thông quan – logic thuần, test bằng vitest.
// SubmissionView: trường cấp hồ sơ = tờ 1 (tương thích), `branches` mọi tờ; JSON cũ không có `branches` → coi như lô 1 tờ.
import { awaitingContent, orderedOperation, reasonVi, sheetOrderWait, type PipelineRow } from "@kb/contracts";
import type { BranchSubmission, SubmissionView } from "@/api/customs";
import { postStepVisible } from "../../post-amendment/ama-wizard";

/** Các tờ của lô theo thứ tự; không có `branches` → một tờ dựng từ trường cấp hồ sơ. */
export function sheetsOf(s: SubmissionView): BranchSubmission[] {
  if (s.branches.length) return s.branches;
  return [{
    no: 1, of: 1, stage: s.stage, state: "APPROVED", declarationNo: s.result?.declarationNo ?? null, channel: s.result?.channel ?? null,
    pipeline: s.pipeline, nextOp: s.nextOp, queryOp: s.queryOp, amendments: s.amendments, postAmendments: s.postAmendments, messages: s.messages,
    result: s.result, customsInfo: s.customsInfo, rejection: s.rejection, inProgress: s.inProgress, started: s.started, sentChanges: null,
  }];
}

/** SubmissionView nhìn theo tờ `no`: trường cấp hồ sơ thay bằng của tờ đó (tờ 1 / lô 1 tờ → nguyên `s`). */
export function sheetView(s: SubmissionView, no: number): SubmissionView {
  const b = no === 1 ? undefined : s.branches[no - 1];
  if (!b) return s;
  return {
    ...s,
    stage: b.stage, nextOp: b.nextOp, queryOp: b.queryOp, amendments: b.amendments, postAmendments: b.postAmendments, pipeline: b.pipeline,
    messages: b.messages, result: b.result, customsInfo: b.customsInfo, rejection: b.rejection, inProgress: b.inProgress, started: b.started,
  };
}

/**
 * Tờ đang chờ tờ nào (nhãn "Chờ tờ j"), tờ không đang gửi:
 * - khai tạm nối tiếp (§6.2): tờ chưa gửi mà tờ ngay trước chưa có số tờ khai → chờ tờ đó;
 * - truyền lại sau gọi về (§6.4, tờ khai đã duyệt lại – APPROVED – hoặc lần truyền đang chạy – SUBMITTED): tờ còn chờ gửi nội dung chờ tờ trước
 *   gần nhất cũng còn chờ gửi – cùng quy tắc thứ tự tờ với backend (sheetOrderWait; tờ đã thông quan / bị từ chối không chờ). Luôn truyền theo thứ tự tờ.
 */
export function waitingOn(sheets: BranchSubmission[], no: number, declarationStatus?: string): number | null {
  const b = sheets[no - 1];
  const prev = sheets[no - 2];
  if (!b || !prev || b.pipeline.some((r) => r.status === "SENDING")) return null;
  if (b.stage === "NOT_SENT" && !prev.declarationNo) return prev.no;
  if ((declarationStatus !== "SUBMITTED" && declarationStatus !== "APPROVED") || !awaitingContent(b.stage)) return null;
  return sheetOrderWait(sheets, no);
}

/**
 * Tờ chờ khai chính thức (IDC/IDE/EDC/EDE): tờ k chỉ khai chính thức khi mọi tờ trước đã khai tạm xong (cùng sheetOrderWait với backend; không bắt tờ trước đã
 * khai chính thức). Chỉ tính khi tờ đang ở giai đoạn chờ khai chính thức và không đang gửi.
 */
export function declareWaitingOn(sheets: BranchSubmission[], no: number): number | null {
  const b = sheets[no - 1];
  if (!b || sheets.length < 2 || (b.stage !== "PRE_DECLARED" && b.stage !== "AMEND_PRE_DECLARED") || b.pipeline.some((r) => r.status === "SENDING")) return null;
  return sheetOrderWait(sheets, no);
}

/**
 * Tờ đang chờ tờ trước → nút gửi nội dung (IDA/IDA01/EDA/EDA01; `waiting`, SHEET_ORDER) và nút khai chính thức (IDC/IDE/EDC/EDE; `declareWaiting`,
 * SHEET_ORDER_DECLARE) của tờ khóa – backend cũng từ chối (truyền theo thứ tự tờ). Không chờ → giữ nguyên mảng.
 */
export function orderLocked(rows: PipelineRow[], no: number, waiting: number | null, declareWaiting: number | null = null): PipelineRow[] {
  if (waiting === null && declareWaiting === null) return rows;
  return rows.map((r) => {
    const kind = orderedOperation(r.op);
    const waitFor = kind === "CONTENT" ? waiting : kind === "DECLARE" ? declareWaiting : null;
    if (!r.enabled || waitFor === null) return r;
    const reasonCode = kind === "CONTENT" ? "SHEET_ORDER" : "SHEET_ORDER_DECLARE";
    const reasonParams = { sheet: no, waitFor };
    return { ...r, enabled: false, reason: reasonVi(reasonCode, reasonParams), reasonCode, reasonParams };
  });
}

/**
 * Tờ đã thông quan (kể cả đang sửa sau thông quan) trong lúc có tờ khác đang gọi về / gọi sửa đổi để gửi lại nội dung (R7): tờ đó không gửi lại,
 * chỉ tiêu chung lệch sửa qua khai bổ sung AMA – giao diện ghi chú. Không tờ nào đang gọi về → rỗng.
 */
export function clearedWhileResending(sheets: BranchSubmission[]): number[] {
  if (!sheets.some((b) => b.stage === "RECALLED" || b.stage === "AMEND_RECALLED")) return [];
  return sheets.filter((b) => b.stage === "CLEARED" || b.stage.startsWith("POST_")).map((b) => b.no);
}

/** Tờ bị từ chối / lỗi gửi (theo summary gộp của backend). */
export const problemOf = (s: SubmissionView, no: number) => s.summary.problems.find((p) => p.no === no)?.kind ?? null;

/** Còn tờ nào đang chờ gửi / phản hồi / hỏi trạng thái → màn tiếp tục hỏi lại. */
export const anyInProgress = (s: SubmissionView) => s.inProgress || s.branches.some((b) => b.inProgress);

/** Bước 7 hiện khi có ít nhất một tờ đã thông quan / đang sửa sau thông quan (tờ thông quan trước làm AMA ngay, không chờ tờ khác). */
export const anyPostVisible = (s: SubmissionView) => sheetsOf(s).some((b) => postStepVisible(b.stage));

/** Tờ mở ở bước 7: `?branch=` hợp lệ → tờ đó; không thì tờ đang sửa sau thông quan, rồi tờ đã thông quan đầu tiên, rồi tờ 1. */
export function postSheet(sheets: BranchSubmission[], requested: string | null): number {
  const n = Number(requested);
  if (requested && Number.isInteger(n) && n >= 1 && n <= sheets.length) return n;
  return sheets.find((b) => b.stage.startsWith("POST_"))?.no ?? sheets.find((b) => postStepVisible(b.stage))?.no ?? 1;
}

/**
 * Nút "Khai chính thức tất cả" (spec §1.2): lô nhiều tờ, không tờ nào còn chờ gửi nội dung (awaitingContent), ít nhất một tờ chờ khai chính thức
 * (PRE_DECLARED / AMEND_PRE_DECLARED) và không tờ nào đang gửi. `pending` = số tờ chờ khai chính thức.
 */
export function canDeclareAll(sheets: BranchSubmission[]): { ok: boolean; pending: number } {
  const pending = sheets.filter((b) => b.stage === "PRE_DECLARED" || b.stage === "AMEND_PRE_DECLARED").length;
  const ok = sheets.length >= 2 && pending >= 1 && !sheets.some((b) => awaitingContent(b.stage) || b.pipeline.some((r) => r.status === "SENDING"));
  return { ok, pending };
}

const RECALL_OPS: ReadonlySet<string> = new Set(["IDB", "IDD", "EDB", "EDD"]);
const RECALLED_STAGES: ReadonlySet<string> = new Set(["RECALLED", "AMEND_RECALLED"]);
const inFlight = (b: BranchSubmission) => b.pipeline.some((r) => RECALL_OPS.has(r.op) && (r.status === "WAITING" || r.status === "SENDING"));

/**
 * Tiến độ chuỗi gọi về (spec §2.2): có tờ nào đang có lệnh gọi về chờ / đang gửi (IDB/IDD/EDB/EDD) thì trả `{ done, total }`; ngược lại null.
 * done = tờ đã gọi về xong (RECALLED / AMEND_RECALLED); total = done + tờ còn có lệnh gọi về đang chạy hoặc bấm được. Xấp xỉ phía client
 * (không biết chính xác tờ nào thuộc lượt chạy).
 */
export function recallProgress(sheets: BranchSubmission[]): { done: number; total: number } | null {
  if (!sheets.some(inFlight)) return null;
  const done = sheets.filter((b) => RECALLED_STAGES.has(b.stage) && !inFlight(b)).length;
  const active = sheets.filter((b) => inFlight(b) || (!RECALLED_STAGES.has(b.stage) && b.pipeline.some((r) => RECALL_OPS.has(r.op) && r.enabled))).length;
  return { done, total: done + active };
}

/** Thông báo "đã gọi về" truyền qua `?recalled=` để còn hiện ở bước Review: "all:<số tờ>" (gọi về tất cả) hoặc danh sách tờ "2,3". */
export type RecalledNotice = { scope: "all"; count: number } | { scope: "sheets"; sheets: number[] };
export function encodeRecalled(n: RecalledNotice): string {
  return n.scope === "all" ? `all:${n.count}` : [...n.sheets].sort((a, b) => a - b).join(",");
}
export function parseRecalled(raw: string | null): RecalledNotice | null {
  if (!raw) return null;
  if (raw.startsWith("all:")) {
    const count = Number(raw.slice(4));
    return Number.isInteger(count) && count > 0 ? { scope: "all", count } : null;
  }
  const sheets = raw.split(",").map(Number);
  return sheets.every((x) => Number.isInteger(x) && x > 0) ? { scope: "sheets", sheets } : null;
}
