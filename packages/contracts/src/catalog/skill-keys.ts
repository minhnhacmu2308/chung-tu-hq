// Trường của skill ↔ trường chuẩn trong danh mục. Key skill có thể là key danh mục (camelCase) hoặc tên cũ snake_case;
// key không thuộc danh mục = trường bổ sung riêng của doanh nghiệp → được thêm vào schema gửi AI (object `custom`).
import { z, type ZodType } from "zod";
import type { DocKind } from "../common.js";
import type { SkillField } from "../dto/skill.js";
import { nDate, nNum, nStr } from "../extraction/common.js";
import { DOC_CATALOG } from "./documents.js";
import type { DocFieldType } from "./types.js";

/** Tên cũ của skill mẫu không suy ra được bằng snake→camel. */
const LEGACY: Record<string, string> = {
  bl_no: "billNo", hbl_no: "billNo", pol: "portOfLoading", pod: "portOfDischarge", onboard_date: "date", notify: "notifyParty",
  gross_weight: "grossWeightKg", net_weight: "netWeightKg", measurement: "volumeCbm", invoice_ref: "invoiceNo", pl_no: "invoiceNo",
  mawb_no: "awbNo", chargeable_weight: "chargeableWeightKg", co_date: "issueDate", einvoice_no: "invoiceNo", total_vnd: "totalAmount",
  freight_amount: "totalAmount", invoice_date: "invoiceDate", total_amount: "totalAmount", hs_codes: "items",
  airport_departure: "airportOfDeparture", airport_destination: "airportOfDestination", warehouse: "warehouseName", hawb_no: "hawbNo", mbl_no: "masterBillNo",
};

const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export type CustomFieldDef = { key: string; label: string; aliases: string[]; type: "text" | "number" | "date" };

/** Key skill → key danh mục (`standard`) hoặc giữ nguyên làm trường bổ sung. */
export function resolveSkillFieldKey(kind: DocKind, key: string): { key: string; standard: boolean } {
  const c = DOC_CATALOG[kind];
  const known = new Set([...c.fields.map((f) => f.key), ...(c.items ? [c.items.key] : [])]);
  for (const k of [key, LEGACY[key], toCamel(key)]) if (k && known.has(k)) return { key: k, standard: true };
  return { key, standard: false };
}

/** Trường bổ sung riêng (đang bật đọc) của một skill. */
export function customFieldsOf(kind: DocKind, fields: SkillField[]): CustomFieldDef[] {
  return fields
    .filter((f) => f.extract && !resolveSkillFieldKey(kind, f.key).standard)
    .map((f) => ({ key: f.key, label: f.label, aliases: f.aliases, type: f.type === "decimal" ? "number" : f.type === "date" ? "date" : "text" }));
}

/** Schema trích xuất + object `custom` cho trường bổ sung. Không có trường bổ sung → trả nguyên schema. */
export function withCustomFields(schema: ZodType, defs: CustomFieldDef[]): ZodType {
  if (!defs.length || !(schema instanceof z.ZodObject)) return schema;
  const describe = (d: CustomFieldDef) => (d.aliases.length ? `${d.label} – nhãn thường gặp: ${d.aliases.join(" | ")}` : d.label);
  const shape = Object.fromEntries(defs.map((d) => [d.key, d.type === "number" ? nNum(describe(d)) : d.type === "date" ? nDate(describe(d)) : nStr(describe(d))]));
  return schema.extend({ custom: z.object(shape).describe("Trường bổ sung riêng của doanh nghiệp") });
}

// ---- Tạo skill mới cho doanh nghiệp ----

const FIELD_TYPE_FROM_CATALOG: Record<DocFieldType, SkillField["type"]> = { text: "string", number: "decimal", date: "date", code: "code", party: "party", boolean: "string" };

/**
 * Trường mặc định của skill mới = trường chuẩn trong danh mục của loại chứng từ (+ danh sách lặp nếu có).
 * Không bắt buộc trường nào (bắt buộc thì không tắt Đọc được) – doanh nghiệp tự chỉnh sau khi tạo.
 */
export function catalogSkillFields(kind: DocKind): SkillField[] {
  const c = DOC_CATALOG[kind];
  const head = c.fields.map((d): SkillField => ({ key: d.key, label: d.label, type: FIELD_TYPE_FROM_CATALOG[d.type], required: false, aliases: [...d.aliases], extract: true, display: true }));
  const items: SkillField[] = c.items ? [{ key: c.items.key, label: c.items.label, type: "items", required: false, aliases: [], extract: true, display: true }] : [];
  return [...head, ...items];
}

/** Tiền tố mã skill theo loại chứng từ (khớp mã skill mẫu: SK-INV-GEN, SK-PL-GEN, SK-CO-E…). */
export const SKILL_CODE_PREFIX: Record<DocKind, string> = {
  INVOICE: "INV", PACKING_LIST: "PL", BILL_OF_LADING: "BL", AIR_WAYBILL: "AWB", CERT_OF_ORIGIN: "CO",
  SALES_CONTRACT: "SC", ARRIVAL_NOTICE: "AN", FREIGHT_INVOICE: "FRT", OTHER: "DOC",
};

/** Mã tự sinh khi người dùng không nhập: SK-INV-2, SK-INV-3… – số nhỏ nhất chưa dùng trong org. */
export function nextSkillCode(kind: DocKind, existingCodes: Iterable<string>): string {
  const used = new Set(existingCodes);
  for (let n = 2; ; n++) {
    const code = `SK-${SKILL_CODE_PREFIX[kind]}-${n}`;
    if (!used.has(code)) return code;
  }
}
