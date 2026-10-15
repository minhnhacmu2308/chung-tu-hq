import { describe, expect, it } from "vitest";
import { DeclarationSchema, DossierSchema, ExtractedFieldSchema, SkillSchema } from "./index.js";

const dossier = {
  id: "dos_021", code: "HS-NK-2610-021", direction: "NK", typeCode: "A11", partner: "HANSOL PRECISION CO., LTD.",
  customsOffice: "03CE – Chi cục HQ cửa khẩu cảng Hải Phòng KV III", skillSetId: "set_default", status: "NEEDS_REVIEW",
  step: "ocr", dueDate: "2026-10-14", createdAt: "2026-10-12T06:00:00.000Z", updatedAt: "2026-10-13T06:00:00.000Z",
  ownerId: "usr_chau", invoiceValue: "20850.00", currency: "USD", incoterm: "FCA", transportMode: "SEA_CONTAINER", partyClass: "4",
  billNo: "HPSEL2610078", suspectFields: 16,
};

describe("DTO", () => {
  it("DossierSchema chấp nhận hồ sơ mẫu và từ chối invoiceValue là number", () => {
    expect(DossierSchema.parse(dossier)).toEqual(dossier);
    expect(DossierSchema.safeParse({ ...dossier, invoiceValue: 20850 }).success).toBe(false);
  });
  it("ExtractedFieldSchema: region là % trang 0–100", () => {
    const f = { id: "f1", documentId: "doc_1", group: "GENERAL", key: "invoice_no", label: "Số hóa đơn", value: "INV-1", originalValue: "INV-1", status: "SINGLE_SOURCE", region: { page: 1, x: 10, y: 20, w: 30, h: 5 } };
    expect(ExtractedFieldSchema.parse(f)).toEqual(f);
    expect(ExtractedFieldSchema.safeParse({ ...f, region: { ...f.region, x: 120 } }).success).toBe(false);
  });
  it("DeclarationSchema: kind IDA|EDA, tiền là chuỗi", () => {
    const d = { dossierId: "dos_021", kind: "IDA", status: "DRAFT", fields: [], exchangeRate: "25400", exchangeRateDate: "2026-10-13", customsValueVnd: "0", valueAdjustments: [], estimatedImportDutyVnd: "0", estimatedVatVnd: "0" };
    expect(DeclarationSchema.parse(d)).toEqual(d);
    expect(DeclarationSchema.safeParse({ ...d, kind: "AMA" }).success).toBe(false);
  });
  it("SkillSchema: accuracy trong [0,1]", () => {
    const s = { id: "sk", code: "SK-INV-GEN", name: "Invoice", kind: "DOCUMENT", docKind: "INVOICE", language: "EN", version: 1, labeledSamples: 0, updatedAt: "2026-10-13T06:00:00.000Z", enabled: true, fields: [] };
    expect(SkillSchema.parse(s)).toEqual(s);
    expect(SkillSchema.safeParse({ ...s, accuracy: 1.2 }).success).toBe(false);
  });
});
