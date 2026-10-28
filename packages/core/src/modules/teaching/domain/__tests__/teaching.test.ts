import { describe, expect, it } from "vitest";
import type { CustomsDeclarationExtraction, CustomsDeclarationLine } from "@kb/contracts";
import { compareFields, compareLines, findInDocuments, pairLines, sameValue, score, type DocData, type DraftField, type DraftLine } from "../compare.js";
import { applyObservation, carrierOf, isAiCommentary, isAutoFill, isLotSpecific, lessonContext, lessonsForDraft, observe, splitClauses, supplierKey, type LessonRow } from "../lessons.js";
import { rulesMarkdown } from "../markdown.js";

// Lô 770471184612 (FedEx, Rise → CARA): chứng từ model đọc thật + TK 106794645160.
const docs: DocData[] = [
  { kind: "AIR_WAYBILL", data: { awbNo: "7704 7118 4612", date: "2024-12-04", pieces: 4, grossWeightKg: 13, shipper: { name: "MINHUA XU", address: "HONGQI GONGYEQU NO 591, ZHUHAI" } } },
  { kind: "CERT_OF_ORIGIN", data: { coNo: "E247079657380002", issueDate: "2024-12-04", portOfDischarge: "HO CHI MINH , VIET NAM", transportName: "FEDEX EXPRESS" } },
  { kind: "FREIGHT_INVOICE", data: { date: "2024-12-06", billRef: "770471184612", services: [{ label: "AWB 770471184612", amount: 2188485 }] } },
  { kind: "INVOICE", data: { invoiceNo: "M-240315", invoiceDate: "2024-12-04", seller: { name: "ZHUHAI RISE LIGHTING CO., LTD." }, totalAmount: 608.58 } },
];
const nul = <T extends object>(o: T) => o;
const real = nul({
  SOTK: "106794645160", NGAY_DK: "2024-12-06", MA_LH: "A11", PTVC: "1", CQHQ: "02DS", NNK_MST: "0313682576", NNK_TEN: "CARA", NXK_TEN: "ZHUHAI RISE LIGHTING CO., LTD", NXK_DC: null, MA_NUOC: "CN",
  SO_VD: "770471184612", SO_KIEN: "4 PK", TRONG_LUONG: 13, KHO: "02DSEA0", KHO_TEN: "KHO FEDEX", CANG_DO: "VNSGN", CANG_XEP: "CNZUH", PTVC_TEN: "PH8090/04DEC", NGAY_DEN: "2024-12-06",
  HD_PL: "A", SO_HD: "M-240315", NGAY_HD: "2024-12-04", PT_TT: "TTR", GIA_PL: "A", DK_GIA: "EXW", MA_TT: "USD", TONG_TG: 608.58, KHAI_TG: "6",
  CT_TG: "HĐ số: 88 - CARA/RISE (561.00 USD) & 100 - CARA/RISE (47.58 USD) - Hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN của Quyết định 2711/QĐ- BKHCN (30/12/22)",
  PHI_VC: "A - VND - 2.188.485", PHI_BH: "D", VBPQ: null, NGUOI_NT: "1", GHI_CHU: "C/O mẫu E số: E247079657380002 (04/12/2024)", SO_QLNB: null, TY_GIA: 25176, TONG_THUE: 1751010,
  items: [] as CustomsDeclarationLine[], uncertainties: [],
}) as CustomsDeclarationExtraction;
const f = (code: string, value: string, source = "INVOICE"): DraftField => ({ code, label: code, value, source });
const draft: DraftField[] = [
  f("SO_VD", "770471184612", "BILL_OF_LADING"), f("KHO", "", "DOSSIER"), f("CANG_DO", "VNSGN – Cảng Sài Gòn (TP.HCM)", "CERT_OF_ORIGIN"), f("CANG_XEP", "CNZUH – ZHUHAI"),
  f("PT_TT", "", "CONTRACT"), f("PHI_VC", "2188485 VND", "FREIGHT_INVOICE"), f("PHI_BH", "D – Không bảo hiểm", "SYSTEM"), f("TONG_TG", "608.58"), f("NGAY_DEN", "2024-12-06", "FREIGHT_INVOICE"),
  f("PTVC_TEN", "", "BILL_OF_LADING"), f("CT_TG", "04122024#&", "CERT_OF_ORIGIN"), f("GHI_CHU", "C/O mẫu E số: E247079657380002 (04/12/2024)", "DOSSIER"), f("SO_KIEN", "4 PK"),
];

describe("so tờ khai nháp với tờ khai thật", () => {
  it("so theo kiểu ô: mã (bỏ tên), tiền kiểu VN, ngày, định danh", () => {
    expect(sameValue("code", "VNSGN – Cảng Sài Gòn (TP.HCM)", "VNSGN")).toBe(true);
    expect(sameValue("money", "2188485 VND", "A - VND - 2.188.485")).toBe(true);
    expect(sameValue("number", "608.58", "608,58")).toBe(true);
    expect(sameValue("ident", "7704 7118 4612", "770471184612")).toBe(true);
    expect(sameValue("code", "", "TTR")).toBe(false);
  });
  it("ô lệch: có trên chứng từ → DOCUMENT (kèm chứng từ nào); không có → KNOWLEDGE (học theo ngữ cảnh)", () => {
    const d = compareFields(draft, real, docs);
    const by = Object.fromEntries(d.map((x) => [x.code, x]));
    expect(by["CANG_DO"]?.kind).toBe("MATCH");
    expect(by["PHI_VC"]?.kind).toBe("MATCH");
    expect(by["KHO"]).toMatchObject({ kind: "KNOWLEDGE", real: "02DSEA0 – KHO FEDEX" });
    expect(by["PT_TT"]?.kind).toBe("KNOWLEDGE");
    expect(by["PTVC_TEN"]?.kind).toBe("KNOWLEDGE");
    expect(findInDocuments("ident", "770471184612", docs)).toEqual(["AIR_WAYBILL", "FREIGHT_INVOICE"]);
    expect(findInDocuments("date", "2024-12-06", docs)).toEqual(["FREIGHT_INVOICE"]);
  });
  it("dòng hàng: ghép theo trị giá khi số dòng khác nhau; chấm HS, mô tả, thuế", () => {
    const dl: DraftLine[] = [{ lineNo: 1, description: "Recessed fix down light", amount: "16.32", hs: "9405.11.99", importRate: "30.000000", vatRate: null, partNo: "2118.564-ACOT-96" }];
    const rl = [{ lineNo: 2, hsCode: "94051199", description: "Đèn down light âm trần", quantity: 2, unit: "PCE", unitPrice: 8.16, invoiceValue: 16.32, origin: "CN", importTaxSchedule: "B30", importRate: "0", importExemptCode: null, vatRate: "10", vatExemptCode: null }];
    const pairs = pairLines(dl, [{ ...rl[0]!, lineNo: 5, invoiceValue: 99 }, ...rl]);
    expect(pairs[1]?.draft?.lineNo).toBe(1);
    const lines = compareLines(pairLines(dl, rl));
    expect(lines[0]).toMatchObject({ draftHs: "94051199", realHs: "94051199", draftImportRate: "30", realImportRate: "0", realVatRate: "10" });
    expect(score([], lines)).toEqual({ matched: 1, total: 4 });
  });
});

describe("bài học", () => {
  const ctx = lessonContext({ sellerName: "ZHUHAI RISE LIGHTING CO., LTD.", mode: "AIR", office: "02DS", docs });
  it("ngữ cảnh: nhà cung cấp chuẩn hóa, hãng chuyển phát nhận từ bất kỳ chứng từ nào", () => {
    expect(ctx).toEqual({ supplier: "LIGHTING RISE ZHUHAI", carrier: "FEDEX", mode: "AIR", office: "02DS" });
    expect(supplierKey("Rise Lighting Zhuhai Co.,Ltd")).toBe("LIGHTING RISE ZHUHAI");
    expect(carrierOf([{ kind: "INVOICE", data: { note: "per DHL account" } }])).toBe("DHL");
  });
  it("câu cố định: tách câu, bỏ câu riêng của lô (số hóa đơn, số tiền, số C/O)", () => {
    const cs = splitClauses(`04122024#&${real.CT_TG} và QĐ bổ sung 367 /QĐ - BKHCN vì phù hợp với trường hợp 3`);
    expect(cs).toHaveLength(2);
    expect(isLotSpecific(cs[0]!, [])).toBe(true);
    expect(isLotSpecific(cs[1]!, [])).toBe(false);
    expect(cs[1]).toMatch(/QĐ - BKHCN vì phù hợp với trường hợp 3$/);
    expect(isLotSpecific("Hàng mới 100% theo C/O E247079657380002", ["E247079657380002"])).toBe(true);
  });
  it("câu riêng của lô viết kiểu khác (số cân, ngày, chi tiết C/O, số hợp đồng) và lời AI nhận xét → không học; câu QCVN vẫn học", () => {
    // Ô 1.68 thật của lô bột thạch anh WSYH-20260418 (ngày 28/10/2026): cả 5 câu đều là số liệu của lô trước, đã bị học nhầm thành câu cố định.
    for (const c of [
      "net weight 72000 KGS",
      "origin criteria PE",
      "departure date 2026-05-07 from Tianbao, China to Thanh Thuy, Viet Nam by truck",
      "Form E No. E26MA6NQNE610002, issued in China, Kunming 2026-05-07",
      "CO FORM E, so CO: E26MA6NQNE610002 ngay 07/05/2026",
    ]) expect(isLotSpecific(c, [])).toBe(true);
    expect(isAiCommentary("Tài liệu là Hợp đồng mua bán hàng hóa số WSYH-20260502 ngày 02/05/2026, không phải tờ khai hải quan VNACCS")).toBe(true);
    expect(isLotSpecific("Hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN", [])).toBe(false);
    expect(isLotSpecific("Hàng mới 100%, dùng làm nguyên liệu sản xuất đá ốp lát", [])).toBe(false);
    expect(isLotSpecific("Theo công văn 1234/TCHQ-GSQL ngày 12/03/2024", [])).toBe(false);
    expect(isLotSpecific("Đèn đạt tiêu chuẩn an toàn quang sinh học IEC62471", [])).toBe(false);
    expect(isAiCommentary("Hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN")).toBe(false);
  });

  const rl: CustomsDeclarationLine = { lineNo: 1, hsCode: "94051199", description: "Đèn down light âm trần, màu trắng", quantity: 2, unit: "PCE", unitPrice: 8.16, invoiceValue: 16.32, origin: "CN", importTaxSchedule: "B30", importRate: "0", importExemptCode: null, vatRate: "10", vatExemptCode: null };
  const dl: DraftLine = { lineNo: 1, description: "Recessed fix down light LED 7W", amount: "16.32", hs: "9405.11.99", importRate: null, vatRate: null, partNo: "2118.564-ACOT-96" };
  const obs = observe({ diffs: compareFields(draft, real, docs), draft, real: { ...real, items: [rl] }, context: ctx, docs, lines: [{ draft: dl, real: rl }] });

  it("quan sát: kho/PTTT theo ngữ cảnh, câu QCVN, mặt hàng theo mã hàng; ô đã khớp nhờ chứng từ không thành bài học", () => {
    const kho = obs.find((o) => o.fieldCode === "KHO");
    expect(kho).toMatchObject({ kind: "FIELD", value: "02DSEA0 – KHO FEDEX", context: { office: "02DS", mode: "AIR", carrier: "FEDEX" } });
    expect(obs.find((o) => o.fieldCode === "PT_TT")).toMatchObject({ value: "TTR", context: { supplier: "LIGHTING RISE ZHUHAI" } });
    expect(obs.some((o) => o.fieldCode === "CANG_DO")).toBe(false);
    expect(obs.filter((o) => o.kind === "CLAUSE").map((o) => o.value)).toEqual([expect.stringMatching(/^Hàng nhập nằm ngoài phạm vi áp dụng QCVN/)]);
    expect(obs.find((o) => o.kind === "LINE")).toMatchObject({ value: "9405.11.99", context: { partNo: "P:2118564ACOT96" }, line: { description: "Đèn down light âm trần, màu trắng", importRate: "0", vatRate: "10" } });
  });

  it("gộp: cùng giá trị +1 (một tờ khai chỉ tính một lần); 3 lần + đang dùng → tự điền; mâu thuẫn → về chờ duyệt", () => {
    const o = obs.find((x) => x.fieldCode === "KHO")!;
    const base = (n: number) => ({ id: `les_${n}`, orgId: "org_a", now: new Date("2026-10-27T00:00:00Z") });
    let r: LessonRow = applyObservation(null, o, { id: "s1", declarationNo: "106794645160" }, base(1));
    r = applyObservation(r, o, { id: "s1", declarationNo: "106794645160" }, base(1));
    expect(r.hits).toBe(1);
    r = applyObservation(r, o, { id: "s2", declarationNo: "1" }, base(1));
    r = { ...applyObservation(r, o, { id: "s3", declarationNo: "2" }, base(1)), status: "ACTIVE" };
    expect(r.hits).toBe(3);
    expect(isAutoFill(r)).toBe(true);
    const other = applyObservation(r, { ...o, value: "02DSKHO – KHÁC" }, { id: "s4", declarationNo: "3" }, base(1));
    expect(other).toMatchObject({ value: "02DSEA0 – KHO FEDEX", hits: 3, conflicts: [{ value: "02DSKHO – KHÁC", hits: 1 }], status: "PENDING" });
    expect(isAutoFill(other)).toBe(false);
  });

  it("áp cho hồ sơ: chỉ bài học đang dùng, khớp ngữ cảnh cụ thể nhất; dòng hàng theo nhà cung cấp", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    const mk = (id: string, o: (typeof obs)[number], hits: number, status: LessonRow["status"] = "ACTIVE"): LessonRow => ({ ...applyObservation(null, o, { id, declarationNo: "106794645160" }, { id, orgId: "org_a", now }), hits, status });
    const kho = obs.find((x) => x.fieldCode === "KHO")!;
    const rows = [
      mk("a", kho, 4),
      mk("b", { ...kho, context: { office: "02DS" }, contextKey: "office=02DS", value: "02CIRCI – CHUNG" }, 9),
      mk("c", obs.find((x) => x.fieldCode === "PT_TT")!, 1, "PENDING"),
      mk("d", obs.find((x) => x.kind === "LINE")!, 3),
    ];
    const l = lessonsForDraft(rows, ctx);
    expect(l.fields["KHO"]).toMatchObject({ value: "02DSEA0 – KHO FEDEX", hits: 4, autoFill: true });
    expect(l.fields["PT_TT"]).toBeUndefined();
    expect(l.lines).toEqual([expect.objectContaining({ key: "P:2118564ACOT96", autoFill: true })]);
    expect(lessonsForDraft(rows, { ...ctx, carrier: "DHL" }).fields["KHO"]?.value).toBe("02CIRCI – CHUNG");
    expect(lessonsForDraft(rows, { ...ctx, supplier: "OTHER" }).lines).toEqual([]);
    // Câu cố định học nhầm trước khi bộ lọc chặt hơn (đã duyệt) → không áp nữa.
    const clause = (id: string, value: string): LessonRow => ({ ...mk(id, { kind: "CLAUSE", fieldCode: "GHI_CHU", contextKey: `supplier=${ctx.supplier}`, context: { supplier: ctx.supplier! }, value, line: null }, 1) });
    const withClauses = lessonsForDraft([...rows, clause("e", "net weight 72000 KGS"), clause("f", "Hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN")], ctx);
    expect(withClauses.clauses["GHI_CHU"]?.map((x) => x.value)).toEqual(["Hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN"]);

    const md = rulesMarkdown({ orgName: "CARA", generatedAt: now, lessons: rows, labels: { KHO: "Địa điểm lưu kho" } });
    expect(md).toContain("# Quy tắc khai báo – CARA");
    expect(md).toContain("| Địa điểm lưu kho (KHO) | Chi cục 02DS, Phương thức AIR, Hãng vận chuyển FEDEX | 02DSEA0 – KHO FEDEX | 4 | Tự điền | 106794645160 |");
    expect(md).toContain("| 2118564ACOT96 | LIGHTING RISE ZHUHAI | 9405.11.99 | Đèn down light âm trần, màu trắng | 0% | B30 | 10% | 3 | Tự điền |");
    expect(md).not.toContain("TTR");
  });
});
