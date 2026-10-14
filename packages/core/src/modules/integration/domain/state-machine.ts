// Máy trạng thái truyền tờ khai (ADR 0005): APPROVED → PRE_DECLARED (IDA/EDA ok) → DECLARED (IDC/EDC ok) → DOCS_SENT (HYS ok)
// → CLEARED | INSPECTION | REJECTED. Lỗi gửi → SEND_FAILED nhưng giữ bước (nextOperation không đổi). Thuần.
import type { CustomsOperation, SubmissionState } from "@kb/contracts";

export type SubmissionEvent =
  | { type: "PRE_DECLARE_OK" } | { type: "PRE_DECLARE_FAIL" }
  | { type: "DECLARE_OK"; channel: "GREEN" | "YELLOW" | "RED" } | { type: "DECLARE_FAIL" }
  | { type: "DOCS_OK" } | { type: "DOCS_FAIL" }
  | { type: "STATUS"; cleared: boolean; rejected?: boolean }
  | { type: "RETRY" };

/** Bước đã đạt (không tính SEND_FAILED) để biết nghiệp vụ kế tiếp. */
export type Progress = "APPROVED" | "PRE_DECLARED" | "DECLARED" | "DOCS_SENT" | "DONE";

export const TERMINAL: ReadonlySet<SubmissionState> = new Set(["CLEARED", "REJECTED"]);

/** Chuyển trạng thái; cạnh không hợp lệ → null (use case trả INVALID_STATE). `progress` = bước đã đạt trước khi lỗi. */
export function next(state: SubmissionState, progress: Progress, ev: SubmissionEvent): { state: SubmissionState; progress: Progress } | null {
  if (TERMINAL.has(state) && ev.type !== "STATUS") return null;
  switch (ev.type) {
    case "PRE_DECLARE_OK":
      return progress === "APPROVED" ? { state: "PRE_DECLARED", progress: "PRE_DECLARED" } : null;
    case "DECLARE_OK":
      return progress === "PRE_DECLARED" ? { state: "DECLARED", progress: "DECLARED" } : null;
    case "DOCS_OK":
      return progress === "DECLARED" ? { state: "DOCS_SENT", progress: "DOCS_SENT" } : null;
    case "PRE_DECLARE_FAIL":
    case "DECLARE_FAIL":
    case "DOCS_FAIL":
      return { state: "SEND_FAILED", progress };
    case "RETRY":
      return state === "SEND_FAILED" ? { state: progress === "DONE" ? "DOCS_SENT" : progress, progress } : null;
    case "STATUS":
      if (progress === "APPROVED") return null; // chưa khai thì chưa có trạng thái
      if (ev.rejected) return { state: "REJECTED", progress: "DONE" };
      if (ev.cleared) return { state: "CLEARED", progress: "DONE" };
      return state === "SEND_FAILED" ? { state, progress } : { state: progress === "DOCS_SENT" ? "INSPECTION" : state, progress };
  }
}

/** Nghiệp vụ kế tiếp cần gửi theo bước đã đạt; null khi xong. */
export function nextOperation(direction: "NK" | "XK", progress: Progress): CustomsOperation | null {
  if (progress === "APPROVED") return direction === "NK" ? "IDA" : "EDA";
  if (progress === "PRE_DECLARED") return direction === "NK" ? "IDC" : "EDC";
  if (progress === "DECLARED") return "HYS";
  return null;
}

/** Trạng thái truyền → nhóm trên màn Khai báo Hải quan. */
export function rowState(state: SubmissionState, started: boolean, pending: boolean): "READY" | "SENDING" | "INSPECTING" | "CLEARED" {
  if (!started) return "READY";
  if (state === "CLEARED") return "CLEARED";
  if (pending || state === "PRE_DECLARED" || state === "DECLARED") return "SENDING";
  return "INSPECTING";
}
