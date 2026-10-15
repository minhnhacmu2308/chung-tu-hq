import { describe, expect, it } from "vitest";
import { CreateDossierInputSchema, DossierFilterSchema } from "./dossier.js";
import { UpdateFieldValueInputSchema } from "./ocr.js";

describe("contract dossier/ocr", () => {
  it("CreateDossierInput: partner viết hoa + trim, typeCode A11 hợp lệ, A1 không", () => {
    const ok = CreateDossierInputSchema.parse({ direction: "NK", typeCode: "A11", partner: " hansol precision ", customsOffice: "03CE", skillSetId: "set_default", dueDate: "2026-10-20", incoterm: "FCA", transportMode: "SEA_CONTAINER" });
    expect(ok.partner).toBe("HANSOL PRECISION");
    expect(CreateDossierInputSchema.safeParse({ ...ok, typeCode: "A1" }).success).toBe(false);
  });
  it("CreateDossierInput: phân loại cá nhân/tổ chức mặc định 4, chỉ nhận mã 1–5", () => {
    const base = { direction: "NK", typeCode: "A11", partner: "HANSOL", customsOffice: "03CE", skillSetId: "default", dueDate: "2026-10-20", incoterm: "FCA", transportMode: "AIR" };
    expect(CreateDossierInputSchema.parse(base).partyClass).toBe("4");
    expect(CreateDossierInputSchema.parse({ ...base, partyClass: "1" }).partyClass).toBe("1");
    expect(CreateDossierInputSchema.safeParse({ ...base, partyClass: "6" }).success).toBe(false);
  });
  it("DossierFilter chấp nhận rỗng và từ chối status lạ", () => {
    expect(DossierFilterSchema.parse({})).toEqual({});
    expect(DossierFilterSchema.safeParse({ status: "XYZ" }).success).toBe(false);
  });
  it("UpdateFieldValueInput trim giá trị", () => {
    expect(UpdateFieldValueInputSchema.parse({ value: " 3860.50 " }).value).toBe("3860.50");
  });
});
