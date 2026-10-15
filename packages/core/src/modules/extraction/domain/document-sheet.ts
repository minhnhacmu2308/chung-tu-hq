// Bảng đọc chứng từ theo danh mục trường chuẩn (STT | Tên trường | Trị giá) – như bảng người khai lập tay cho từng chứng từ. Thuần.
import { DOC_CATALOG, type DocFieldDef, type DocKind } from "@kb/contracts";

export type SheetRow = { stt: number; key: string; label: string; value: string };

function format(def: Pick<DocFieldDef, "type">, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (def.type === "party" && typeof v === "object") {
    const p = v as Record<string, unknown>;
    return [p["name"], p["address"]].filter((x) => typeof x === "string" && x.trim()).join("\n");
  }
  if (typeof v === "boolean") return v ? "Có" : "Không";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** `data` = kết quả trích xuất của một chứng từ; `customLabels` = nhãn trường bổ sung theo skill của doanh nghiệp. */
export function buildDocumentSheet(kind: DocKind, data: Record<string, unknown>, customLabels: Record<string, string> = {}): SheetRow[] {
  const c = DOC_CATALOG[kind];
  const rows: Omit<SheetRow, "stt">[] = c.fields.map((f) => ({ key: f.key, label: f.label, value: format(f, data[f.key]) }));
  if (c.items) {
    const list = (data[c.items.key] as Record<string, unknown>[] | undefined) ?? [];
    list.forEach((item, i) => {
      for (const f of c.items!.fields) rows.push({ key: `${c.items!.key}.${i}.${f.key}`, label: `${c.items!.label} ${i + 1} – ${f.label}`, value: format(f, item?.[f.key]) });
    });
  }
  const custom = (data["custom"] && typeof data["custom"] === "object" ? data["custom"] : {}) as Record<string, unknown>;
  for (const [key, v] of Object.entries(custom)) rows.push({ key: `custom.${key}`, label: `${customLabels[key] ?? key} (bổ sung)`, value: format({ type: "text" }, v) });
  return rows.map((r, i) => ({ stt: i + 1, ...r }));
}
