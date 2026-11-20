# Rule: thêm loại nghiệp vụ vào "Nghiệp vụ khác"

Áp dụng khi thêm hoặc sửa một loại nghiệp vụ phụ trợ thông quan (định danh, tách vận đơn, HYS, container, KVGS, lệ phí CSHT, CFS, ngoài giờ, loại mới…).
Thiết kế: `docs/superpowers/specs/2026-11-20-nghiep-vu-khac-design.md`. Quyết định: ADR 0020.

## Trước khi code – BẮT BUỘC xác định và ghi vào bảng mục 2 của đặc tả

1. **Cần số tờ khai hay không?**
   - **Không cần (nhóm A)**: tạo độc lập, `dossier_id` trống, gắn hồ sơ sau khi người dùng xác nhận.
   - **Cần (nhóm B)**: tạo bắt buộc có số tờ khai + ngày đăng ký + chi cục (nhập tay hoặc chọn hồ sơ); kiểm lúc tạo, không đợi lúc gửi.
   - Chưa rõ → **hỏi chủ sản phẩm / đội nghiệp vụ**, không tự đoán.
2. **Gửi qua cổng nào?** Có API trong `docs/vnaccs-api/` → nối outbox + worker. Không có → ghi nhận tay (nhập số kết quả, đính kèm biên lai) và ghi vào mục "Còn mở".
3. **Ô khai và kết quả**: ô nào bắt buộc, kiểu (mã định danh là `string`, ngày `YYYY-MM-DD`, thời điểm UTC, tiền `Decimal`), kết quả điền vào chỉ tiêu tờ khai nào (nếu có).
4. **Hạn dùng / giới hạn** của kết quả (vd số định danh dùng đến 31/12 năm cấp) và có được khai nhiều lần cùng nội dung không.

## Khi làm

- Một bản ghi duy nhất cho mỗi nghiệp vụ; mở từ menu hay từ tờ khai dùng cùng use case.
- Ghi dòng vào `customs_ops`; `payload` có Zod schema riêng theo `type` trong `packages/contracts`.
- Phân biệt "Lỗi hệ thống HQ" (tự thử lại) với "Bị từ chối" (không tự thử lại). Idempotency như ADR 0005. Mỗi lần gọi FPT ghi `usage_events`, không trừ lượt khai.
- Nhãn loại, trạng thái, ô khai đủ vi/en/zh.
- Cập nhật `docs/QUY-TRINH-NGHIEP-VU.md` khi loại mới chạy được.
