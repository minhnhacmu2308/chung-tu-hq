import { describe, expect, it } from "vitest";
import { DeclarationSchema, DossierSchema, ExtractedFieldSchema, SkillSchema } from "./index.js";
import { BranchParamSchema, BranchQuerySchema, BranchSubmissionSchema, CustomsRowSchema, PerformOperationInputSchema, ResendOperationInputSchema, SubmissionViewSchema } from "../api/customs.js";

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

describe("Hải quan theo tờ khai nhánh (spec tách tờ khai §7)", () => {
  const legacyView = {
    declarationStatus: "SUBMITTED", hsUnconfirmed: 0, started: true, inProgress: false, stage: "PRE_DECLARED", nextOp: "IDC", queryOp: "IID",
    amendments: 0, postAmendments: 0, pipeline: [], messages: [], result: null, customsInfo: null, rejection: null,
  };
  it("SubmissionView cũ (không branches/summary) vẫn hợp lệ: branches [] và summary mặc định", () => {
    const v = SubmissionViewSchema.parse(legacyView);
    expect(v.branches).toEqual([]);
    expect(v.summary).toEqual({ of: 1, cleared: 0, problems: [] });
  });
  it("SubmissionView có branches: mỗi tờ một mục (số tờ khai null khi chưa cấp)", () => {
    const b = { no: 2, of: 3, stage: "NOT_SENT", state: "APPROVED", declarationNo: null, channel: null, pipeline: [], nextOp: null, queryOp: "IID", amendments: 0, postAmendments: 0, messages: [], result: null, customsInfo: null, rejection: null, inProgress: false, started: false };
    const v = SubmissionViewSchema.parse({ ...legacyView, branches: [b], summary: { of: 3, cleared: 1, problems: [{ no: 2, kind: "SEND_FAILED" }] } });
    expect(v.branches[0]).toMatchObject({ no: 2, of: 3, declarationNo: null });
    expect(BranchSubmissionSchema.safeParse({ ...b, no: 0 }).success).toBe(false);
  });
  it("PerformOperation / ResendOperation: branch mặc định 1, số nguyên ≥ 1; chuỗi số (query) được ép", () => {
    expect(PerformOperationInputSchema.parse({ operation: "IDC" })).toEqual({ operation: "IDC", branch: 1 });
    expect(ResendOperationInputSchema.parse({ operation: "IDA", branch: 3 })).toEqual({ operation: "IDA", branch: 3 });
    expect(PerformOperationInputSchema.safeParse({ operation: "IDC", branch: 0 }).success).toBe(false);
    expect(PerformOperationInputSchema.safeParse({ operation: "IDC", branch: 1.5 }).success).toBe(false);
    expect(BranchParamSchema.parse("2")).toBe(2);
    expect(BranchParamSchema.parse(undefined)).toBe(1);
    expect(BranchQuerySchema.parse({})).toEqual({ branch: 1 });
    expect(BranchQuerySchema.safeParse({ branch: "abc" }).success).toBe(false);
  });
  it("CustomsRow có branch/of (mặc định 1/1 cho dữ liệu cũ)", () => {
    const row = { dossierId: "d", dossierCode: "c", direction: "NK", partner: "p", typeCode: "A11", state: "READY", updatedAt: "2026-10-14T02:00:00.000Z" };
    expect(CustomsRowSchema.parse(row)).toMatchObject({ branch: 1, of: 1 });
    expect(CustomsRowSchema.parse({ ...row, branch: 2, of: 3 })).toMatchObject({ branch: 2, of: 3 });
  });
  it("Dossier: tóm tắt Hải quan tùy chọn { cleared, of, problems }", () => {
    const customs = { cleared: 2, of: 3, problems: [{ no: 3, kind: "REJECTED" }] };
    expect(DossierSchema.parse({ ...dossier, customs })).toMatchObject({ customs });
    expect(DossierSchema.safeParse({ ...dossier, customs: { cleared: 1, of: 0, problems: [] } }).success).toBe(false);
  });
});
