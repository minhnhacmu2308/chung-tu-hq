// Trường của skill ↔ trường chuẩn trong danh mục. Key skill có thể là key danh mục (camelCase) hoặc tên cũ snake_case;
// key không thuộc danh mục = trường bổ sung riêng của doanh nghiệp → được thêm vào schema gửi AI (object `custom`).
import { z, type ZodType } from "zod";
import type { DocKind } from "../common.js";
import type { SkillField } from "../dto/skill.js";
import { nDate, nNum, nStr } from "../extraction/common.js";
import { DOC_CATALOG } from "./documents.js";

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
