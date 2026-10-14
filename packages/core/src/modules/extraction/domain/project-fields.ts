// Chiếu Shipment ra từng trường theo chứng từ cho màn OCR: mỗi (chứng từ, trường) một dòng, giá trị của chính chứng từ đó.
import type { FieldGroup, FieldStatus, Region, Shipment, Sourced } from "@kb/contracts";
import { ITEM_SPECS, SHIPMENT_FIELDS } from "./shipment-spec.js";

export type ProjectedField = {
  documentId: string;
  key: string;
  label: string;
  group: FieldGroup;
  value: string;
  status: FieldStatus;
  region?: Region;
  note?: string;
  shipmentPath: string;
};

function get(s: Shipment, path: string): Sourced<string> {
  let cur: unknown = s;
  for (const p of path.split("/").filter(Boolean)) cur = (cur as Record<string, unknown>)[p];
  return cur as Sourced<string>;
}

export function projectFields(s: Shipment): ProjectedField[] {
  const out: ProjectedField[] = [];
  for (const spec of SHIPMENT_FIELDS) {
    const field = get(s, spec.path);
    for (const src of field.sources) {
      const value = src.normalized ?? spec.normalize(src.raw) ?? src.raw;
      out.push({ documentId: src.documentId, key: spec.key, label: spec.label, group: spec.group, value, status: field.status, shipmentPath: spec.path, ...(src.region ? { region: src.region } : {}), ...(field.note ? { note: field.note } : {}) });
    }
  }
  s.items.forEach((item, i) => {
    for (const spec of ITEM_SPECS) {
      const f = item[spec.field];
      for (const src of f.sources) {
        out.push({
          documentId: src.documentId, key: `item.${item.lineNo}.${spec.key}`, label: `Dòng ${item.lineNo} – ${spec.label}`, group: "ITEMS", value: f.value ?? src.raw, status: f.status,
          shipmentPath: `/items/${i}/${spec.field}`, ...(src.region ? { region: src.region } : {}),
        });
      }
    }
  });
  return out;
}
