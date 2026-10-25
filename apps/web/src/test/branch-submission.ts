// Dữ liệu mẫu cho test giao diện tờ khai nhánh (lô > 50 dòng → N tờ): SubmissionView có `branches` + `summary`.
// Chỉ dùng trong test (*.test.ts / *.test.tsx).
import type { BranchSubmission, CustomsOperation, CustomsStage, PipelineRow, SubmissionView } from "@kb/contracts";

const AT = "2026-10-20T03:00:00.000Z";

/** Dòng nghiệp vụ tối thiểu: IDA, IDC (giai đoạn khai báo); `enabled` = mã được bấm. */
export function pipelineFor(stage: CustomsStage, enabled: CustomsOperation[] = []): PipelineRow[] {
  const sent = stage !== "NOT_SENT";
  const declared = stage === "DECLARED" || stage === "CLEARED" || stage.startsWith("POST_");
  return [
    { op: "IDA", label: "Khai tạm", status: sent ? "OK" : "NOT_SENT", phase: "DECLARE", enabled: enabled.includes("IDA"), action: "SEND", ...(sent ? { at: AT } : {}) },
    { op: "IDC", label: "Khai chính thức", status: declared ? "OK" : "NOT_SENT", phase: "DECLARE", enabled: enabled.includes("IDC"), action: "SEND" },
  ];
}

export function branch(no: number, of: number, stage: CustomsStage, over: Partial<BranchSubmission> = {}): BranchSubmission {
  const numbered = stage !== "NOT_SENT";
  const declarationNo = numbered ? `10762441032${no}` : null;
  return {
    no, of, stage, state: "APPROVED", declarationNo, channel: stage === "CLEARED" ? "GREEN" : null,
    pipeline: pipelineFor(stage), nextOp: null, queryOp: "IID", amendments: 0, postAmendments: 0,
    messages: numbered ? [{ id: `m${no}`, dossierId: "dos_028", operation: "IDA", direction: "IN", result: "OK", summary: `Tờ ${no}: cấp số`, at: AT, payloadPreview: "{}" }] : [],
    result: declarationNo ? { declarationNo, ...(stage === "CLEARED" ? { channel: "GREEN" as const, clearanceStatus: "CLEARED" as const } : {}) } : null,
    customsInfo: null, rejection: null, inProgress: false, started: numbered,
    ...over,
  };
}

/** SubmissionView của lô: trường cấp hồ sơ = tờ 1 (như backend), summary tự đếm. */
export function submissionOf(branches: BranchSubmission[], over: Partial<SubmissionView> = {}): SubmissionView {
  const first = branches[0]!;
  const cleared = branches.filter((b) => b.stage === "CLEARED" || b.stage.startsWith("POST_")).length;
  const problems = branches.flatMap((b): SubmissionView["summary"]["problems"] =>
    b.stage === "REJECTED" ? [{ no: b.no, kind: "REJECTED" }] : b.state === "SEND_FAILED" ? [{ no: b.no, kind: "SEND_FAILED" }] : []);
  return {
    declarationStatus: "SUBMITTED", hsUnconfirmed: 0,
    started: first.started, inProgress: first.inProgress, stage: first.stage, nextOp: first.nextOp, queryOp: first.queryOp,
    amendments: first.amendments, postAmendments: first.postAmendments, pipeline: first.pipeline, messages: first.messages,
    result: first.result, customsInfo: first.customsInfo, rejection: first.rejection,
    branches, summary: { of: branches.length, cleared, problems },
    ...over,
  };
}
