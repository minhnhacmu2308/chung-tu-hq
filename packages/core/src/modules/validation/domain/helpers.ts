import type { DocKind, RuleResult, RuleSeverity, Shipment, Sourced, TransportMode, ValueCharges } from "@kb/contracts";
import { Decimal, dec } from "../../../shared/decimal.js";

export type Direction = "NK" | "XK";
/** Thông tin hồ sơ mà luật cần biết: nhập hay xuất, mã loại hình, phương thức vận chuyển. */
export type DossierProfile = { direction: Direction; typeCode: string; transportMode: TransportMode };
export type RuleOutcome = { result: RuleResult; detail: string; fields: string[] };
/** `dossier` vắng khi chưa biết hồ sơ (luật cần nó trả SKIPPED). */
/** `charges`: chi phí người khai nhập ở bước OCR & kiểm tra (cước nhập tay / lý do chưa có số) – vắng = chỉ theo chứng từ. */
export type RuleContext = {
  org: { taxCode: string; name: string }; dossier?: DossierProfile; charges?: ValueCharges;
  /** Số tờ đã khai khi đã có tờ được Hải quan cấp số (module integration, lockedSheetCount) – vắng/0 = chưa có tờ nào có số. */
  plannedBranches?: number;
};
export type Rule = {
  code: string; title: string; severity: RuleSeverity; docKinds: DocKind[];
  /** Chỉ áp dụng cho các chiều này (vắng = cả nhập lẫn xuất). */
  directions?: Direction[];
  run(s: Shipment, ctx: RuleContext): RuleOutcome;
};

export const pass = (detail: string, fields: string[] = []): RuleOutcome => ({ result: "PASS", detail, fields });
export const warn = (detail: string, fields: string[] = []): RuleOutcome => ({ result: "WARN", detail, fields });
export const fail = (detail: string, fields: string[] = []): RuleOutcome => ({ result: "FAIL", detail, fields });
export const skipped = (detail: string): RuleOutcome => ({ result: "SKIPPED", detail, fields: [] });

/** |a−b| ≤ abs hoặc ≤ rel×max(|a|,|b|). */
export function near(a: Decimal, b: Decimal, tol: { abs?: string; rel?: string }): boolean {
  const diff = a.minus(b).abs();
  if (tol.abs && diff.lte(dec(tol.abs))) return true;
  if (tol.rel) {
    const base = Decimal.max(a.abs(), b.abs());
    if (base.gt(0) && diff.div(base).lte(dec(tol.rel))) return true;
  }
  return diff.eq(0);
}

/** Định dạng số kiểu vi-VN cho câu detail: 3860.5 → "3.860,5". */
export function fmt(v: Decimal | string, unit = ""): string {
  const d = typeof v === "string" ? dec(v) : v;
  const [int, frac] = d.toFixed().split(".");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped}${frac ? `,${frac}` : ""}${unit ? ` ${unit}` : ""}`;
}

export const val = (f: Sourced<string>) => f.value;
/** Giá trị đã chuẩn hóa của nguồn thuộc loại chứng từ (null nếu không có). */
export const valueOf = (f: Sourced<string>, kind: DocKind) => {
  const src = f.sources.find((s) => s.kind === kind);
  return src ? (src.normalized ?? src.raw) : null;
};
export const hasKind = (s: Shipment, kind: DocKind) => s.documents.some((d) => d.kind === kind);

/** Số chữ số phần nguyên: 3860.5 → 4; 0.25 → 1. */
export const intDigits = (d: Decimal) => d.abs().trunc().toFixed().length;
/** Số chữ số thập phân sau khi bỏ số 0 cuối: "12.500" → 1. */
export const decimals = (d: Decimal) => d.decimalPlaces();
/** Số ký tự (theo code point, chữ có dấu tính 1). */
export const charLen = (v: string) => [...v].length;

/** Nối tối đa `max` mục, phần còn lại ghi "+ n dòng khác". */
export function listSome(items: string[], max = 5): string {
  const head = items.slice(0, max).join("; ");
  return items.length > max ? `${head}; + ${items.length - max} dòng khác` : head;
}

/** Bên nước ngoài: NK → người bán (người xuất khẩu), XK → người mua (người nhập khẩu). */
export const foreignParty = (s: Shipment, dossier: DossierProfile) =>
  dossier.direction === "NK" ? { party: s.parties.seller, path: "/parties/seller" } : { party: s.parties.buyer, path: "/parties/buyer" };
