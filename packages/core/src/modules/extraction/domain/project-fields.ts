// Chiếu Shipment ra từng trường theo chứng từ cho màn OCR: mỗi (chứng từ, trường) một dòng, giá trị của chính chứng từ đó.
import type { FieldGroup, FieldStatus, Region, Shipment, Sourced } from "@kb/contracts";
import { kindLabel } from "./field-status.js";
import { containersOf, type FileExtraction } from "./merge.js";
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

/** Ô "Số container" trên tab từng chứng từ: giá trị của chính chứng từ; cùng số mà seal khác giữa hai chứng từ → CONFLICT kèm ghi chú. Chỉ đọc (sửa qua thẻ nhập tay). */
function containerFields(files: FileExtraction[]): ProjectedField[] {
  const per = files.map((f) => ({ f, list: containersOf(f) })).filter((x) => x.list.length);
  const seen = new Map<string, { doc: string; kind: FileExtraction["kind"]; seal: string | null }[]>();
  for (const { f, list } of per) for (const c of list) seen.set(c.no, [...(seen.get(c.no) ?? []), { doc: f.documentId, kind: f.kind, seal: c.sealNo }]);
  const notes = [...seen].flatMap(([no, xs]) => {
    const sealed = xs.filter((x) => x.seal);
    return new Set(sealed.map((x) => x.seal)).size > 1 ? [`${no}: ${sealed.map((x) => `${kindLabel(x.kind)} ghi seal ${x.seal}`).join("; ")}`] : [];
  });
  const status: FieldStatus = notes.length ? "CONFLICT" : [...seen.values()].some((xs) => new Set(xs.map((x) => x.doc)).size > 1) ? "CROSS_CHECKED" : "SINGLE_SOURCE";
  return per.map(({ f, list }) => ({
    documentId: f.documentId, key: "containers", label: "Số container / seal", group: "TRANSPORT", status, shipmentPath: "/transport/containers",
    value: list.map((c) => (c.sealNo ? `${c.no} / ${c.sealNo}` : c.no)).join("; "), ...(notes.length ? { note: notes.join(". ") } : {}),
  }));
}

export function projectFields(s: Shipment, files: FileExtraction[] = []): ProjectedField[] {
  const out: ProjectedField[] = [];
  for (const spec of SHIPMENT_FIELDS) {
    const field = get(s, spec.path);
    for (const src of field.sources) {
      const value = src.normalized ?? spec.normalize(src.raw) ?? src.raw;
      out.push({ documentId: src.documentId, key: spec.key, label: spec.label, group: spec.group, value, status: field.status, shipmentPath: spec.path, ...(src.region ? { region: src.region } : {}), ...(field.note ? { note: field.note } : {}) });
    }
  }
  out.push(...containerFields(files));
  s.items.forEach((item, i) => {
    for (const spec of ITEM_SPECS) {
      const f = item[spec.field];
      // Xuất xứ là chỉ tiêu bắt buộc của dòng hàng: hóa đơn không ghi thì vẫn có ô trống trên chứng từ của dòng để người khai chọn (chặn sang bước sau tới khi đủ).
      const home = spec.field === "origin" && f.sources.length === 0 ? ITEM_SPECS.map((x) => item[x.field].sources[0]?.documentId).find(Boolean) : undefined;
      if (home) out.push({ documentId: home, key: `item.${item.lineNo}.origin`, label: `Dòng ${item.lineNo} – ${spec.label}`, group: "ITEMS", value: "", status: f.status, shipmentPath: `/items/${i}/origin` });
      for (const src of f.sources) {
        out.push({
          documentId: src.documentId, key: `item.${item.lineNo}.${spec.key}`, label: `Dòng ${item.lineNo} – ${spec.label}`, group: "ITEMS", value: f.value ?? src.raw, status: f.status,
          shipmentPath: `/items/${i}/${spec.field}`, ...(src.region ? { region: src.region } : {}), ...(f.note ? { note: f.note } : {}),
        });
      }
    }
  });
  return out;
}
