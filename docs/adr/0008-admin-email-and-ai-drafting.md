# ADR 0008 – Email của khu Quản trị: mẫu kéo thả, gửi theo đợt, AI soạn mẫu

- Trạng thái: Chấp nhận
- Ngày: 2026-10-26

## Bối cảnh
Đội vận hành cần gửi email cho khách (bảo trì, tính năng mới, nhắc gia hạn hợp đồng…) với mẫu tự soạn – thêm mẫu mới **không được phải sửa code**. Production chưa có máy chủ gửi mail (`MAIL=console`) nên cả email hệ thống (xác thực, quên mật khẩu, mời thành viên) cũng chưa tới được người dùng. Người dùng muốn nhờ AI soạn mẫu theo mô tả để làm nhanh hơn – trái với bất biến 5 cũ ("AI chỉ đọc chứng từ và gợi ý HS").

## Quyết định

- **Mẫu là dữ liệu**: email = danh sách khối JSON (`heading`, `text` – **đậm**/*nghiêng*/[liên kết], `button`, `image`, `divider`, `spacer`) + biến `{{name}}`, `{{email}}`, `{{orgName}}`. Schema + bộ dựng HTML `renderEmail` nằm ở `@kb/contracts/email` – **một** bộ dựng cho xem trước (trình duyệt, iframe sandbox) và lúc gửi (worker). HTML kiểu email: bảng + style inline, escape mọi chữ, liên kết chỉ `http(s)`/`mailto`.
- **Chữ ký**: chữ ký chung của công ty (quyền PLATFORM) + chữ ký riêng từng quản trị viên (chỉ chủ thấy / sửa), cùng mô hình khối.
- **Gửi theo đợt**: người nhận = nhóm doanh nghiệp (tất cả / theo gói / chọn) × vai trò + người cụ thể + email ngoài; chỉ thành viên đang hoạt động của doanh nghiệp đang hoạt động, bỏ trùng email. Đợt lưu **ảnh chụp** nội dung + danh sách người nhận (`email_campaigns`, `email_campaign_recipients`); job `email-campaign` gửi dần người còn `PENDING` – thử lại không gửi trùng; một người lỗi không dừng cả đợt (SENT / PARTIAL / FAILED).
- **Máy chủ gửi mail cấu hình trên giao diện** (`mail_settings`, mật khẩu mã hóa `APP_MASTER_KEY`), lưu xong thử đăng nhập SMTP ngay. `DbPlatformMailer` là cổng gửi duy nhất (cả email hệ thống của identity): cấu hình ở khu Quản trị → `.env` (`MAIL=smtp`) → chỉ ghi log.
- **Nới bất biến 5**: AI được **soạn nháp email cho khu Quản trị**, với ràng buộc: chỉ nhận mô tả người soạn gõ (không dữ liệu khách hàng nào trong prompt); trả về khối để người sửa – **không tự gửi**; đầu ra kiểm lại bằng `EmailContentSchema`; giới hạn 20 lần / giờ / người; ghi `usage_events` (`kind = AI_EMAIL_DRAFT`, `org_id = org_system`). Mã gọi SDK vẫn chỉ ở `extraction/infrastructure` (depcruise `ai-sdk-only-in-extraction-infra`). Đối chiếu, ánh xạ tờ khai, thuế, chặn truyền vẫn là code thuần như cũ.

## Hệ quả
- Thêm mẫu, đổi nội dung, đổi chữ ký không cần triển khai lại.
- Gmail cá nhân giới hạn ~500 thư/ngày (Workspace ~2.000); gửi số lượng lớn nên dùng dịch vụ SMTP chuyên dụng (SES, Mailgun…) – chỉ đổi cấu hình.
- Chưa có: hủy đăng ký nhận (unsubscribe), theo dõi mở thư / bấm link, lên lịch gửi, tải ảnh lên (ảnh dùng URL công khai).
