import type { CustomsMessage, CustomsOperation, CustomsResult, PipelineRow, SubmissionView } from "@kb/contracts";
import type { DeclarationStatus } from "@kb/contracts";
import type { MessageRow, OutboxRow, ResultRow } from "./customs-ports.js";

export const OPERATION_LABELS: Record<CustomsOperation, string> = {
  IDA: "Khai trước thông tin tờ khai nhập",
  IDC: "Khai chính thức – nhận phân luồng",
  EDA: "Khai trước thông tin tờ khai xuất",
  EDC: "Khai chính thức – nhận phân luồng",
  HYS: "Gửi hồ sơ chứng từ điện tử",
  IEX: "Tham chiếu trạng thái tờ khai",
};
export const CHANNEL_NOTES = {
  GREEN: "Luồng xanh – miễn kiểm tra chi tiết hồ sơ và thực tế hàng hóa",
  YELLOW: "Luồng vàng – kiểm tra chi tiết hồ sơ, miễn kiểm tra thực tế hàng hóa",
  RED: "Luồng đỏ – kiểm tra chi tiết hồ sơ và thực tế hàng hóa",
} as const;
export const opsFor = (direction: "NK" | "XK"): CustomsOperation[] => (direction === "NK" ? ["IDA", "IDC", "HYS", "IEX"] : ["EDA", "EDC", "HYS", "IEX"]);

export function toMessage(m: MessageRow): CustomsMessage {
  return { id: m.id, dossierId: m.dossierId, operation: m.operation, direction: m.direction, result: m.result, summary: m.summary, at: m.at.toISOString(), payloadPreview: JSON.stringify(m.payloadMasked, null, 2) };
}

/** Kết quả hiện tại (chỉ các phần đã có thông điệp xác nhận). */
export function toPartialResult(r: ResultRow | null): Partial<CustomsResult> | null {
  if (!r || r.state === "APPROVED") return null;
  return {
    dossierId: r.dossierId,
    ...(r.declarationNo ? { declarationNo: r.declarationNo } : {}),
    ...(r.channel ? { channel: r.channel, channelNote: r.channelNote ?? CHANNEL_NOTES[r.channel] } : {}),
    ...(r.customsTaxVnd ? { customsTaxVnd: r.customsTaxVnd } : {}),
    clearanceStatus: r.clearanceStatus,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Dựng pipeline từ nhật ký + outbox: mỗi nghiệp vụ một dòng (NOT_SENT/WAITING/SENDING/OK/ERROR). */
export function buildPipeline(direction: "NK" | "XK", messages: MessageRow[], outbox: OutboxRow[], result: ResultRow | null): PipelineRow[] {
  const ops = opsFor(direction);
  const pendingOps = new Set(outbox.filter((o) => o.status === "PENDING").map((o) => o.operation));
  const progress = result?.raw?.progress ?? "APPROVED";
  const reached: Record<CustomsOperation, boolean> = { IDA: true, EDA: true, IDC: progress !== "APPROVED", EDC: progress !== "APPROVED", HYS: progress === "DECLARED" || progress === "DOCS_SENT" || progress === "DONE", IEX: progress === "DOCS_SENT" || progress === "DONE" };
  return ops.map((op) => {
    const mine = messages.filter((m) => m.operation === op);
    const last = mine.at(-1);
    const label = OPERATION_LABELS[op];
    if (!last) return { op, label, status: pendingOps.has(op) ? "SENDING" : messages.length && reached[op] ? "WAITING" : "NOT_SENT" };
    const awaitingReply = last.direction === "OUT" && last.result !== "ERROR";
    const status: PipelineRow["status"] = pendingOps.has(op) || awaitingReply ? "SENDING" : last.result === "ERROR" ? "ERROR" : "OK";
    return { op, label, status, at: last.at.toISOString(), summary: last.summary };
  });
}

export function toSubmissionView(p: { declarationStatus: DeclarationStatus; hsUnconfirmed: number; direction: "NK" | "XK"; messages: MessageRow[]; outbox: OutboxRow[]; result: ResultRow | null; polling: boolean }): SubmissionView {
  const started = p.messages.length > 0 || p.outbox.length > 0;
  const inProgress = p.outbox.some((o) => o.status === "PENDING") || p.polling;
  return {
    declarationStatus: p.declarationStatus, hsUnconfirmed: p.hsUnconfirmed, started, inProgress,
    pipeline: buildPipeline(p.direction, p.messages, p.outbox, p.result),
    messages: [...p.messages].reverse().map(toMessage),
    result: toPartialResult(p.result),
  };
}
