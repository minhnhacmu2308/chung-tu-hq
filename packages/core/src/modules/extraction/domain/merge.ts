// Gộp kết quả đọc của mọi chứng từ → Shipment có nguồn và trạng thái từng trường (ADR 0003). Hàm thuần.
import { emptyShipment, type DocKind, type Region, type Shipment, type ShipmentItem, type SourceRef, type Sourced } from "@kb/contracts";
import { fieldStatusFromCandidates, type Candidate } from "./field-status.js";
import { ITEM_SPECS, SHIPMENT_FIELDS, type FieldSpec } from "./shipment-spec.js";

export type FileExtraction = {
  documentId: string;
  kind: DocKind;
  pages: number;
  /** Dữ liệu model trả về (đã parse Zod theo schema loại). */
  data: Record<string, unknown>;
  /** Vị trí từng trường nếu model trả (key theo tên trường trong schema). */
  regions?: Record<string, Region>;
};

export type MergeOptions = { version: number; taxCodeValid?: (t: string) => boolean };

const uncertain = (d: Record<string, unknown>, key: string | undefined) => Array.isArray(d["uncertainties"]) && key !== undefined && (d["uncertainties"] as unknown[]).includes(key);

/** Tính một trường Sourced từ spec: duyệt nguồn theo ưu tiên, chuẩn hóa, lấy trạng thái. */
export function mergeField(spec: FieldSpec, files: FileExtraction[]): Sourced<string> {
  const cands: Candidate[] = [];
  const sources: SourceRef[] = [];
  for (const src of spec.sources) {
    for (const f of files.filter((x) => x.kind === src.kind)) {
      const rawVal = src.get(f.data);
      if (rawVal === null || rawVal === undefined || rawVal === "") continue;
      const normalized = spec.normalize(rawVal);
      if (normalized === null) continue;
      const raw = typeof rawVal === "string" ? rawVal : String(rawVal);
      cands.push({ kind: f.kind, normalized, raw, unsure: uncertain(f.data, src.regionKey) });
      const region = src.regionKey ? f.regions?.[src.regionKey] : undefined;
      sources.push({ documentId: f.documentId, kind: f.kind, page: region?.page ?? 1, raw, normalized, ...(region ? { region } : {}) });
    }
  }
  if (!cands.length) return { value: null, sources: [], status: "SINGLE_SOURCE" };
  const first = cands[0]!;
  const formatValid = spec.valid ? spec.valid(first.normalized) : true;
  const { status, note } = fieldStatusFromCandidates(cands, formatValid);
  return { value: first.normalized, sources, status, ...(note ? { note } : {}) };
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split("/").filter(Boolean);
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = cur[p] as Record<string, unknown>;
  cur[parts[parts.length - 1]!] = value;
}

function mergeItems(files: FileExtraction[]): ShipmentItem[] {
  const inv = files.find((f) => f.kind === "INVOICE") ?? files.find((f) => f.kind === "PACKING_LIST");
  if (!inv) return [];
  const items = (inv.data["items"] as Record<string, unknown>[] | undefined) ?? [];
  return items.map((it, i) => {
    const lineNo = typeof it["lineNo"] === "number" ? (it["lineNo"] as number) : i + 1;
    const out = { lineNo } as ShipmentItem;
    for (const spec of ITEM_SPECS) {
      const rawVal = spec.get(it);
      const normalized = rawVal === null || rawVal === undefined ? null : spec.normalize(rawVal);
      const region = inv.regions?.[`items.${i}.${spec.field}`];
      const sources: SourceRef[] = normalized !== null ? [{ documentId: inv.documentId, kind: inv.kind, page: region?.page ?? 1, raw: String(rawVal), normalized, ...(region ? { region } : {}) }] : [];
      const unsure = uncertain(inv.data, `items.${i}.${spec.field}`);
      (out as unknown as Record<string, Sourced<string>>)[spec.field] = { value: normalized, sources, status: normalized === null ? "SINGLE_SOURCE" : unsure ? "MODEL_UNSURE" : "SINGLE_SOURCE" };
    }
    return out;
  });
}

function mergeCharges(files: FileExtraction[], s: Shipment) {
  const other: Shipment["charges"]["other"] = [];
  const freight: Candidate[] = [];
  const insurance: Candidate[] = [];
  const freightCur: Candidate[] = [];
  const insuranceCur: Candidate[] = [];
  const freightSources: SourceRef[] = [];
  const insuranceSources: SourceRef[] = [];
  for (const f of files) {
    const list = f.kind === "FREIGHT_INVOICE" ? (f.data["services"] as Record<string, unknown>[] | undefined) : f.kind === "ARRIVAL_NOTICE" ? (f.data["charges"] as Record<string, unknown>[] | undefined) : undefined;
    if (!list) continue;
    const cur = (f.data["currency"] as string | null) ?? "VND";
    for (const c of list) {
      const label = String(c["label"] ?? "");
      const amount = c["amount"] === null || c["amount"] === undefined ? null : String(c["amount"]);
      if (amount === null || !/^-?\d+(\.\d+)?$/.test(amount)) continue;
      const currency = String(c["currency"] ?? cur).toUpperCase();
      const ref: SourceRef = { documentId: f.documentId, kind: f.kind, page: 1, raw: `${label} ${amount} ${currency}`, normalized: amount };
      if (/cước|freight|vận chuyển|ocean|air\s*freight/i.test(label)) {
        freight.push({ kind: f.kind, normalized: amount, raw: ref.raw, unsure: false });
        freightCur.push({ kind: f.kind, normalized: currency, raw: ref.raw, unsure: false });
        freightSources.push(ref);
      } else if (/bảo hiểm|insurance/i.test(label)) {
        insurance.push({ kind: f.kind, normalized: amount, raw: ref.raw, unsure: false });
        insuranceCur.push({ kind: f.kind, normalized: currency, raw: ref.raw, unsure: false });
        insuranceSources.push(ref);
      } else other.push({ label, amount, currency, sourceKind: f.kind });
    }
  }
  const pick = (c: Candidate[], src: SourceRef[]): Sourced<string> => (c.length ? { value: c[0]!.normalized, sources: src, ...fieldStatusFromCandidates(c, true) } : { value: null, sources: [], status: "SINGLE_SOURCE" });
  s.charges = { freight: pick(freight, freightSources), freightCurrency: pick(freightCur, freightSources), insurance: pick(insurance, insuranceSources), insuranceCurrency: pick(insuranceCur, insuranceSources), other };
}

/** Trường bổ sung riêng của doanh nghiệp (`data.custom`): custom[loại][key], chứng từ đầu tiên có giá trị thắng. */
function mergeCustom(files: FileExtraction[]): Shipment["custom"] {
  const out: Shipment["custom"] = {};
  for (const f of files) {
    const custom = f.data["custom"] as Record<string, unknown> | null | undefined;
    if (!custom || typeof custom !== "object") continue;
    for (const [key, raw] of Object.entries(custom)) {
      if (raw === null || raw === undefined || raw === "") continue;
      const byKind = (out[f.kind] ??= {});
      if (byKind[key]?.value) continue;
      byKind[key] = { value: String(raw), sources: [{ documentId: f.documentId, kind: f.kind, page: 1, raw: String(raw) }], status: "SINGLE_SOURCE" };
    }
  }
  return out;
}

export function mergeExtractions(files: FileExtraction[], opts: MergeOptions): Shipment {
  const s = emptyShipment();
  s.version = opts.version;
  for (const spec of SHIPMENT_FIELDS) {
    const specWithTax = spec.path === "/parties/buyer/taxCode" && opts.taxCodeValid ? { ...spec, valid: opts.taxCodeValid } : spec;
    setPath(s as unknown as Record<string, unknown>, spec.path, mergeField(specWithTax, files));
  }
  // Phương thức vận chuyển suy từ loại chứng từ vận tải.
  const bl = files.find((f) => f.kind === "BILL_OF_LADING");
  const awb = files.find((f) => f.kind === "AIR_WAYBILL");
  if (bl) s.transport.mode = { value: "SEA", sources: [{ documentId: bl.documentId, kind: "BILL_OF_LADING", page: 1, raw: "B/L" }], status: "SINGLE_SOURCE" };
  else if (awb) s.transport.mode = { value: "AIR", sources: [{ documentId: awb.documentId, kind: "AIR_WAYBILL", page: 1, raw: "AWB" }], status: "SINGLE_SOURCE" };
  s.transport.containers = ((bl?.data["containers"] as Record<string, unknown>[] | undefined) ?? [])
    .filter((c) => typeof c["no"] === "string" && c["no"])
    .map((c) => ({ no: String(c["no"]), sealNo: (c["sealNo"] as string | null) ?? null, size: (c["size"] as string | null) ?? null }));
  s.items = mergeItems(files);
  mergeCharges(files, s);
  const co = files.find((f) => f.kind === "CERT_OF_ORIGIN");
  s.origin.criteria = ((co?.data["items"] as Record<string, unknown>[] | undefined) ?? [])
    .map((i) => ({ hs6: (i["hs6"] as string | null) ?? null, criterion: (i["criterion"] as string | null) ?? null }))
    .filter((c) => c.hs6 || c.criterion);
  s.custom = mergeCustom(files);
  s.documents = files.map((f) => ({ id: f.documentId, kind: f.kind, pages: f.pages }));
  return s;
}
