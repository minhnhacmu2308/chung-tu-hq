// Kiểm giá trị Mặc định khai báo theo catalog Phụ lục II (thuần).
import { CATALOG_EDA, CATALOG_IDA, PROFILE_FIELD_CODES } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mappingsFor } from "./mapping/registry.js";

/** "03CCS01 – Kho CFS Tân Vũ" → "03CCS01": độ dài kiểm trên phần mã (giá trị hiển thị dạng "mã – tên"). */
const codePart = (v: string) => v.split(/\s+[–-]\s+/)[0]!.trim();

export function validateProfileValues(kind: "IDA" | "EDA", values: Record<string, string>): Result<void> {
  for (const [code, raw] of Object.entries(values)) {
    if (!(PROFILE_FIELD_CODES as readonly string[]).includes(code)) return err(domainError("VALIDATION", `Không đặt mặc định cho chỉ tiêu ${code} – chỉ: ${PROFILE_FIELD_CODES.join(", ")}`));
    const value = raw.trim();
    if (!value) continue;
    const len = checkCodeLength(kind, code, value);
    if (!len.ok) return len;
  }
  return ok(undefined);
}

/** Độ dài phần mã theo catalog Phụ lục II – dùng cho cả Mặc định khai báo lẫn giá trị cố định (ghi đè). */
export function checkCodeLength(kind: "IDA" | "EDA", code: string, value: string): Result<void> {
  const catalog = kind === "IDA" ? CATALOG_IDA : CATALOG_EDA;
  const no = mappingsFor(kind).find((m) => m.code === code)?.no;
  const def = no ? catalog.find((d) => d.no === no) : undefined;
  if (def?.maxLen && codePart(value).length > def.maxLen) return err(domainError("VALIDATION", `${code} (${def.label}): mã tối đa ${def.maxLen} ký tự, nhận “${codePart(value)}”`));
  return ok(undefined);
}
