import { describe, expect, it } from "vitest";
import type { CodeListEntry } from "@kb/contracts";
import { buildDossierDraft, dossierCodesIn, resolveOffice, type AiDossierDraft, type DraftBase } from "../draft.js";

const OFFICES: CodeListEntry[] = [
  { code: "01B1", name: "Hải quan cửa khẩu sân bay quốc tế Nội Bài" },
  { code: "01B2", name: "Hải quan cửa khẩu sân bay quốc tế Nội Bài" },
  { code: "03CE", name: "Hải quan cửa khẩu cảng Hải Phòng khu vực 2" },
  { code: "02CI", name: "Hải quan cửa khẩu cảng Sài Gòn khu vực 1" },
  { code: "02CV", name: "Hải quan cửa khẩu cảng Sài Gòn khu vực 2" },
  { code: "99XX", name: "Chi cục đã giải thể", inactive: true },
];
const TYPES: CodeListEntry[] = [
  { code: "A11", name: "Nhập kinh doanh tiêu dùng", parent: "NK" },
  { code: "E21", name: "Nhập nguyên liệu để gia công", parent: "NK" },
  { code: "B11", name: "Xuất kinh doanh", parent: "XK" },
];
const LISTS = { typeCodes: TYPES, offices: OFFICES };
const NONE: AiDossierDraft = { baseDossierCode: null, direction: null, transportMode: null, typeCode: null, customsOffice: null, partner: null, dueInDays: null, note: null };
const BASE: DraftBase = { id: "dos_1", code: "HS-NK-2610-142", direction: "NK", transportMode: "SEA_CONTAINER", typeCode: "E21", customsOfficeCode: "03CE", partner: "HANSOL PRECISION", skillSetId: "supplier-hansol", note: "Hàng mẫu" };

describe("dossierCodesIn", () => {
  it("lấy mã hồ sơ gõ trong câu, chuẩn hóa chữ hoa, bỏ trùng", () => {
    expect(dossierCodesIn("giống hs-nk-2610-142 và HS-NK-2610-142, không phải HS-NK-26")).toEqual(["HS-NK-2610-142"]);
  });
});

describe("resolveOffice", () => {
  it("nhận mã hoặc 'mã – tên'; mã ngừng dùng không nhận", () => {
    expect(resolveOffice("03CE", OFFICES)).toBe("03CE");
    expect(resolveOffice("02CI – Sài Gòn KV1", OFFICES)).toBe("02CI");
    expect(resolveOffice("99XX", OFFICES)).toBeUndefined();
  });
  it("tên không dấu khớp đúng một chi cục → mã; nhiều chi cục cùng tên → không đoán", () => {
    expect(resolveOffice("sai gon khu vuc 1", OFFICES)).toBe("02CI");
    expect(resolveOffice("Cảng Sài Gòn", OFFICES)).toBeUndefined();
    expect(resolveOffice("Nội Bài", OFFICES)).toBeUndefined();
    expect(resolveOffice("ab", OFFICES)).toBeUndefined();
  });
});

describe("buildDossierDraft", () => {
  it("sao chép thông tin form của hồ sơ gốc, ghi đè ô người dùng nói khác", () => {
    const d = buildDossierDraft({ ...NONE, transportMode: "AIR" }, BASE, LISTS, "2026-10-31");
    expect(d).toEqual({
      direction: "NK", transportMode: "AIR", typeCode: "E21", customsOfficeCode: "03CE", partner: "HANSOL PRECISION",
      skillSetId: "supplier-hansol", note: "Hàng mẫu", fromDossier: { id: "dos_1", code: "HS-NK-2610-142" },
    });
  });
  it("bỏ ô AI sai danh mục; loại hình không thuộc chiều mới → bỏ để người dùng chọn lại", () => {
    expect(buildDossierDraft({ ...NONE, typeCode: "Z99", transportMode: "BOAT" }, BASE, LISTS, "2026-10-31")).toMatchObject({ typeCode: "E21", transportMode: "SEA_CONTAINER" });
    expect(buildDossierDraft({ ...NONE, direction: "XK" }, BASE, LISTS, "2026-10-31").typeCode).toBeUndefined();
    expect(buildDossierDraft({ ...NONE, direction: "XK", typeCode: "b11" }, BASE, LISTS, "2026-10-31").typeCode).toBe("B11");
  });
  it("không có hồ sơ gốc: chỉ ô AI hợp lệ; hạn xử lý theo số ngày 0–90", () => {
    const d = buildDossierDraft({ ...NONE, direction: "NK", customsOffice: "Sài Gòn khu vực 1", partner: "  ACME LTD ", dueInDays: 2 }, null, LISTS, "2026-10-31");
    expect(d).toEqual({ direction: "NK", customsOfficeCode: "02CI", partner: "ACME LTD", dueDate: "2026-11-02" });
    expect(buildDossierDraft({ ...NONE, dueInDays: 400 }, null, LISTS, "2026-10-31")).toEqual({});
  });
});
