// Trường của skill (key snake_case do người dùng cấu hình) ↔ key trong kết quả trích xuất (schema @kb/contracts, camelCase).
// Dùng khi đọc mẫu (kết quả AI → expected theo key skill) để gắn nhãn và đo độ chính xác. Thuần.
import type { SkillField } from "@kb/contracts";

/** Key skill không suy ra được bằng snake→camel. */
const OVERRIDES: Record<string, string> = {
  bl_no: "billNo", hbl_no: "billNo", pol: "portOfLoading", pod: "portOfDischarge", onboard_date: "date", notify: "notifyParty",
  gross_weight: "grossWeightKg", net_weight: "netWeightKg", measurement: "volumeCbm", invoice_ref: "invoiceNo", pl_no: "invoiceNo",
  mawb_no: "awbNo", chargeable_weight: "chargeableWeightKg", co_date: "issueDate", einvoice_no: "invoiceNo", total_vnd: "totalAmount",
  freight_amount: "totalAmount", invoice_date: "invoiceDate", total_amount: "totalAmount", hs_codes: "items",
};

export const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Key trong kết quả trích xuất ứng với một trường skill. */
export function schemaKeyFor(fieldKey: string): string {
  return OVERRIDES[fieldKey] ?? toCamel(fieldKey);
}

/** Chiếu kết quả AI sang bản ghi theo key trường skill (chỉ trường extract=true; thiếu → null). */
export function projectResult(fields: SkillField[], result: unknown): Record<string, unknown> {
  const src = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of fields.filter((x) => x.extract)) {
    const v = src[f.key] ?? src[schemaKeyFor(f.key)];
    out[f.key] = v === undefined ? null : v;
  }
  return out;
}

/** Gợi ý cho prompt: nhãn + alias từng trường cần đọc. */
export function fieldHints(fields: SkillField[]): string[] {
  return fields.filter((f) => f.extract).map((f) => (f.aliases.length ? `${f.label} (${schemaKeyFor(f.key)}): nhãn thường gặp ${f.aliases.join(" | ")}` : `${f.label} (${schemaKeyFor(f.key)})`));
}
