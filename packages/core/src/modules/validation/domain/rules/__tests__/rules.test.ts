import { describe, expect, it } from "vitest";
import { RULES, ruleByCode } from "../index.js";
import { runAllRules } from "../../run.js";
import { anphatExport, hansol, NK_SEA, ORG, XK_SEA } from "../../test/shipments.js";

const run = (code: string, mutate: Parameters<typeof hansol>[0] = () => {}) => ruleByCode(code)!.run(hansol(mutate), { org: ORG });

const SEVERITY_ORDER = { BLOCKER: 0, WARNING: 1, INFO: 2 } as const;

describe("bộ luật", () => {
  it("đăng ký đủ 26 luật, mã duy nhất, có severity", () => {
    expect(RULES.map((r) => r.code).sort()).toEqual([
      "R-AMOUNT-SUM", "R-AWB-LENGTH", "R-BUYER-MST", "R-CONTAINER-LIST", "R-COUNTRY-CODE", "R-DATE-ORDER", "R-DESCRIPTION-LENGTH", "R-GROSS-WEIGHT-DIGITS", "R-HS-6",
      "R-INCOTERM-CODE", "R-INCOTERM-FREIGHT", "R-INSURANCE-INCOTERM", "R-INVOICE-REF", "R-LAW-MO-CU", "R-LINE-AMOUNT", "R-LINE-VALUE-DIGITS", "R-MAX-50-LINES", "R-ORIGIN-CO",
      "R-PACKAGES-INTEGER", "R-PARTY-NAME-LENGTH", "R-POD-TRANSSHIP", "R-QTY-DECIMALS", "R-QTY-PL-INV", "R-SHARED-CONTAINER", "R-WAREHOUSE-CODE", "R-WEIGHT-PL-BL",
    ]);
    expect(new Set(RULES.map((r) => r.code)).size).toBe(26);
  });
  it("thứ tự hiển thị: BLOCKER trước, rồi WARNING, INFO", () => {
    const ranks = RULES.map((r) => SEVERITY_ORDER[r.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
  it("luật chỉ áp dụng hàng nhập đánh dấu directions NK", () => {
    const nkOnly = RULES.filter((r) => r.directions?.length === 1 && r.directions[0] === "NK").map((r) => r.code).sort();
    expect(nkOnly).toEqual(["R-BUYER-MST", "R-DATE-ORDER", "R-INCOTERM-FREIGHT", "R-INSURANCE-INCOTERM", "R-LAW-MO-CU", "R-POD-TRANSSHIP"]);
  });
  it("runAllRules với hồ sơ HANSOL: không FAIL BLOCKER; mọi luật đều có detail tiếng Việt", () => {
    const out = runAllRules(hansol(), { org: ORG });
    expect(out).toHaveLength(26);
    expect(out.filter((o) => o.severity === "BLOCKER" && o.result === "FAIL")).toEqual([]);
    expect(out.every((o) => o.detail.length > 0)).toBe(true);
  });
  it("runAllRules với HANSOL + hồ sơ NK đường biển container: không FAIL BLOCKER, luật cần hồ sơ đã chạy", () => {
    const out = runAllRules(hansol(), { org: ORG, dossier: NK_SEA });
    expect(out.filter((o) => o.severity === "BLOCKER" && o.result === "FAIL")).toEqual([]);
    for (const code of ["R-GROSS-WEIGHT-DIGITS", "R-CONTAINER-LIST", "R-COUNTRY-CODE", "R-PARTY-NAME-LENGTH"]) expect(out.find((o) => o.code === code)!.result).toBe("PASS");
    expect(out.find((o) => o.code === "R-AWB-LENGTH")!.result).toBe("SKIPPED");
  });
  it("hồ sơ XK: luật chỉ áp dụng nhập trả SKIPPED 'Không áp dụng cho tờ khai xuất khẩu'", () => {
    const out = runAllRules(anphatExport(), { org: ORG, dossier: XK_SEA });
    for (const code of ["R-POD-TRANSSHIP", "R-INCOTERM-FREIGHT", "R-LAW-MO-CU", "R-BUYER-MST", "R-DATE-ORDER", "R-INSURANCE-INCOTERM"]) {
      const o = out.find((x) => x.code === code)!;
      expect(o.result).toBe("SKIPPED");
      expect(o.detail).toBe("Không áp dụng cho tờ khai xuất khẩu");
    }
    expect(out.filter((o) => o.severity === "BLOCKER" && o.result === "FAIL")).toEqual([]);
    expect(out.find((o) => o.code === "R-CONTAINER-LIST")!.result).toBe("PASS");
  });
  it("không có hồ sơ: chạy cả luật chỉ áp dụng nhập (như trước)", () => {
    const out = runAllRules(anphatExport(), { org: ORG });
    expect(out.find((o) => o.code === "R-POD-TRANSSHIP")!.result).toBe("WARN");
  });
  it("luật NK-only trên hồ sơ NK vẫn chạy bình thường", () => {
    const out = runAllRules(hansol(), { org: ORG, dossier: NK_SEA });
    expect(out.find((o) => o.code === "R-INCOTERM-FREIGHT")!.result).toBe("PASS");
  });
});

describe("R-AMOUNT-SUM (BLOCKER)", () => {
  it("PASS khi Σ dòng = tổng (sai số ≤ 0,01)", () => expect(run("R-AMOUNT-SUM").result).toBe("PASS"));
  it("FAIL khi tổng invoice khác Σ dòng, detail nêu hai số", () => {
    const r = run("R-AMOUNT-SUM", (s) => (s.invoice.totalAmount.value = "21000"));
    expect(r.result).toBe("FAIL");
    expect(r.detail).toMatch(/21.000|21000/);
    expect(r.fields).toContain("/invoice/totalAmount");
  });
  it("SKIPPED khi thiếu tổng hoặc không có dòng", () => {
    expect(run("R-AMOUNT-SUM", (s) => (s.invoice.totalAmount.value = null)).result).toBe("SKIPPED");
    expect(run("R-AMOUNT-SUM", (s) => (s.items = [])).result).toBe("SKIPPED");
  });
  it("biên: lệch đúng 0,01 vẫn PASS", () => expect(run("R-AMOUNT-SUM", (s) => (s.invoice.totalAmount.value = "20850.01")).result).toBe("PASS"));
});

describe("R-WEIGHT-PL-BL (BLOCKER)", () => {
  it("PASS khi PL ≈ B/L (0,1% hoặc 0,1 kg)", () => expect(run("R-WEIGHT-PL-BL").result).toBe("PASS"));
  it("FAIL khi lệch: PL 3860,5 vs B/L 3842", () => {
    const r = run("R-WEIGHT-PL-BL", (s) => {
      s.transport.grossWeightKg.status = "CONFLICT";
      s.transport.grossWeightKg.sources[1]!.raw = "3842";
      s.transport.grossWeightKg.sources[1]!.normalized = "3842";
    });
    expect(r.result).toBe("FAIL");
    expect(r.detail).toMatch(/3\.842/);
  });
  it("SKIPPED khi không có B/L hoặc PL", () => expect(run("R-WEIGHT-PL-BL", (s) => (s.transport.grossWeightKg.sources = s.transport.grossWeightKg.sources.filter((x) => x.kind === "PACKING_LIST"))).result).toBe("SKIPPED"));
  it("biên: lệch 2,5 kg (0,065%) PASS; đơn vị khác vẫn so theo kg đã chuẩn hóa", () => {
    expect(run("R-WEIGHT-PL-BL", (s) => (s.transport.grossWeightKg.sources[1]!.normalized = "3863")).result).toBe("PASS");
  });
});

describe("R-QTY-PL-INV (BLOCKER)", () => {
  it("PASS khi số kiện PL = B/L", () => expect(run("R-QTY-PL-INV").result).toBe("PASS"));
  it("FAIL khi lệch", () => expect(run("R-QTY-PL-INV", (s) => (s.transport.packages.sources[1]!.normalized = "50")).result).toBe("FAIL"));
  it("SKIPPED khi chỉ một nguồn", () => expect(run("R-QTY-PL-INV", (s) => (s.transport.packages.sources = s.transport.packages.sources.slice(0, 1))).result).toBe("SKIPPED"));
});

describe("R-INVOICE-REF (WARNING)", () => {
  it("PASS khi PL/C/O ghi cùng số invoice", () => expect(run("R-INVOICE-REF").result).toBe("PASS"));
  it("WARN khi C/O ghi số invoice khác", () => expect(run("R-INVOICE-REF", (s) => (s.origin.coInvoiceNo.value = "HSP-2610-0999")).result).toBe("WARN"));
  it("SKIPPED khi không có chứng từ tham chiếu", () => expect(run("R-INVOICE-REF", (s) => { s.origin.coInvoiceNo.value = null; s.invoice.no.sources = s.invoice.no.sources.slice(0, 1); }).result).toBe("SKIPPED"));
});

describe("R-INCOTERM-FREIGHT (BLOCKER)", () => {
  it("PASS: FCA có hóa đơn cước", () => expect(run("R-INCOTERM-FREIGHT").result).toBe("PASS"));
  it("FAIL: FOB không có cước", () => {
    const r = run("R-INCOTERM-FREIGHT", (s) => { s.invoice.incoterm.value = "FOB"; s.charges.freight.value = null; });
    expect(r.result).toBe("FAIL");
    expect(r.detail).toMatch(/cước/);
  });
  it("PASS: CIF không cần cước riêng", () => expect(run("R-INCOTERM-FREIGHT", (s) => { s.invoice.incoterm.value = "CIF"; s.charges.freight.value = null; }).result).toBe("PASS"));
  it("SKIPPED khi không có incoterm", () => expect(run("R-INCOTERM-FREIGHT", (s) => (s.invoice.incoterm.value = null)).result).toBe("SKIPPED"));
  it("FOB không có cước trên chứng từ: người khai nhập số → PASS; chỉ ghi lý do → WARN (không chặn)", () => {
    const fob = hansol((s) => { s.invoice.incoterm.value = "FOB"; s.charges.freight.value = null; });
    const rule = ruleByCode("R-INCOTERM-FREIGHT")!;
    const manual = rule.run(fob, { org: ORG, charges: { freight: { amount: "900", currency: "USD", reason: "FORWARDER_NOTICE", note: "" }, insurance: null, adjustments: null } });
    expect(manual).toMatchObject({ result: "PASS", detail: expect.stringMatching(/người khai nhập/) });
    const reason = rule.run(fob, { org: ORG, charges: { freight: { amount: null, currency: null, reason: "INVOICE_LATER", note: "" }, insurance: null, adjustments: null } });
    expect(reason).toMatchObject({ result: "WARN", detail: expect.stringMatching(/Hóa đơn cước bổ sung sau/) });
  });
});

describe("R-ORIGIN-CO (WARNING)", () => {
  it("PASS: C/O form AK, nước KR khớp xuất xứ dòng hàng", () => expect(run("R-ORIGIN-CO").result).toBe("PASS"));
  it("WARN: dòng hàng ghi xuất xứ CN khác C/O", () => expect(run("R-ORIGIN-CO", (s) => (s.items[0]!.origin.value = "CN")).result).toBe("WARN"));
  it("SKIPPED khi không có C/O", () => expect(run("R-ORIGIN-CO", (s) => { s.origin.coForm.value = null; s.origin.country.value = null; }).result).toBe("SKIPPED"));
});

describe("R-BUYER-MST (INFO)", () => {
  it("PASS khi MST người mua = MST doanh nghiệp (detail nhắc tên theo MST)", () => {
    const r = run("R-BUYER-MST");
    expect(r.result).toBe("PASS");
    expect(r.detail).toContain(ORG.name);
  });
  it("WARN khi MST khác", () => expect(run("R-BUYER-MST", (s) => (s.parties.buyer.taxCode.value = "0100000001")).result).toBe("WARN"));
  it("SKIPPED khi invoice không ghi MST", () => expect(run("R-BUYER-MST", (s) => (s.parties.buyer.taxCode.value = null)).result).toBe("SKIPPED"));
});

describe("R-POD-TRANSSHIP (WARNING)", () => {
  it("PASS: cảng dỡ ở Việt Nam", () => expect(run("R-POD-TRANSSHIP").result).toBe("PASS"));
  it("WARN: cảng dỡ nước ngoài (Singapore) → dùng điểm đến cuối", () => {
    const r = run("R-POD-TRANSSHIP", (s) => { s.transport.portOfDischarge.value = "SINGAPORE"; s.transport.finalDestination.value = "HAI PHONG, VIETNAM"; });
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/HAI PHONG/);
  });
  it("SKIPPED khi không có cảng dỡ", () => expect(run("R-POD-TRANSSHIP", (s) => (s.transport.portOfDischarge.value = null)).result).toBe("SKIPPED"));
});

describe("R-HS-6 (INFO)", () => {
  it("INFO PASS liệt kê số dòng có HS trên invoice (chỉ tham khảo 6 số)", () => {
    const r = run("R-HS-6");
    expect(r.result).toBe("PASS");
    expect(r.detail).toMatch(/3 dòng/);
  });
  it("SKIPPED khi không dòng nào có HS", () => expect(run("R-HS-6", (s) => s.items.forEach((i) => (i.hsOnInvoice.value = null))).result).toBe("SKIPPED"));
});

describe("R-DATE-ORDER (WARNING)", () => {
  it("PASS: invoice 02/10 ≤ hàng đến 15/10", () => expect(run("R-DATE-ORDER").result).toBe("PASS"));
  it("WARN: invoice sau ngày hàng đến", () => expect(run("R-DATE-ORDER", (s) => (s.invoice.date.value = "2026-10-20")).result).toBe("WARN"));
  it("SKIPPED thiếu ngày", () => expect(run("R-DATE-ORDER", (s) => (s.transport.arrivalDate.value = null)).result).toBe("SKIPPED"));
});

describe("luật theo công văn", () => {
  it("R-LAW-MO-CU: hàng chương 84/85 → INFO nhắc khai MO/CU (CV 2061); không có chương 84/85 → SKIPPED", () => {
    expect(run("R-LAW-MO-CU").result).toBe("WARN");
    expect(run("R-LAW-MO-CU").detail).toMatch(/^3 dòng chương 84\/85: ô 1 chỉ tiêu 1\.37 phải khai MO .* CU .*CV 2061\/TCHQ-GSQL\)$/);
    expect(run("R-LAW-MO-CU", (s) => s.items.forEach((i) => (i.hsOnInvoice.value = "6109.10.00"))).result).toBe("SKIPPED");
  });
  it("R-SHARED-CONTAINER: SKIPPED khi không có dấu hiệu chung container; WARN khi B/L ghi nhiều số vận đơn liên quan (ghi chú)", () => {
    expect(run("R-SHARED-CONTAINER").result).toBe("SKIPPED");
  });
  it("R-WAREHOUSE-CODE: SKIPPED khi chưa có mã địa điểm lưu kho (GĐ 4 điền)", () => expect(run("R-WAREHOUSE-CODE").result).toBe("SKIPPED"));
});
