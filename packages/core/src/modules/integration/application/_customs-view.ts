import {
  CUSTOMS_OPERATIONS, nextCustomsOperation, operationAvailability, operationsFor, queryOpFor,
  type CustomsMessage, type CustomsOperation, type CustomsResult, type CustomsStage, type DeclarationStatus, type PipelineRow, type SubmissionView,
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
    const base = { op, label: CUSTOMS_OPERATIONS[op].label, phase: CUSTOMS_OPERATIONS[op].phase, enabled: a.enabled, action: a.action, ...(a.reason ? { reason: a.reason } : {}) };
    const last = messages.filter((m) => m.operation === op).at(-1);
    if (!last) return { ...base, status: pending.has(op) ? "SENDING" : "NOT_SENT" };
    const awaitingReply = last.direction === "OUT" && last.result !== "ERROR";
    const status: PipelineRow["status"] = pending.has(op) || awaitingReply ? "SENDING" : last.result === "ERROR" ? "ERROR" : "OK";
    return { ...base, status, at: last.at.toISOString(), summary: last.summary };
  });
}

export function toSubmissionView(p: { declarationStatus: DeclarationStatus; hsUnconfirmed: number; flow: FlowContext; messages: MessageRow[]; outbox: OutboxRow[]; result: ResultRow | null; polling: boolean }): SubmissionView {
  const started = p.messages.length > 0 || p.outbox.length > 0;
  const inProgress = p.outbox.some((o) => o.status === "PENDING") || p.polling;
  const stage: CustomsStage = stageOf(p.result);
  return {
    declarationStatus: p.declarationStatus, hsUnconfirmed: p.hsUnconfirmed, started, inProgress, stage,
    nextOp: nextCustomsOperation(availabilityInput(p.flow, p.result, p.outbox)),
    queryOp: queryOpFor(p.flow.direction),
    amendments: p.result?.raw?.amendments ?? 0, postAmendments: p.result?.raw?.postAmendments ?? 0,
    pipeline: buildPipeline(p.flow, p.messages, p.outbox, p.result),
    messages: [...p.messages].reverse().map(toMessage),
    result: toPartialResult(p.result),
  };
}
