// Trạng thái Hải quan gộp của hồ sơ từ các tờ khai nhánh (spec tách tờ khai §6.5) – THUẦN, dùng chung backend (CLEARED khi đủ mọi tờ) và giao diện ("Thông quan k/N").
import type { CustomsStage } from "./customs-flow.js";
import type { SubmissionState } from "./api/customs.js";

export type DossierCustomsSummary = {
  of: number;
  cleared: number;
  /** Tờ bị từ chối / lỗi gửi (số tờ theo thứ tự nhánh, từ 1). */
  problems: { no: number; kind: "REJECTED" | "SEND_FAILED" }[];
  allCleared: boolean;
};

/** Đã thông quan: kể cả đang sửa đổi sau thông quan (AMA – tờ khai gốc vẫn thông quan). */
const CLEARED_STAGES: ReadonlySet<CustomsStage> = new Set(["CLEARED", "POST_EDITING", "POST_PRE_DECLARED", "POST_RECALLED"]);

/** `branches` theo thứ tự nhánh (phần tử i = tờ i+1). Không có nhánh → chưa xong. */
export function dossierCustomsSummary(branches: { stage: CustomsStage; state: SubmissionState }[]): DossierCustomsSummary {
  const cleared = branches.filter((b) => CLEARED_STAGES.has(b.stage)).length;
  const problems = branches.flatMap((b, i): DossierCustomsSummary["problems"] =>
    b.stage === "REJECTED" ? [{ no: i + 1, kind: "REJECTED" }] : b.state === "SEND_FAILED" ? [{ no: i + 1, kind: "SEND_FAILED" }] : []);
  return { of: branches.length, cleared, problems, allCleared: branches.length > 0 && cleared === branches.length };
}
