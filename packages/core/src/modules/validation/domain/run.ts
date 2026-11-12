import type { DocKind, Shipment } from "@kb/contracts";
import { awaitingDoc, skipped, type Rule, type RuleContext, type RuleOutcome } from "./helpers.js";
import { RULES } from "./rules/index.js";

export type RuleRun = RuleOutcome & { code: string; title: string; severity: "BLOCKER" | "WARNING" | "INFO"; docKinds: DocKind[] };

const NOT_FOR = { NK: "Không áp dụng cho tờ khai nhập khẩu", XK: "Không áp dụng cho tờ khai xuất khẩu" } as const;

/** Tên chứng từ trong lý do "chờ chứng từ sau khai". */
const AWAIT_LABEL: Partial<Record<DocKind, string>> = { BILL_OF_LADING: "vận đơn đường biển (B/L)", AIR_WAYBILL: "vận đơn hàng không (AWB)", CERT_OF_ORIGIN: "C/O" };

function runOne(r: Rule, s: Shipment, ctx: RuleContext): RuleOutcome {
  const dir = ctx.dossier?.direction;
  if (dir && r.directions && !r.directions.includes(dir)) return { result: "SKIPPED", detail: NOT_FOR[dir], fields: [] };
  const out = r.run(s, ctx);
  // ADR 0013: thiếu dữ liệu vì chứng từ còn chờ sau khai → ghi rõ lý do. Dữ liệu đã có (nhập tay, chứng từ khác) mà sai thì giữ FAIL/WARN.
  const waiting = out.result === "SKIPPED" ? (r.awaits ?? []).filter((k) => awaitingDoc(s, ctx, k)) : [];
  return waiting.length ? skipped(`Chờ chứng từ sau khai: ${waiting.map((k) => AWAIT_LABEL[k] ?? k).join(", ")} – luật chạy lại khi tải chứng từ lên`) : out;
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
