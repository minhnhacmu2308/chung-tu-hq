import { describe, expect, it } from "vitest";
import type { Dossier } from "@kb/contracts";
import { applyDraft, draftFromDossier, type QuickFillForm } from "./apply-draft";

const FORM: QuickFillForm = { direction: "NK", typeCode: "A11", partner: "", customsOffice: null, transportMode: "SEA_CONTAINER", typeGroup: "TRADE", dueDate: "2026-11-03", skillSetId: "default", note: "" };
const OLD = {
  id: "dos_1", code: "HS-NK-2610-142", direction: "NK", typeCode: "E21", partner: "HANSOL", customsOffice: "03CE – Hải quan cửa khẩu cảng Hải Phòng khu vực 2",
  skillSetId: "supplier-hansol", transportMode: "AIR", note: "Hàng mẫu", dueDate: "2026-10-01",
} as Dossier;

describe("draftFromDossier", () => {
  it("chỉ lấy thông tin form; chi cục lấy mã; không lấy hạn xử lý", () => {
    expect(draftFromDossier(OLD)).toEqual({
      direction: "NK", transportMode: "AIR", typeCode: "E21", partner: "HANSOL", skillSetId: "supplier-hansol", customsOfficeCode: "03CE", note: "Hàng mẫu",
      fromDossier: { id: "dos_1", code: "HS-NK-2610-142" },
    });
  });
});

describe("applyDraft", () => {
  it("ghi các ô có trong gợi ý, giữ ô còn lại, trả danh sách ô đã điền", () => {
    const r = applyDraft(FORM, draftFromDossier(OLD));
    expect(r.form).toEqual({ ...FORM, typeCode: "E21", customsOffice: "03CE", partner: "HANSOL", transportMode: "AIR", skillSetId: "supplier-hansol", note: "Hàng mẫu", typeGroup: null });
    expect(r.filled).toEqual(["direction", "transportMode", "typeCode", "customsOffice", "partner", "skillSetId", "note"]);
  });
  it("đổi chiều mà không kèm loại hình → bỏ loại hình của chiều cũ", () => {
    expect(applyDraft(FORM, { direction: "XK" }).form).toMatchObject({ direction: "XK", typeCode: "B11", typeGroup: null });
    expect(applyDraft(FORM, { partner: "ACME" }).form).toEqual({ ...FORM, partner: "ACME" });
  });
});
