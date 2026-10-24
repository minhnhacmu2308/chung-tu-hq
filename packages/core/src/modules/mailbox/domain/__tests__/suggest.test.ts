import { describe, expect, it } from "vitest";
import { fold, partnerTokens, suggestDossier, type SuggestDossier } from "../suggest.js";

const d = (id: string, v: Partial<SuggestDossier> = {}): SuggestDossier => ({ id, code: `HS-NK-2610-000${id}`, partner: "Hansol Technics Co., Ltd", billNo: "", status: "PROCESSING", updatedAt: new Date("2026-10-01"), ...v });
const msg = (v: Partial<Parameters<typeof suggestDossier>[0]> = {}) => ({ subject: "Shipping documents", fromName: "", fromEmail: "ops@forwarder.com", fileNames: [], ...v });

describe("gợi ý hồ sơ cho email chứng từ", () => {
  it("mã hồ sơ trong tiêu đề / tên file (bỏ ký tự phân cách) thắng đối tác", () => {
    const list = [d("1"), d("2", { partner: "Samsung" })];
    expect(suggestDossier(msg({ subject: "Re: HS-NK-2610-0002 docs", fromName: "Hansol" }), list)).toMatchObject({ dossierId: "2", reason: "DOSSIER_CODE" });
    expect(suggestDossier(msg({ fileNames: ["hsnk26100001_invoice.pdf"] }), list)).toMatchObject({ dossierId: "1", reason: "DOSSIER_CODE" });
  });

  it("số vận đơn trong tên file", () => {
    expect(suggestDossier(msg({ fileNames: ["HBL SGNHPH2410023.pdf"] }), [d("1"), d("2", { billNo: "SGNHPH2410023" })])).toMatchObject({ dossierId: "2", reason: "BILL_NO" });
  });

  it("đối tác khớp tên người gửi hoặc tên miền; nhiều hồ sơ cùng đối tác → hồ sơ cập nhật gần nhất", () => {
    const list = [d("1"), d("2", { updatedAt: new Date("2026-10-20") }), d("3", { partner: "Công ty TNHH Điện tử Minh Phát" })];
    expect(suggestDossier(msg({ fromName: "HANSOL TECHNICS - Export team" }), list)).toMatchObject({ dossierId: "2", reason: "PARTNER" });
    expect(suggestDossier(msg({ fromEmail: "export@hansoltechnics.co.kr" }), list)).toMatchObject({ dossierId: "2" });
    expect(suggestDossier(msg({ subject: "Minh Phát gửi invoice" }), list)).toMatchObject({ dossierId: "3", reason: "PARTNER" });
  });

  it("bỏ qua hồ sơ đã duyệt / truyền / hủy; không khớp gì → null", () => {
    expect(suggestDossier(msg({ subject: "HS-NK-2610-0001" }), [d("1", { status: "APPROVED" })])).toBeNull();
    expect(suggestDossier(msg({ subject: "Weekly newsletter" }), [d("1")])).toBeNull();
  });

  it("chuẩn hóa: bỏ dấu, từ chung của tên công ty", () => {
    expect(fold("Hóa đơn GTGT – Đợt 1")).toBe("hoa don gtgt dot 1");
    expect(partnerTokens("Công ty TNHH Điện tử Minh Phát")).toEqual(["dien", "minh", "phat"]);
  });
});
