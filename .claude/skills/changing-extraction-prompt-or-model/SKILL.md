---
name: changing-extraction-prompt-or-model
description: Use when editing an extraction prompt, extraction schema field description, skill examples, AI model, effort level, or AI provider – or when users report misread document fields
---

# Đổi prompt / schema trích xuất / model

## Nguyên tắc
Đổi một câu prompt có thể làm đúng trường này nhưng sai trường khác. **Không có số eval trước và sau thì không merge.**

**Vi phạm chữ của quy tắc là vi phạm tinh thần của quy tắc.**

## Các bước
1. **Baseline**: `pnpm eval --live --tag before` trên toàn bộ `evals/golden/`. Lưu báo cáo.
2. **Lỗi đang sửa** phải có mẫu trong golden set. Chưa có → thêm PDF + `expected.json` do người duyệt trước.
3. Sửa prompt/schema/model. Tăng `PROMPT_VERSION` hoặc `EXTRACTION_SCHEMA_VERSION`.
4. `pnpm eval --live --tag after`.
5. So sánh: `pnpm eval:diff before after`. Dán bảng vào PR:
   - độ chính xác từng trường (trước → sau)
   - trường nào giảm, ở lô nào
   - chi phí trung bình / lô, thời gian / lô
6. **Chỉ merge khi**: trường mục tiêu tăng VÀ không trường BLOCKER nào giảm. Trường không-BLOCKER giảm → ghi rõ lý do chấp nhận trong PR.
7. Đổi model hoặc hãng → so cả chi phí: có thể chấp nhận model rẻ hơn nếu độ chính xác không giảm.

## Viết prompt/schema
- Mô tả trường bằng nhãn thường gặp + điều không phải nó. Quy tắc chung (locale số, ngày, không suy đoán, ghi `uncertainties`) ở system prompt; quy tắc riêng ở `.describe()` của trường.
- Ví dụ trong skill khách hàng chỉ lấy từ dữ liệu **người đã duyệt**.
- **Giới hạn grammar của structured output**: schema càng lớn (nhiều trường, mảng lồng, union) càng dễ bị API trả 400 "compiled grammar is too large". File scan/ảnh còn bị thêm mảng `_regions` (khung vị trí cho màn OCR) → schema lớn chỉ hỏng với file scan, PDF có lớp chữ vẫn chạy. Luồng không có màn OCR truyền `regions: false` trong `ExtractPrompt` (vd Dạy khai báo). Thêm/đổi schema lớn: thử với **cả ảnh scan**, không chỉ PDF có chữ.
- Không yêu cầu model tính toán nghiệp vụ (tổng trị giá, thuế). Model chép số; code tính.

## Red flags – DỪNG lại

| Ý nghĩ | Thực tế |
|---|---|
| "Chỉ sửa 1 chữ, không cần eval" | 1 chữ đổi được hành vi trên mọi loại chứng từ |
| "Thử tay 2 file thấy ổn rồi" | 2 file không đại diện; golden set mới đại diện |
| "Eval tốn tiền" | Rẻ hơn nhiều so với tờ khai sai bị phạt |
| "Model mới chắc chắn tốt hơn" | Đo, đừng đoán |
| "Lấy output model mới làm expected" | Eval thành vô nghĩa – expected do người duyệt |
