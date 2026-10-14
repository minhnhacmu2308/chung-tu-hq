import type { DocKind, RuleResult, RuleSeverity, Shipment, Sourced } from "@kb/contracts";
import { Decimal, dec } from "../../../shared/decimal.js";

export type RuleOutcome = { result: RuleResult; detail: string; fields: string[] };
export type RuleContext = { org: { taxCode: string; name: string } };
export type Rule = { code: string; title: string; severity: RuleSeverity; docKinds: DocKind[]; run(s: Shipment, ctx: RuleContext): RuleOutcome };

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
