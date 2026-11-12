// ADR 0013 mục 3: lô nhiều hóa đơn – khai toàn bộ số + ngày hóa đơn (ghi chú ≤ 100 → IDA 1.50 ≤ 280 / EDA 2.32 ≤ 140).
import type { Shipment } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { buildDeclaration } from "../build.js";
import { invoiceRefs } from "../mapping/invoice-list.js";
import { DOSSIER, hansol, ORG } from "../test/shipment.js";
import { CATALOGS } from "./a016.js";

const NOW = new Date("2026-10-14T03:00:00.000Z");
const ITEMS = ["3700", "3360", "2700", "2760", "3900", "2952", "1478"].map((amount, i) => ({ id: `li_${i + 1}`, amount, importDutyRate: "0", vatRate: "8" }));

/** Thêm hóa đơn thứ 2..n+1: số INV-2610-00NN, ngày 2026-10-NN (đọc được số khi `readNo`). */
const addInvoices = (n: number, readNo = true) => (s: Shipment) => {
  for (let k = 2; k <= n + 1; k++) {
    const id = `doc_inv${k}`;
    const no = `INV-2610-${String(k).padStart(4, "0")}`;
    const date = `2026-10-${String(k).padStart(2, "0")}`;
    s.documents.push({ id, kind: "INVOICE", pages: 1 });
    if (!readNo) continue;
    s.invoice.no.sources.push({ documentId: id, kind: "INVOICE", page: 1, raw: no, normalized: no });
    s.invoice.date.sources.push({ documentId: id, kind: "INVOICE", page: 1, raw: date, normalized: date });
  }
};
const build = (direction: "NK" | "XK", mutate?: (s: Shipment) => void) =>
  buildDeclaration({
    catalogs: CATALOGS, shipment: hansol(mutate), dossier: { ...DOSSIER, direction, typeCode: direction === "NK" ? "A11" : "B11" }, org: ORG, items: ITEMS, now: NOW,
    exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] },
  }).fields;
const listed = (...values: (string | undefined | null)[]) => values.join(" ").match(/INV-2610-\d{4}|HSP-2610-0457/g) ?? [];

describe("invoiceRefs", () => {
  it("số + ngày theo thứ tự chứng từ; bỏ nguồn không phải INVOICE (PL, C/O nhắc lại số hóa đơn) và số trùng", () => {
    const s = hansol(addInvoices(2));
    s.invoice.no.sources.push({ documentId: "doc_inv9", kind: "INVOICE", page: 1, raw: "HSP-2610-0457", normalized: "HSP-2610-0457" });
    s.documents.push({ id: "doc_inv9", kind: "INVOICE", pages: 1 });
    expect(invoiceRefs(s)).toEqual([
      { no: "HSP-2610-0457", date: "2026-10-02" },
      { no: "INV-2610-0002", date: "2026-10-02" },
      { no: "INV-2610-0003", date: "2026-10-03" },
    ]);
  });
});

describe("lô nhiều hóa đơn – liệt kê số hóa đơn trên tờ khai", () => {
  it("một hóa đơn → không đổi gì (số đã ở chỉ tiêu Số hóa đơn)", () => {
    expect(build("XK")["GHI_CHU"]?.value).toBe("");
    expect(build("NK")["GHI_CHU"]?.value).not.toMatch(/So HD/);
  });

  it("EDA 3 hóa đơn vừa ghi chú 2.57: số + ngày dd/mm/yyyy, đúng thứ tự, ≤ 100 ký tự", () => {
    const f = build("XK", addInvoices(2));
    expect(f["GHI_CHU"]).toMatchObject({ value: "So HD: HSP-2610-0457 02/10/2026, INV-2610-0002 02/10/2026, INV-2610-0003 03/10/2026", source: "INVOICE" });
    expect(f["GHI_CHU"]!.value!.length).toBeLessThanOrEqual(100);
    expect(f["GHI_CHU"]?.suspect).toBeFalsy();
    expect(f["TK_MRK"]?.value).not.toMatch(/So HD/);
    expect(f["HD_PL"]).toMatchObject({ value: expect.stringMatching(/^B/), note: expect.stringMatching(/Phần ghi chú.*2\.32.*HYS/) });
  });

  it("EDA nhiều hóa đơn: tràn sang 2.32 (≤ 140, giữ nội dung sẵn có); còn thừa → nghi ngờ + gợi ý HYS", () => {
    const base = build("XK")["TK_MRK"]?.value ?? "";
    const f = build("XK", addInvoices(11));
    const note = f["GHI_CHU"]!.value!;
    const mrk = f["TK_MRK"]!.value!;
    expect(note.length).toBeLessThanOrEqual(100);
    expect(mrk.length).toBeLessThanOrEqual(140);
    if (base) expect(mrk.startsWith(base)).toBe(true);
    expect(mrk).toMatch(/So HD \(tiep\): INV-2610-0004/);
    const all = listed(note, mrk);
    expect(all).toEqual(["HSP-2610-0457", ...Array.from({ length: all.length - 1 }, (_, k) => `INV-2610-${String(k + 2).padStart(4, "0")}`)]);
    expect(all.length).toBeLessThan(12);
    expect(f["GHI_CHU"]).toMatchObject({ suspect: true, note: expect.stringMatching(new RegExp(`Còn ${12 - all.length} số hóa đơn không đủ chỗ.*HYS`)) });
  });

  it("IDA: nối sau C/O + container ở 1.68, tràn sang 1.50 ngay sau ngày vận đơn DDMMYYYY#& (không chèn \"; \")", () => {
    const base = build("NK");
    const f = build("NK", addInvoices(6));
    const note = f["GHI_CHU"]!.value!;
    const ct = f["CT_TG"]!.value!;
    expect(note.length).toBeLessThanOrEqual(100);
    expect(ct.length).toBeLessThanOrEqual(280);
    expect(note.startsWith(base["GHI_CHU"]!.value!)).toBe(true);
    expect(ct.startsWith(base["CT_TG"]!.value!)).toBe(true);
    expect(ct).not.toMatch(/#&; /);
    expect(listed(note, ct)).toHaveLength(7);
    expect(f["GHI_CHU"]?.note ?? "").not.toMatch(/không đủ chỗ/);
  });

  it("hóa đơn chưa đọc được số → nghi ngờ, nhắc bổ sung (không bịa số)", () => {
    const f = build("XK", addInvoices(1, false));
    expect(f["GHI_CHU"]).toMatchObject({ value: "So HD: HSP-2610-0457 02/10/2026", suspect: true, note: expect.stringMatching(/1 hóa đơn chưa đọc được số/) });
  });
});
