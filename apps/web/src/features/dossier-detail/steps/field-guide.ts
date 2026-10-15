// Hướng dẫn khai từng chỉ tiêu (Phụ lục II TT39/2018 sửa đổi TT121/2025) lấy từ catalog @kb/contracts – hiện khi người khai sửa chỉ tiêu.
import { CATALOG_EDA, CATALOG_IDA } from "@kb/contracts";

export type FieldGuide = { no: string; label: string; note: string; amendedBy121: boolean };

/** Chỉ tiêu `no` ("1.68", "2.29") của tờ khai IDA/EDA → hướng dẫn khai; không có số hoặc catalog chưa có hướng dẫn → null. */
export function fieldGuide(kind: "IDA" | "EDA", no: string | undefined): FieldGuide | null {
  if (!no) return null;
  const def = (kind === "IDA" ? CATALOG_IDA : CATALOG_EDA).find((d) => d.no === no);
  if (!def?.legalNote) return null;
  return { no: def.no, label: def.label, note: def.legalNote, amendedBy121: def.amendedBy121 === true };
}
