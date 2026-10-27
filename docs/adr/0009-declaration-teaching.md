# ADR 0009 – Dạy khai báo: học từ tờ khai đã thông quan

- Trạng thái: Chấp nhận
- Ngày: 2026-10-27

## Bối cảnh
So tờ khai nháp app dựng từ bộ chứng từ với tờ khai thật (lô FANS25040166, 770471184612) cho thấy hai loại lệch:
(1) thông tin **có trên chứng từ** nhưng app lấy sai/chưa lấy (cảng dỡ trên C/O, số AWB có khoảng trắng, ngày cấp C/O) – sửa bằng quy tắc;
(2) thông tin **không có trên chứng từ nào** mà người khai tự biết (kho 02DSEA0 của FedEx, phương thức thanh toán TTR, câu QCVN, mô tả tiếng Việt, mã HS và thuế suất đã khai cho cùng mặt hàng) – chỉ học được từ chính tờ khai doanh nghiệp đã khai. Chứng từ của khách rất đa dạng nên cần cơ chế học có kiểm soát, không vá theo từng lô.

## Quyết định
- **Mục riêng "Dạy khai báo"** (menu, giống "Cách đọc chứng từ"), không thêm bước vào luồng 6 bước. Doanh nghiệp upload tờ khai đã thông quan (PDF scan/PDF/ảnh); có công tắc "Dùng bài học khi dựng tờ khai nháp" (Quản trị bật, mặc định tắt).
- **AI chỉ đọc** tờ khai thật (schema `CustomsDeclarationExtractionSchema`, khóa = mã chỉ tiêu tờ khai nháp). Ghép hồ sơ cùng lô theo số vận đơn (bỏ khoảng trắng, bỏ tiền tố ngày DDMMYY của vận đơn biển), so từng ô bằng code (`teaching/domain/compare.ts`), dò giá trị thật có trên chứng từ nào → phân loại "có trên chứng từ" (báo đội phát triển) / "không có trên chứng từ" (học).
- **Bài học là dữ liệu có cấu trúc trong DB** (`teach_lessons`, RLS theo org), do code áp – không đưa văn bản quy tắc cho AI tự áp. Ba loại: chỉ tiêu chung theo ngữ cảnh (kho theo chi cục + phương thức + hãng chuyển phát; thanh toán theo nhà cung cấp; cảng), câu cố định (chi tiết khai trị giá, ghi chú – bỏ câu chứa số liệu riêng lô), mặt hàng (nhà cung cấp + mã hàng → HS, mô tả tiếng Việt, thuế suất, biểu thuế). Đếm số lần gặp; giá trị khác → mâu thuẫn, bài học đang dùng về chờ duyệt.
- AI đọc tờ khai **không xin khung vị trí** (`ExtractPrompt.regions = false`): mục này không có màn OCR, và schema tờ khai lớn cộng `_regions` vượt giới hạn grammar của structured output (API trả 400 "compiled grammar is too large" với file scan/ảnh). Job hết lượt thử → tờ khai mẫu FAILED ("bấm Đọc lại"), không kẹt "AI đang đọc".
- **Người duyệt trước khi dùng**: bài học mới ở trạng thái chờ duyệt. Áp: chứng từ của lô > bài học > mặc định chung. Gặp **từ 3 lần** (`LESSON_AUTO_FILL_AFTER`), không mâu thuẫn → tự điền không đánh dấu; ít hơn → điền sẵn, đánh dấu cần kiểm. Ô điền từ bài học có nguồn `LESSON` ("Học từ TK …").
- **Mã HS học được vẫn phải người khai xác nhận** (bất biến 7); đủ 3 lần thì không gửi lại HSCodePro (tiết kiệm, tránh thuế suất không nhất quán) và thuế suất lấy theo tờ khai trước, có ghi chú khi HSCodePro trả khác.
- **Xuất `quy-tac-khai-bao-<ngày>.md`** từ bài học đang dùng – bản đọc được cho người, không phải nơi lưu gốc.
- **Tầng nền tảng**: `pnpm eval --live --corpus <thư mục>` chạy trên kho "bộ chứng từ + tờ khai thật" (mỗi lô một thư mục) → `rules-<thời điểm>.md` "chỉ tiêu nào lấy từ đâu, khớp bao nhiêu %" cho đội phát triển viết quy tắc (code có test). Không chia sẻ dữ liệu khách giữa doanh nghiệp.

## Hệ quả
- Lô sau của cùng doanh nghiệp đúng dần mà không cần sửa code; dữ liệu một doanh nghiệp không ảnh hưởng doanh nghiệp khác.
- Chi phí: mỗi tờ khai mẫu một lần AI đọc (ghi `usage_events`, khóa chống tính trùng).
- Chưa có: đọc tờ khai .xls của ECUS bằng code (hiện cần PDF), học từ sửa tay trên tờ khai nháp (dự kiến ghi vào cùng kho bài học), đồng bộ bài học mặt hàng sang Danh mục hàng hóa.
