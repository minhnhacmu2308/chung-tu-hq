// Luật R-FREIGHT-TERM trong mock: điều kiện giao hàng ↔ người trả cước trên vận đơn (Freight Prepaid / Collect).
// Phân loại dùng chung @kb/contracts freightTermFit (cùng backend packages/core validation/rules/freight-term.ts); câu chữ giữ như backend.
import { FREIGHT_TERM_REASON_LABELS, freightTermFit, incotermOf, type CrossCheck, type FreightTermNote } from "@kb/contracts";

/** Phần dữ liệu mock luật cần – không import MockDb (db.ts gọi luật này khi dựng seed, tránh vòng phụ thuộc). */
type Db = {
  dossiers: { id: string; incoterm: string }[];
  documents: { id: string; dossierId: string }[];
  fields: { documentId: string; key: string; value: string }[];
  checks: CrossCheck[];
  valueCharges: Record<string, { data: { freightTermNote?: FreightTermNote | null | undefined } }>;
};

const RULE = "R-FREIGHT-TERM";
const TITLE = "Điều kiện giao hàng khớp người trả cước trên vận đơn";
const TERM_LABEL = { PREPAID: "Freight Prepaid (người gửi trả cước)", COLLECT: "Freight Collect (người nhận trả cước)" } as const;

/** "FREIGHT COLLECT" / "Freight Prepaid" (ô Điều kiện cước của vận đơn) → mã; không đọc được → null. */
export function parseFreightTerm(value: string | null | undefined): "PREPAID" | "COLLECT" | null {
  const v = (value ?? "").toUpperCase();
  return v.includes("COLLECT") ? "COLLECT" : v.includes("PREPAID") ? "PREPAID" : null;
}

/** Người trả cước theo ô Điều kiện cước trên vận đơn của hồ sơ. */
export function freightTermOfDossier(db: Db, dossierId: string): "PREPAID" | "COLLECT" | null {
  const docs = new Set(db.documents.filter((d) => d.dossierId === dossierId).map((d) => d.id));
  const f = db.fields.find((x) => docs.has(x.documentId) && (x.key === "freight_terms" || x.key === "freight_term"));
  return parseFreightTerm(f?.value);
}

/** Kết quả luật (chưa gắn id); không xác định được điều kiện giao hàng / người trả cước → null (backend: SKIPPED). */
export function freightTermCheck(incoterm: string, term: "PREPAID" | "COLLECT" | null, note: FreightTermNote | null | undefined): Omit<CrossCheck, "id" | "dossierId"> | null {
  const code = incotermOf(incoterm);
  if (!code || !term) return null;
  const fit = freightTermFit(code, term);
  const label = TERM_LABEL[term];
  const base = { ruleCode: RULE, title: TITLE, severity: "BLOCKER" as const, documentKinds: ["INVOICE" as const, "BILL_OF_LADING" as const] };
  if (fit === "CONFLICT") {
    return note
      ? { ...base, result: "WARN", detail: `${code} (người bán trả cước) nhưng vận đơn ghi ${label} – người khai giải trình “${FREIGHT_TERM_REASON_LABELS[note.reason]}${note.note ? `: ${note.note}` : ""}”` }
      : { ...base, result: "FAIL", detail: `${code}: giá đã gồm cước (người bán trả) nhưng vận đơn ghi ${label} – sửa điều kiện giao hàng cho đúng hóa đơn, khai cước, hoặc ghi lý do ở “Chi phí và điều chỉnh trị giá”` };
  }
  if (fit === "CHECK") return { ...base, result: "WARN", detail: `${code}: người mua trả cước nhưng vận đơn ghi ${label} – người bán trả hộ thì vẫn phải khai cước theo điều kiện giao hàng` };
  if (fit === "OK") return { ...base, result: "PASS", detail: `${code} khớp vận đơn ${label}` };
  return null;
}

/** Tính lại luật sau khi đổi điều kiện giao hàng / người trả cước / lưu giải trình (backend chạy lại toàn bộ luật). */
export function syncFreightTermCheck(db: Db, dossierId: string) {
  const d = db.dossiers.find((x) => x.id === dossierId);
  if (!d) return;
  db.checks = db.checks.filter((c) => !(c.dossierId === dossierId && c.ruleCode === RULE));
  const c = freightTermCheck(d.incoterm, freightTermOfDossier(db, dossierId), db.valueCharges[dossierId]?.data.freightTermNote);
  if (c) db.checks.push({ ...c, id: `chk_${dossierId}_freight_term`, dossierId });
}
