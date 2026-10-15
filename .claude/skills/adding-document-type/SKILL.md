---
name: adding-document-type
description: Use when the system must read a new kind of trade document (packing list, delivery order, seaway bill, insurance certificate, import license, a new C/O form) or an existing type is missing fields needed for the declaration
---

# Thêm loại chứng từ

## Nguyên tắc
Một loại chứng từ mới chạm 5 chỗ. Thiếu một chỗ là dữ liệu đọc ra nhưng không được đối chiếu, hoặc đối chiếu nhưng không lên tờ khai.

## Các bước

1. **Contract** – `packages/contracts/src/extraction/<type>.ts`: Zod schema cho phần model trả về.
   - Mọi trường `required + .nullable()`, không `.optional()`.
   - Mã định danh `z.string()`; ngày `YYYY-MM-DD`; số là `number` (đã quy đổi theo locale chứng từ).
   - `.describe()` từng trường: nhãn thường gặp trên chứng từ (vd "Invoice No / PI No / 发票号") và điều KHÔNG phải (vd "không phải số PO").
   - Thêm vào `DocType` enum và vào `FileExtraction`.
1b. **Danh mục trường chuẩn** – `packages/contracts/src/catalog/documents.ts`: thêm `DocCatalog` cùng thứ tự key với schema (test `catalog.test.ts` bắt lệch), nhãn tiếng Việt như bảng đọc chứng từ của người khai + nhãn thường gặp. Schema gửi AI phải ≤ 16 tham số union sau `toAiOutputSchema` (test `ai-schema.test.ts`).
2. **Prompt** – `modules/extraction/infrastructure/prompts/`: chỉ thêm quy tắc đặc thù của loại này (vd quy ước số kiện). Tăng `PROMPT_VERSION`.
3. **Chuẩn hóa & gộp** – `modules/extraction/domain/merge.ts`: đưa dữ liệu vào `Shipment`, ghi `sources` (docId, page, raw) cho từng trường.
4. **Luật đối chiếu** – thêm luật dùng loại chứng từ mới. **REQUIRED SUB-SKILL:** `adding-validation-rule`.
5. **Ánh xạ tờ khai** – nếu chứng từ cung cấp chỉ tiêu tờ khai. **REQUIRED SUB-SKILL:** `mapping-declaration-fields`.
6. **Golden set** – thêm ≥ 2 mẫu thật vào `evals/golden/<lot>/` gồm PDF + `expected.json` do **người** duyệt (không dùng output của model làm đáp án). Lô thật của khách: thư mục PDF + Excel đáp án (STT | Tên trường | Trị giá) ngoài git, chấm bằng `pnpm eval --live --lot <thư mục>`.
7. **Eval** – **REQUIRED SUB-SKILL:** `changing-extraction-prompt-or-model`. Không loại nào cũ được giảm độ chính xác.

## Lỗi hay gặp

| Lỗi | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `.optional()` | Structured output không ổn định, model bỏ trường | `required + nullable` |
| MST/số invoice kiểu `number` | Mất số 0 đầu | `z.string()` |
| Lấy output model làm `expected.json` | Eval luôn 100%, vô nghĩa | Người duyệt từ PDF gốc |
| Quên `sources` | UI không tô được vị trí, không truy vết | Ghi `sources` khi merge |
| Không thêm luật đối chiếu | Đọc sai không ai phát hiện | Mỗi loại mới ≥ 1 luật chéo |

## Xong khi
- [ ] Contract + prompt + merge + luật + (ánh xạ) + golden set
- [ ] `pnpm typecheck && pnpm lint && pnpm test` xanh
- [ ] `pnpm eval` không giảm trường nào; kết quả dán vào PR
