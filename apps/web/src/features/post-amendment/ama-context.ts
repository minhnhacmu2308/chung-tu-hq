// Dữ liệu chung khung bước 7 truyền xuống các bước nhỏ (file riêng để các bước nhỏ không import ngược khung – depcruise chặn vòng).
import type { PostAmendment, PostAmendmentStatus, PostAmendmentView } from "@kb/contracts";
import type { SubmissionView } from "@/api/customs";
import type { AmaSubStep } from "./ama-wizard";

export const AMA_STATUS: Record<PostAmendmentStatus, "AMA_DRAFT" | "AMA_APPROVED" | "AMA_PRE_DECLARED" | "AMA_RECALLED" | "AMA_REGISTERED"> = {
  DRAFT: "AMA_DRAFT", APPROVED: "AMA_APPROVED", PRE_DECLARED: "AMA_PRE_DECLARED", RECALLED: "AMA_RECALLED", REGISTERED: "AMA_REGISTERED",
};

/** `a` là bản đang mở, hoặc bản đã AMC mới nhất (chỉ xem). */
export type AmaStepCtx = {
  dossierId: string;
  /** Tờ khai nhánh của bản khai (lô > 50 dòng: mỗi tờ AMA riêng) / tổng số tờ; lô 1 tờ: 1/1. */
  branch: number;
  of: number;
  kind: "IDA" | "EDA";
  a: PostAmendment;
  view: PostAmendmentView;
  /** Trạng thái truyền nhìn theo tờ `branch` (stage, pipeline, thông điệp, từ chối của tờ). */
  submission: SubmissionView;
  /** Bước nhỏ đang xem sửa được không (quyền + trạng thái bản khai). */
  editable: boolean;
  canEdit: boolean;
  /** Nguyên tắc 4 mắt: người tạo hồ sơ không tự phê duyệt. */
  fourEyes: boolean;
  refresh: () => void;
  goSub: (s: AmaSubStep) => void;
};
