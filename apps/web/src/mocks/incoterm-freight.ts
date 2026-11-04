// Luật cước theo điều kiện giao hàng trong mock – cùng quy tắc với backend (packages/core validation/rules):
// nhập khẩu R-INCOTERM-FREIGHT (EXW/FCA/FAS/FOB cộng cước), xuất khẩu R-EXPORT-FREIGHT-DEDUCT (nhóm C, D trừ cước; FOB, nhóm E/F, C&I
// và phương thức vận chuyển 9 – giao tại chỗ – không đòi cước). Tính lại khi đổi điều kiện giao hàng / lưu chi phí như backend chạy lại luật.
import { FREIGHT_REASON_LABELS, incotermIncludesFreight, incotermOf, isDomesticDelivery, type CrossCheck, type DocKind, type ManualFreight, type TransportMode } from "@kb/contracts";

/** Phần dữ liệu mock luật cần – không import MockDb (db.ts gọi luật này khi dựng seed, tránh vòng phụ thuộc). */
type Db = {
  dossiers: { id: string; incoterm: string; direction: "NK" | "XK"; transportMode: TransportMode }[];
  documents: { dossierId: string; kind: DocKind }[];
  checks: CrossCheck[];
  valueCharges: Record<string, { data: { freight: ManualFreight | null } }>;
};

const NK_RULE = "R-INCOTERM-FREIGHT";
const XK_RULE = "R-EXPORT-FREIGHT-DEDUCT";
const NK_NEEDS_FREIGHT = new Set(["EXW", "FCA", "FAS", "FOB"]);
const reasonText = (m: ManualFreight) => `${FREIGHT_REASON_LABELS[m.reason]}${m.note ? `: ${m.note}` : ""}`;

type Input = { incoterm: string; direction: "NK" | "XK"; transportMode: TransportMode; kinds: DocKind[]; manual: ManualFreight | null | undefined };

/** Kết quả luật (chưa gắn id); chưa có điều kiện giao hàng → null (backend: SKIPPED). */
export function incotermFreightCheck(i: Input): Omit<CrossCheck, "id" | "dossierId"> | null {
  const term = incotermOf(i.incoterm);
  if (!term) return null;
  const docFreight = i.kinds.includes("FREIGHT_INVOICE") || i.kinds.includes("ARRIVAL_NOTICE");
  const m = i.manual;
  if (i.direction === "NK") {
    const base = { ruleCode: NK_RULE, severity: "BLOCKER" as const, documentKinds: ["INVOICE" as const, "FREIGHT_INVOICE" as const, "ARRIVAL_NOTICE" as const] };
    if (!NK_NEEDS_FREIGHT.has(term)) return { ...base, title: `${term}: giá đã gồm cước`, detail: `${term}: giá đã gồm cước, không cần cộng thêm`, result: "PASS" };
    if (m?.amount) return { ...base, title: `${term}: đã có số cước`, detail: `${term}: cước ${m.amount} ${m.currency} người khai nhập sẽ cộng vào trị giá tính thuế`, result: "PASS" };
    if (docFreight) return { ...base, title: `${term}: đã có chứng từ cước`, detail: "Cước sẽ được cộng vào trị giá tính thuế.", result: "PASS" };
    if (m) return { ...base, title: `${term}: chưa có số cước`, detail: `${term}: chưa có số cước – người khai ghi lý do “${reasonText(m)}”. Bổ sung số cước trước khi truyền`, result: "WARN" };
    return { ...base, title: `${term}: thiếu cước vận chuyển`, detail: `Điều kiện ${term} phải cộng cước quốc tế vào trị giá – bộ chứng từ chưa có hóa đơn cước hoặc Arrival Notice.`, result: "FAIL" };
  }
  const base = { ruleCode: XK_RULE, severity: "BLOCKER" as const, documentKinds: ["INVOICE" as const, "FREIGHT_INVOICE" as const, "BILL_OF_LADING" as const] };
  if (isDomesticDelivery(i.transportMode)) return { ...base, title: `${term}: giao hàng tại chỗ`, detail: `${term} – phương thức vận chuyển 9 (giao hàng tại chỗ, trong nước): không có cước quốc tế để trừ`, result: "PASS" };
  if (!incotermIncludesFreight(term) || term === "C&I") return { ...base, title: `${term}: không trừ cước`, detail: `${term}: không phải trừ cước khỏi trị giá tính thuế xuất khẩu`, result: "PASS" };
  if (m?.amount) return { ...base, title: `${term}: đã có số cước`, detail: `${term}: cước ${m.amount} ${m.currency} người khai nhập sẽ trừ khỏi giá hóa đơn (chỉ tiêu 2.40)`, result: "PASS" };
  if (docFreight) return { ...base, title: `${term}: đã có chứng từ cước`, detail: `${term}: cước trên chứng từ sẽ trừ khỏi giá hóa đơn (chỉ tiêu 2.40)`, result: "PASS" };
  if (m) return { ...base, title: `${term}: chưa có số cước`, detail: `${term}: chưa có số cước để trừ – người khai ghi lý do “${reasonText(m)}”. Bổ sung số cước trước khi truyền`, result: "WARN" };
  return { ...base, title: `${term}: thiếu cước để trừ`, detail: `${term}: giá hóa đơn đã gồm cước quốc tế – cần số cước để trừ ra khi tính trị giá tính thuế xuất khẩu (2.40). Nhập số cước hoặc lý do ở “Chi phí và điều chỉnh trị giá”`, result: "FAIL" };
}

/** Tính lại luật cước của hồ sơ (bỏ kết quả cũ của cả hai mã – đổi chiều / điều kiện giao hàng không để sót). */
export function syncIncotermFreightCheck(db: Db, dossierId: string) {
  const d = db.dossiers.find((x) => x.id === dossierId);
  if (!d) return;
  const had = db.checks.some((c) => c.dossierId === dossierId);
  db.checks = db.checks.filter((c) => !(c.dossierId === dossierId && (c.ruleCode === NK_RULE || c.ruleCode === XK_RULE)));
  // Hồ sơ chưa đọc chứng từ (chưa có kết quả luật nào) → chưa chạy luật.
  if (!had) return;
  const kinds = db.documents.filter((x) => x.dossierId === dossierId).map((x) => x.kind);
  const c = incotermFreightCheck({ incoterm: d.incoterm, direction: d.direction, transportMode: d.transportMode, kinds, manual: db.valueCharges[dossierId]?.data.freight });
  if (c) db.checks.push({ ...c, id: `chk_${dossierId}_incoterm_freight`, dossierId });
}
