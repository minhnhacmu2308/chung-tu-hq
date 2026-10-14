import type { Shipment } from "@kb/contracts";
import type { RuleContext, RuleOutcome } from "./helpers.js";
import { RULES } from "./rules/index.js";

export type RuleRun = RuleOutcome & { code: string; title: string; severity: "BLOCKER" | "WARNING" | "INFO"; docKinds: import("@kb/contracts").DocKind[] };

/** Chạy toàn bộ luật (thuần). Luật ném lỗi lập trình → coi như SKIPPED kèm lý do để không chặn cả bộ. */
export function runAllRules(s: Shipment, ctx: RuleContext): RuleRun[] {
  return RULES.map((r) => {
    try {
      return { code: r.code, title: r.title, severity: r.severity, docKinds: r.docKinds, ...r.run(s, ctx) };
    } catch (e) {
      return { code: r.code, title: r.title, severity: r.severity, docKinds: r.docKinds, result: "SKIPPED", detail: `Không chạy được luật: ${(e as Error).message}`, fields: [] };
    }
  });
}
