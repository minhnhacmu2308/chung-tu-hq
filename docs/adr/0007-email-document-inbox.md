# ADR 0007 – Hộp thư chứng từ: lấy chứng từ từ Gmail / Outlook qua OAuth

- Trạng thái: Chấp nhận
- Ngày: 2026-10-22

## Bối cảnh
Chứng từ (invoice, packing list, B/L, AWB, C/O…) thường tới doanh nghiệp qua email của forwarder / nhà cung cấp. Người khai phải tải file về rồi tải lên hồ sơ. Cần lấy thẳng file đính kèm từ hộp thư, nhưng mọi chứng từ phải thuộc một hồ sơ (bất biến hiện có) và không được sinh hồ sơ rác.

Các phương án đã cân nhắc: (A) OAuth + lấy thư theo yêu cầu; (B) địa chỉ nhận thư riêng (forward sang `xxx@inbox.khaibao…`, cần dịch vụ nhận mail + tên miền); (C) push notification (Gmail Pub/Sub, Graph subscription – cần endpoint công khai, gia hạn subscription).

## Quyết định

**Phương án A.** Người dùng kết nối Gmail (`gmail.readonly`) hoặc Outlook (`Mail.Read`, `offline_access`) bằng OAuth 2.0; bấm "Lấy chứng từ mới" → job `mailbox-sync` lấy email từ mốc lần trước.

- **Token**: access + refresh token lưu mã hóa AES-256-GCM (`APP_MASTER_KEY`) trong `mail_connections`; không bao giờ trả ra API. Refresh token bị thu hồi → trạng thái `REAUTH`, người dùng kết nối lại (giữ refresh token cũ nếu Google không trả lại).
- **State OAuth** ký HMAC (khóa dẫn xuất từ `APP_MASTER_KEY`), hạn 10 phút, gắn org + người đang đăng nhập; callback kiểm tra khớp phiên → chống CSRF và gắn nhầm hộp thư sang org khác.
- **Lọc**: email có file đính kèm PDF/PNG/JPG/ZIP ≤ 25 MB và khớp từ khóa chứng từ (`INBOX_KEYWORDS`); lần đầu lấy 30 ngày. Lấy cũ nhất trước, tối đa 100 email/lần; mốc tiến tới email mới nhất của lô. **Chống trùng** bằng khóa duy nhất `(org, kết nối, mã email của nhà cung cấp)`.
- **Hộp thư chứng từ** (chỗ chứa trung gian, `inbox_messages` + `inbox_attachments`): file lưu kho đối tượng, chưa thuộc hồ sơ, **chưa gọi AI** (không tốn quota/tiền cho email không liên quan). Người dùng xếp file vào hồ sơ → đi đúng luồng tải chứng từ (`uploadDocuments`: kiểm tra file, quota trang, AI đọc). Hệ thống **gợi ý** hồ sơ còn mở: mã hồ sơ / số vận đơn trong tiêu đề, tên file; không có thì tên đối tác khớp người gửi (code thuần, có test).
- **Adapter** `GmailProvider`, `OutlookProvider` (REST, không SDK) và `FakeDevMailProvider` (`MAILBOX_PROVIDER=fake`, mặc định ở dev). Lời gọi ra ngoài chạy trong worker (theo ADR 0005).

## Hệ quả
- Không tốn phí API (Gmail API, Microsoft Graph miễn phí trong hạn mức). `gmail.readonly` là *restricted scope*: chế độ Testing của Google cho tối đa 100 test user; mở công khai cần Google verification + đánh giá bảo mật CASA hằng năm. Outlook không có yêu cầu này.
- Chưa tự lấy định kỳ, chưa nhận XML hóa đơn điện tử (luồng đọc chưa hỗ trợ), chưa tự tạo hồ sơ cho mỗi email (người dùng bấm "Tạo hồ sơ mới từ email này") – có thể bổ sung sau trên cùng nền.
- Gỡ kết nối không xóa email đã lấy (vẫn xếp được vào hồ sơ).
