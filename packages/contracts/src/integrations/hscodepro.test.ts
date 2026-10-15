// JSON mẫu lấy nguyên văn từ docs/integrations/hscodepro-api-v1.md §4.
import { describe, expect, it } from "vitest";
import { HsAnswerInputSchema } from "../api/declaration.js";
import { HsCreateItemSchema, HsJobItemSchema, HsJobSchema, HsResultSchema } from "./hscodepro.js";

const CREATED = {
  id: "7d1e9a52-3c4b-4f0e-9b61-2a8c5d7e1f00", external_ref: "INV-2026-00123", import_date: "2026-10-15", status: "processing", created_at: "2026-10-14T17:10:30.000Z",
  items: [1, 2, 3].map((n) => ({ id: `a1b2c3d4-000${n}-4000-8000-00000000000${n}`, line_no: n, status: "queued", question: null, result: null, error: null })),
};
const TAX = (rate: number) => ({ import: { rate, basis: "MFN", agreement: null }, vat: { rate: 10, note: null }, source_date: "2026-10-15" });
const NEED_INFO = {
  ...CREATED, status: "need_info",
  items: [
    { id: "a1", line_no: 1, status: "need_info", result: null, error: null, question: { id: "5b0c2f3e-8d7a-4c1b-9e2f-1a2b3c4d5e6f", questions: [{ id: "use", header: "Công dụng", question: "Thanh trượt này dùng cho loại máy nào?", options: [{ label: "Máy công cụ (CNC, máy phay, máy tiện)" }, { label: "Máy in 3D / thiết bị tự động hoá nhẹ" }, { label: "Khác", description: "Ghi rõ ở ô trả lời khác" }], multiSelect: false }] } },
    { id: "a2", line_no: 2, status: "completed", question: null, error: null, result: { hs_code: "84834090", hs_description: "Loại khác", confidence: 83, reasoning: "Vít me bi …", legal_basis: ["Chú giải 2 Phần XVI", "Quy tắc tổng quát 1 và 6"], warnings: [], tax: TAX(5), alternatives: [{ hs_code: "84669390", hs_description: "Loại khác", confidence: 12, why_not: "Chỉ đúng khi là bộ phận chuyên dùng riêng cho máy công cụ nhóm 84.56–84.61", tax: TAX(0) }] } },
    { id: "a3", line_no: 3, status: "processing", question: null, result: null, error: null },
  ],
};

describe("HSCodePro – schema dây theo tài liệu v1", () => {
  it("§4.1 vừa tạo và §4.2 cần bổ sung parse được", () => {
    expect(HsJobSchema.parse(CREATED).items).toHaveLength(3);
    const j = HsJobSchema.parse(NEED_INFO);
    expect(j.items[0]!.question!.questions[0]!.options).toHaveLength(3);
    expect(j.items[1]!.result!.alternatives[0]!.why_not).toContain("84.56");
  });
  it("§4.3 dòng lỗi và §4.4 kết quả không có thuế", () => {
    expect(HsJobItemSchema.parse({ id: "a3", line_no: 3, status: "failed", question: null, result: null, error: { code: "TIMEOUT", message: "AI xử lý quá 10 phút." } }).error!.code).toBe("TIMEOUT");
    expect(HsResultSchema.parse({ hs_code: "84833090", hs_description: "Loại khác", confidence: 74, reasoning: "…", legal_basis: [], warnings: ["Chưa tra được thuế"], tax: null, alternatives: [] }).tax).toBeNull();
  });
  it("mã HS phải 8 chữ số liền; nước xuất xứ ISO alpha-2", () => {
    expect(HsResultSchema.safeParse({ hs_code: "8483.40.90", hs_description: "", confidence: 1, reasoning: "", legal_basis: [], warnings: [], tax: null, alternatives: [] }).success).toBe(false);
    expect(HsCreateItemSchema.safeParse({ line_no: 1, description: "Vít me bi", origin_country: "TWN" }).success).toBe(false);
    expect(HsCreateItemSchema.safeParse({ line_no: 1, description: "Vít me bi", origin_country: "TW" }).success).toBe(true);
  });
  it("câu trả lời: mỗi câu phải có lựa chọn hoặc trả lời khác", () => {
    expect(HsAnswerInputSchema.safeParse({ questionId: "q", answers: [{ id: "use", selected: [], custom: null }] }).success).toBe(false);
    expect(HsAnswerInputSchema.safeParse({ questionId: "q", answers: [{ id: "use", selected: [], custom: "Máy đóng gói" }] }).success).toBe(true);
  });
});
