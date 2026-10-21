import { catalogFieldRole, findDeclarationFieldDef, type DeclarationFieldRole } from "../declaration/field-role.js";
import type { LayoutField } from "./types.js";

/** Số chỉ tiêu dùng để tra hướng dẫn/vai trò: số của ô, không có thì số của nhóm chứa ô. */
export const fieldGuideNo = (f: LayoutField, parentNo?: string): string | undefined => f.no ?? parentNo;

/**
 * Ô người khai nhập mà đặc tả FPT.VNACCS bắt buộc (cột Required) nhưng Phụ lục II ghi "theo tình huống"/"hỗ trợ" – thiếu thì Hải quan từ chối
 * nên coi là Bắt buộc. Ô FPT bắt buộc mà phần mềm tự điền khi truyền (đội thủ tục 00, mã bưu chính 000000, đơn vị KGM, mã tiền, số lượng (2)…)
 * không có ở đây. required.test.ts kiểm mọi ô FPT bắt buộc trên form đều thuộc một trong hai nhóm.
 * 1.15 địa chỉ người nhập khẩu (TK_IMA) KHÔNG ở đây: chỉ tiêu HT (TT39) – VNACCS tự hiện theo MST, phần mềm điền từ Tài khoản; trống không chặn duyệt.
 */
export const FPT_REQUIRED_KEYS: Record<"IDA" | "EDA", ReadonlySet<string>> = {
  IDA: new Set(["TK_CH", "TK_EPA", "VD_GW", "VD_DST", "VD_DSN", "VD_VSN", "TK_IP2", "TK_IP4", "HAG_BPR", "HAG_UPR"]),
  EDA: new Set(["TK_CH", "TK_EPT", "TK_CGA", "TK_PSC", "TK_PSN", "TK_VSN", "HAG_BPR", "HAG_UPR"]),
};

/**
 * Vai trò của ô: Hải quan trả về → CUSTOMS; ô FPT bắt buộc (FPT_REQUIRED_KEYS) → REQUIRED; còn lại theo catalog Phụ lục II;
 * không có trong catalog → REQUIRED nếu đặc tả nghiệp vụ bắt buộc, còn lại OPTIONAL.
 */
export function fieldRole(kind: "IDA" | "EDA", f: LayoutField, parentNo?: string): DeclarationFieldRole {
  if (f.origin === "CUSTOMS") return "CUSTOMS";
  if (FPT_REQUIRED_KEYS[kind].has(f.key)) return "REQUIRED";
  const def = findDeclarationFieldDef(kind, fieldGuideNo(f, parentNo));
  return def ? catalogFieldRole(def) : f.required ? "REQUIRED" : "OPTIONAL";
}
