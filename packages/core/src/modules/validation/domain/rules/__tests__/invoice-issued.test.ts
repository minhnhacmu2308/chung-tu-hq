// ADR 0013 GĐ2b: hồ sơ xuất khai trước (Invoice do hệ thống phát hành) – chưa phát hành invoice thì chặn.
import { describe, expect, it } from "vitest";
import type { DossierProfile } from "../../helpers.js";
import { runAllRules } from "../../run.js";
import { anphatExport, ORG, XK_SEA } from "../../test/shipments.js";

const ISSUED: DossierProfile = { ...XK_SEA, issuedKinds: ["INVOICE", "PACKING_LIST"] };
const result = (s = anphatExport(), dossier: DossierProfile = ISSUED) => runAllRules(s, { org: ORG, dossier }).find((r) => r.code === "R-INVOICE-ISSUED")!;

describe("R-INVOICE-ISSUED", () => {
  it("chưa cấp số → FAIL BLOCKER", () => {
    const r = result();
    expect(r).toMatchObject({ result: "FAIL", severity: "BLOCKER", fields: ["/invoice/no"] });
    expect(r.detail).toContain("Chưa cấp số hóa đơn");
  });

  it("số invoice nhập tay / đọc từ chứng từ không thay được việc cấp số", () => {
    const s = anphatExport((x) => (x.invoice.no.value = "TU-NHAP-01"));
    expect(result(s).result).toBe("FAIL");
  });

  it("đã cấp số → PASS ghi số", () => {
    const s = anphatExport((x) => (x.issuedInvoice = { no: "INV2611-001", date: "2026-11-10" }));
    expect(result(s)).toMatchObject({ result: "PASS", detail: expect.stringContaining("Đã cấp số hóa đơn INV2611-001") });
  });

  it("invoice tải lên (không phải khai trước) → SKIPPED; hồ sơ nhập → không áp dụng", () => {
    expect(result(anphatExport(), XK_SEA).result).toBe("SKIPPED");
    expect(result(anphatExport(), { ...ISSUED, direction: "NK" })).toMatchObject({ result: "SKIPPED", detail: "Không áp dụng cho tờ khai nhập khẩu" });
  });
});
