# ADR 0002 – AI chỉ đọc chứng từ; nghiệp vụ là code

- Trạng thái: Chấp nhận
- Ngày: 2026-10-12

## Bối cảnh
Tờ khai hải quan phải đúng và giải trình được. Kết quả của LLM có thể khác nhau giữa các lần chạy và có thể bịa giá trị.

## Quyết định
- AI chỉ dùng để: (1) đọc chứng từ → JSON đúng schema, (2) gợi ý mã HS. Gọi qua port `AiProvider` trong module `extraction` (và `declaration` cho gợi ý HS).
- Đối chiếu chéo, ánh xạ sang chỉ tiêu tờ khai, tính trị giá/thuế, quyết định chặn truyền: code thuần, có unit test.
- Không fine-tune ở giai đoạn đầu. "Skill" = cấu hình (trường, alias, ví dụ đã duyệt), không phải model huấn luyện.

## Hệ quả
- (+) Cùng input → cùng tờ khai; test được; đổi hãng AI không ảnh hưởng nghiệp vụ.
- (−) Quy tắc ánh xạ phải viết và bảo trì bằng tay (dạng cấu hình + test).
