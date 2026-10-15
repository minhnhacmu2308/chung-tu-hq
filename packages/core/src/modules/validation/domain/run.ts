import type { DocKind, Shipment } from "@kb/contracts";
import type { Rule, RuleContext, RuleOutcome } from "./helpers.js";
import { RULES } from "./rules/index.js";

export type RuleRun = RuleOutcome & { code: string; title: string; severity: "BLOCKER" | "WARNING" | "INFO"; docKinds: DocKind[] };

const NOT_FOR = { NK: "Không áp dụng cho tờ khai nhập khẩu", XK: "Không áp dụng cho tờ khai xuất khẩu" } as const;

function runOne(r: Rule, s: Shipment, ctx: RuleContext): RuleOutcome {
  const dir = ctx.dossier?.direction;
  if (dir && r.directions && !r.directions.includes(dir)) return { result: "SKIPPED", detail: NOT_FOR[dir], fields: [] };
  return r.run(s, ctx);
}

/**
 * Chạy toàn bộ luật (thuần). Có hồ sơ → luật không áp dụng cho chiều nhập/xuất của hồ sơ trả SKIPPED; không có → chạy hết.
 * Luật ném lỗi lập trình → coi như SKIPPED kèm lý do để không chặn cả bộ.
 */
export function runAllRules(s: Shipment, ctx: RuleContext): RuleRun[] {
  return RULES.map((r) => {
    const meta = { code: r.code, title: r.title, severity: r.severity, docKinds: r.docKinds };
    try {
      return { ...meta, ...runOne(r, s, ctx) };
    } catch (e) {
      return { ...meta, result: "SKIPPED", detail: `Không chạy được luật: ${(e as Error).message}`, fields: [] };
    }
  });
}
