import { catalogFieldRole, findDeclarationFieldDef, type DeclarationFieldRole } from "../declaration/field-role.js";
import type { LayoutField } from "./types.js";

/** Số chỉ tiêu dùng để tra hướng dẫn/vai trò: số của ô, không có thì số của nhóm chứa ô. */
export const fieldGuideNo = (f: LayoutField, parentNo?: string): string | undefined => f.no ?? parentNo;

/** Vai trò của ô: Hải quan trả về → CUSTOMS; còn lại theo catalog Phụ lục II; không có số chỉ tiêu → OPTIONAL. */
export function fieldRole(kind: "IDA" | "EDA", f: LayoutField, parentNo?: string): DeclarationFieldRole {
  if (f.origin === "CUSTOMS") return "CUSTOMS";
  const def = findDeclarationFieldDef(kind, fieldGuideNo(f, parentNo));
  return def ? catalogFieldRole(def) : "OPTIONAL";
}
