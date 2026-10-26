import { describe, expect, it } from "vitest";
import { CustomsMessageSchema } from "../dto/customs.js";
import { PerformOperationInputSchema, SubmitDeclarationInputSchema } from "./customs.js";
import { CreateHysInputSchema, HysSubmissionViewSchema, UpdateHysInputSchema } from "./hys.js";

const view = {
  id: "s1", seq: 1, procedureCode: "A02", attachKind: "ETC", customsOffice: "01B1", processingUnit: "00", phone: "", internalRef: "ref",
  note: null, purpose: "PRE_DECLARATION", status: "ACCEPTED", attempt: 1, receiptNo: "123456789012", registeredOn: "2026-10-26",
  reject: null, fill: { outcome: "FILLED", slot: 1 }, files: [{ id: "f1", documentId: null, fileName: "a.pdf", mime: "application/pdf", sizeBytes: 10, source: "UPLOAD" }],
  issues: [{ code: "NO_FILE" }], sentAt: "2026-10-26T01:00:00Z",
};

describe("HYS DTO", () => {
  it("nhận view hợp lệ", () => {
    expect(HysSubmissionViewSchema.parse(view).receiptNo).toBe("123456789012");
  });
  it("từ chối registeredOn sai định dạng", () => {
    expect(HysSubmissionViewSchema.safeParse({ ...view, registeredOn: "26/10/2026" }).success).toBe(false);
  });
  it("attachKind: 8 mã ATTACH_KIND, không nhận mã thủ tục A546", () => {
    expect(HysSubmissionViewSchema.safeParse({ ...view, attachKind: "A02" }).success).toBe(false);
    expect(HysSubmissionViewSchema.parse({ ...view, attachKind: null }).attachKind).toBeNull();
    expect(UpdateHysInputSchema.parse({ attachKind: null }).attachKind).toBeNull();
    expect(CreateHysInputSchema.parse({ procedureCode: "A02", attachKind: "INV" }).attachKind).toBe("INV");
  });
  it("PerformOperation / Submit mang cờ hysWaived", () => {
    expect(PerformOperationInputSchema.parse({ operation: "IDA", branch: 1, hysWaived: true }).hysWaived).toBe(true);
    expect(SubmitDeclarationInputSchema.parse({ certificateId: "c", hysWaived: true }).hysWaived).toBe(true);
  });
  it("CustomsMessage nhận direction NOTE", () => {
    const m = CustomsMessageSchema.parse({ id: "m", dossierId: "d", operation: "HYS", direction: "NOTE", result: "OK", summary: "s", at: "2026-10-26T01:00:00Z", payloadPreview: "" });
    expect(m.direction).toBe("NOTE");
  });
});
