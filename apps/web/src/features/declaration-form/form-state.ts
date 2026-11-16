// Logic thuần của chỉ tiêu tờ khai: ô nào đang áp dụng (theo tình huống), ô bắt buộc còn thiếu, kiểu ô lựa chọn.
import { conditionContext, fieldRole, groupMissing, isApplicable, missingRequired, type LayoutField } from "@kb/contracts";

type Kind = "IDA" | "EDA";
export type FormValues = Record<string, string>;

// Điều kiện áp dụng và ô bắt buộc còn thiếu: quy tắc chung ở @kb/contracts (required.ts) – backend chặn duyệt/khai bằng cùng quy tắc.
export { conditionContext, groupMissing, isApplicable, missingRequired };

/** Ô lựa chọn: bắt buộc → radio (luôn có một giá trị); không bắt buộc → checkbox chọn một, bấm lại để bỏ chọn. */
export const choiceControl = (kind: Kind, f: LayoutField, parentNo?: string): "radio" | "checkbox" => (fieldRole(kind, f, parentNo) === "REQUIRED" ? "radio" : "checkbox");

/** Bấm một checkbox của ô lựa chọn: ô đang chọn → bỏ chọn; ô khác → chọn ô đó (bỏ ô cũ). */
export const toggleChoice = (current: string, value: string) => (current === value ? "" : value);
