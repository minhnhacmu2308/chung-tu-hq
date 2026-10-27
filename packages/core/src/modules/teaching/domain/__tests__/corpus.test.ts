import { describe, expect, it } from "vitest";
import type { CustomsDeclarationExtraction } from "@kb/contracts";
import { compareFields, type DocData } from "../compare.js";
import { corpusMarkdown, sourceStats, type CorpusLot } from "../corpus.js";

const real = (kho: string, freight: string) => ({ KHO: kho, KHO_TEN: null, PHI_VC: freight, items: [], uncertainties: [] }) as unknown as CustomsDeclarationExtraction;
const lot = (name: string, kho: string, docs: DocData[]): CorpusLot => {
  const r = real(kho, "A - VND - 2.188.485");
  const draft = [{ code: "KHO", label: "Kho", value: "", source: "DOSSIER" }, { code: "PHI_VC", label: "Phí vận chuyển", value: "2188485 VND", source: "FREIGHT_INVOICE" }];
  return { lot: name, mode: "AIR", fields: compareFields(draft, r, docs), lines: [], real: r, docs };
};

describe("báo cáo kho dữ liệu: chỉ tiêu lấy từ đâu", () => {
  const fi: DocData = { kind: "FREIGHT_INVOICE", data: { services: [{ amount: 2188485 }] } };
  const lots = [lot("L1", "02DSEA0", [fi]), lot("L2", "02DSEA0", [fi]), lot("L3", "02B1A04", [fi, { kind: "ARRIVAL_NOTICE", data: { warehouseCode: "02B1A04" } }])];
  it("thống kê khớp / có trên chứng từ nào / không có trên chứng từ, theo phương thức", () => {
    const s = sourceStats(lots);
    const kho = s.find((x) => x.code === "KHO")!;
    expect(kho).toMatchObject({ mode: "AIR", lots: 3, matched: 0, notOnDocuments: 2, foundIn: { ARRIVAL_NOTICE: 1 } });
    expect(s.find((x) => x.code === "PHI_VC")).toMatchObject({ lots: 3, matched: 3, foundIn: { FREIGHT_INVOICE: 3 } });
    expect(s[0]?.code).toBe("KHO"); // kém nhất lên đầu
  });
  it("rules.md: bảng theo chỉ tiêu, % và ví dụ lệch", () => {
    const md = corpusMarkdown({ generatedAt: new Date("2026-10-27T00:00:00Z"), lots });
    expect(md).toContain("| Kho (KHO) | AIR | 3 | 0% | ARRIVAL_NOTICE 33% | 67% | (trống) → 02DSEA0");
    expect(md).toContain("| Phí vận chuyển (PHI_VC) | AIR | 3 | 100% | FREIGHT_INVOICE 100% | 0% |");
  });
});
