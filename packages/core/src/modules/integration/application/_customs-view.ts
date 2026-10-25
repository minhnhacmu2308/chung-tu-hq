import {
  CUSTOMS_OPERATIONS, dossierCustomsSummary, nextCustomsOperation, operationAvailability, operationsFor, orderedOperation, queryOpFor, reasonVi, sheetOrderWait,
  type BranchSubmission, type CustomsMessage, type CustomsOperation, type CustomsResult, type CustomsSummary, type DeclarationStatus, type PipelineRow, type SubmissionView,
} from "@kb/contracts";
import { stageOf } from "../domain/state-machine.js";
import type { MessageRow, OutboxRow, ResultRow } from "./customs-ports.js";

export const OPERATION_LABELS: Record<CustomsOperation, string> = Object.fromEntries(Object.entries(CUSTOMS_OPERATIONS).map(([op, d]) => [op, d.label])) as Record<CustomsOperation, string>;
export const CHANNEL_NOTES = {
  GREEN: "Luồng xanh – miễn kiểm tra chi tiết hồ sơ và thực tế hàng hóa",
  YELLOW: "Luồng vàng – kiểm tra chi tiết hồ sơ, miễn kiểm tra thực tế hàng hóa",
  RED: "Luồng đỏ – kiểm tra chi tiết hồ sơ và thực tế hàng hóa",
} as const;

export function toMessage(m: MessageRow): CustomsMessage {
  return { id: m.id, dossierId: m.dossierId, operation: m.operation, direction: m.direction, result: m.result, summary: m.summary, at: m.at.toISOString(), payloadPreview: JSON.stringify(m.payloadMasked, null, 2) };
}

/** Kết quả hiện tại (chỉ các phần đã có thông điệp xác nhận). */
export function toPartialResult(r: ResultRow | null): Partial<CustomsResult> | null {
  if (!r || stageOf(r) === "NOT_SENT") return null;
  return {
    dossierId: r.dossierId,
    ...(r.declarationNo ? { declarationNo: r.declarationNo } : {}),
    ...(r.channel ? { channel: r.channel, channelNote: r.channelNote ?? CHANNEL_NOTES[r.channel] } : {}),
    ...(r.customsTaxVnd ? { customsTaxVnd: r.customsTaxVnd } : {}),
    clearanceStatus: r.clearanceStatus,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type FlowContext = { direction: "NK" | "XK"; approved: boolean; hasContainers: boolean };

/** Nghiệp vụ đang chờ gửi/phản hồi (outbox PENDING). */
export const pendingOps = (outbox: OutboxRow[]) => [...new Set(outbox.filter((o) => o.status === "PENDING").map((o) => o.operation))];

export function availabilityInput(ctx: FlowContext, result: ResultRow | null, outbox: OutboxRow[]) {
  return { direction: ctx.direction, stage: stageOf(result), approved: ctx.approved, channel: result?.channel ?? null, hasContainers: ctx.hasContainers, pending: pendingOps(outbox), done: result?.raw?.done ?? [] };
}

/** Mỗi nghiệp vụ của luồng một dòng: trạng thái theo nhật ký + outbox, khả năng bấm theo giai đoạn (customs-flow). */
export function buildPipeline(ctx: FlowContext, messages: MessageRow[], outbox: OutboxRow[], result: ResultRow | null): PipelineRow[] {
  const pending = new Set(pendingOps(outbox));
  const avail = new Map(operationAvailability(availabilityInput(ctx, result, outbox)).map((a) => [a.op, a]));
  return operationsFor(ctx.direction).map((op) => {
    const a = avail.get(op)!;
    const base = { op, label: CUSTOMS_OPERATIONS[op].label, phase: CUSTOMS_OPERATIONS[op].phase, enabled: a.enabled, action: a.action, ...(a.reason ? { reason: a.reason } : {}), ...(a.reasonCode ? { reasonCode: a.reasonCode } : {}), ...(a.reasonParams ? { reasonParams: a.reasonParams } : {}) };
    const last = messages.filter((m) => m.operation === op).at(-1);
    if (!last) return { ...base, status: pending.has(op) ? "SENDING" : "NOT_SENT" };
    const awaitingReply = last.direction === "OUT" && last.result !== "ERROR";
    const status: PipelineRow["status"] = pending.has(op) || awaitingReply ? "SENDING" : last.result === "ERROR" ? "ERROR" : "OK";
    return { ...base, status, at: last.at.toISOString(), summary: last.summary };
  });
}

/**
 * Tờ đã từng gửi: có outbox, thông điệp gửi đi, hoặc đã qua giai đoạn chưa gửi. Thông điệp chỉ có chiều về (IN) trên tờ NOT_SENT –
 * lỗi "chưa khai tạm tự động" của chuỗi nối tiếp ghi trên tờ chưa gửi (process-outbox) – không tính là lần gửi.
 */
export const startedOf = (messages: MessageRow[], outbox: OutboxRow[], result: ResultRow | null) =>
  outbox.length > 0 || messages.some((m) => m.direction === "OUT") || stageOf(result) !== "NOT_SENT";

/** Dữ liệu một tờ khai nhánh (đã lọc theo nhánh): thông điệp, outbox, kết quả, ngữ cảnh luồng (đã duyệt theo tờ khai / AMA của tờ). */
export type BranchInput = { no: number; of: number; flow: FlowContext; messages: MessageRow[]; outbox: OutboxRow[]; result: ResultRow | null; polling: boolean; /** Xem BranchSubmission.sentChanges; vắng = null. */ sentChanges?: BranchSubmission["sentChanges"] };

export function toBranchSubmission(b: BranchInput): BranchSubmission {
  return {
    no: b.no, of: b.of, stage: stageOf(b.result), state: b.result?.state ?? "APPROVED",
    declarationNo: b.result?.declarationNo ?? null, channel: b.result?.channel ?? null,
    pipeline: buildPipeline(b.flow, b.messages, b.outbox, b.result),
    nextOp: nextCustomsOperation(availabilityInput(b.flow, b.result, b.outbox)),
    queryOp: queryOpFor(b.flow.direction),
    amendments: b.result?.raw?.amendments ?? 0, postAmendments: b.result?.raw?.postAmendments ?? 0,
    messages: [...b.messages].reverse().map(toMessage),
    result: toPartialResult(b.result),
    customsInfo: b.result?.raw?.customsInfo ?? null,
    rejection: b.result?.raw?.rejection ?? null,
    inProgress: b.outbox.some((o) => o.status === "PENDING") || b.polling,
    started: startedOf(b.messages, b.outbox, b.result),
    sentChanges: b.sentChanges ?? null,
  };
}

/**
 * Lô nhiều tờ: dòng gửi nội dung (IDA/IDA01/EDA/EDA01 – SHEET_ORDER) và khai chính thức (IDC/IDE/EDC/EDE – SHEET_ORDER_DECLARE) của tờ đang chờ tờ trước
 * khai tạm xong khóa lại, cùng điều kiện với performOperation (sheetOrderWait) – màn Truyền không báo bấm được rồi mới bị từ chối.
 */
export function lockPipelinesByOrder(branches: BranchSubmission[]): BranchSubmission[] {
  if (branches.length < 2) return branches;
  const stages = branches.map((b) => ({ no: b.no, stage: b.stage }));
  return branches.map((b) => {
    const waitFor = sheetOrderWait(stages, b.no);
    if (waitFor === null) return b;
    const reasonParams = { sheet: b.no, waitFor };
    return {
      ...b,
      pipeline: b.pipeline.map((r): PipelineRow => {
        const kind = orderedOperation(r.op);
        if (!r.enabled || !kind) return r;
        const reasonCode = kind === "CONTENT" ? "SHEET_ORDER" : "SHEET_ORDER_DECLARE";
        return { ...r, enabled: false, reason: reasonVi(reasonCode, reasonParams), reasonCode, reasonParams };
      }),
    };
  });
}

/** Trường cấp hồ sơ (tương thích) = tờ 1; `branches` mọi tờ theo thứ tự (phần tử đầu là tờ 1). */
export function toSubmissionView(p: { declarationStatus: DeclarationStatus; hsUnconfirmed: number; branches: BranchInput[] }): SubmissionView {
  const branches = lockPipelinesByOrder(p.branches.map(toBranchSubmission));
  const first = branches[0]!;
  const { no: _no, of: _of, state: _state, declarationNo: _dn, channel: _ch, sentChanges: _sc, ...legacy } = first;
  const s = dossierCustomsSummary(branches);
  const summary: CustomsSummary = { of: s.of, cleared: s.cleared, problems: s.problems };
  return { declarationStatus: p.declarationStatus, hsUnconfirmed: p.hsUnconfirmed, ...legacy, branches, summary };
}
