# Hộp thư chứng từ – cấu hình Gmail / Outlook thật

Module `mailbox` kết nối hộp thư của doanh nghiệp qua OAuth, kéo email có file đính kèm chứng từ về "Hộp thư chứng từ" để gắn vào hồ sơ. Mặc định `MAILBOX_PROVIDER=fake` (hộp thư giả lập cho dev/demo). Tài liệu này hướng dẫn bật provider thật.

Redirect URI dùng chung cho cả hai provider, ghép từ `APP_URL`:

```
${APP_URL}/api/mailbox/oauth/callback
# dev:  http://localhost:3000/api/mailbox/oauth/callback
```

Google và Microsoft chỉ chấp nhận `http` với `localhost`; domain thật bắt buộc `https`. URI khai báo phải khớp từng ký tự (port, dấu `/` cuối) với `APP_URL` trong `.env`.

## 1. Biến môi trường

Thêm vào `.env` gốc:

```
MAILBOX_PROVIDER=live
APP_URL=http://localhost:3000

# Gmail
GOOGLE_OAUTH_CLIENT_ID=<client id, đuôi .apps.googleusercontent.com>
GOOGLE_OAUTH_CLIENT_SECRET=<client secret>

# Outlook / Microsoft 365
MICROSOFT_OAUTH_CLIENT_ID=<Application (client) ID>
MICROSOFT_OAUTH_CLIENT_SECRET=<secret Value>
MICROSOFT_OAUTH_TENANT=common
```

- Provider nào đủ cặp id + secret thì nút **Kết nối** của provider đó mới bật; thiếu thì trả `MAILBOX_NOT_CONFIGURED`.
- Token được mã hóa bằng `APP_MASTER_KEY` (bảng `mail_connections`); xoay khóa xem `docs/BACKEND-TODO.md` mục R7.
- Khởi động lại `pnpm dev` và `pnpm dev:worker` sau khi sửa `.env`.

## 2. Gmail – Google Cloud Console

1. Vào https://console.cloud.google.com → chọn project hoặc **New project** (vd. `chung-tu-hq-dev`).
2. Bật API: **APIs & Services → Library** → tìm **Gmail API** → **Enable**.
3. Màn hình đồng ý: **Google Auth Platform** (tên mới của OAuth consent screen) → **Get started**.
   - App name, support email: tùy ý.
   - **Audience**: **External**.
   - Contact email → đồng ý điều khoản → **Create**.
4. Test users: **Google Auth Platform → Audience**, giữ trạng thái **Testing**, mục **Test users → Add users**, nhập các địa chỉ Gmail sẽ dùng để đăng nhập test (tối đa 100). Không có bước này → lúc đăng nhập báo *Access blocked: app has not completed verification*.
5. Scope: **Google Auth Platform → Data Access → Add or remove scopes**, tick:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `openid`
   - `.../auth/userinfo.email`

   → **Update → Save**. `gmail.readonly` là *restricted scope*: ở chế độ Testing dùng bình thường; publish công khai phải qua Google verification + đánh giá bảo mật (CASA).
6. Tạo client: **Google Auth Platform → Clients → Create client**.
   - Application type: **Web application**.
   - Name: `chung-tu-hq local`.
   - **Authorized redirect URIs → Add URI**: dán redirect URI ở trên.
   - **Create** → copy **Client ID** và **Client secret** ngay (secret chỉ hiện lúc này; có thể tải JSON).
7. Dán vào `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.

Thay đổi redirect URI có thể mất vài phút tới vài giờ mới có hiệu lực; gặp `redirect_uri_mismatch` thì chờ rồi thử lại.

## 3. Outlook / Microsoft 365 – Microsoft Entra

1. Vào https://entra.microsoft.com (hoặc https://portal.azure.com → Microsoft Entra ID) → **Applications → App registrations → New registration**.
2. Điền:
   - Name: `chung-tu-hq local`.
   - **Supported account types**:
     - **Accounts in any organizational directory and personal Microsoft accounts** → test được cả Outlook.com lẫn Microsoft 365, đi với `MICROSOFT_OAUTH_TENANT=common`.
     - Chỉ test tài khoản công ty mình → **Accounts in this organizational directory only** và đặt `MICROSOFT_OAUTH_TENANT=<Directory (tenant) ID>`.
   - **Redirect URI**: platform **Web**, dán redirect URI ở trên.
   - **Register**.
3. Trang **Overview**: copy **Application (client) ID** → `MICROSOFT_OAUTH_CLIENT_ID`; copy **Directory (tenant) ID** nếu dùng tenant riêng.
4. Secret: **Certificates & secrets → Client secrets → New client secret** → mô tả tùy ý, hạn 6–12 tháng → **Add**. Copy cột **Value** ngay (không phải *Secret ID*); rời trang là không xem lại được. Ghi lịch gia hạn trước khi hết hạn.
5. Quyền: **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, tick `Mail.Read`, `User.Read`, `offline_access`, `openid`, `email` → **Add permissions**. Tài khoản cá nhân hoặc tenant tự quản không cần **Grant admin consent**; người dùng tự đồng ý khi đăng nhập. Tenant công ty có chính sách chặt thì admin phải bấm Grant admin consent.
6. Dán vào `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` / `MICROSOFT_OAUTH_TENANT`.

## 4. Kiểm tra

1. Chạy `pnpm dev` và `pnpm dev:worker` (job `mailbox-sync` chạy ở worker).
2. **Cài đặt → Hộp thư → Kết nối Gmail/Outlook** → đăng nhập đúng tài khoản đã khai báo (Gmail: nằm trong Test users) → chấp nhận quyền → quay về app, kết nối ở trạng thái ACTIVE.
3. Gửi vào hộp thư đó vài email mẫu rồi bấm **Lấy thư**:
   - Email "Invoice + Packing list lô hàng ABC" kèm PDF → phải xuất hiện.
   - Email có ảnh nhúng trong nội dung (inline) → ảnh nhúng bị bỏ, chỉ lấy file đính kèm thật.
   - Email không khớp từ khóa → không được kéo về.
4. Gắn file từ Hộp thư chứng từ vào một hồ sơ, kiểm tra chứng từ xuất hiện ở bước Tải lên.

Bộ lọc khi đồng bộ (`packages/contracts/src/api/mailbox.ts`):

| Điều kiện | Giá trị |
|---|---|
| Lần đầu lấy thư trong | 30 ngày gần nhất (`INBOX_FIRST_SYNC_DAYS`); các lần sau từ `lastSyncedAt` |
| Loại file | `pdf`, `png`, `jpg`, `jpeg`, `zip` (`INBOX_FILE_EXTENSIONS`) |
| Kích thước | ≤ 25 MB (`INBOX_MAX_FILE_BYTES`) |
| Từ khóa trong tiêu đề / nội dung / tên file | `invoice`, `hóa đơn`, `packing`, `bill of lading`, `b/l`, `awb`, `c/o`, `chứng từ`, `contract`, `shipment`… (`INBOX_KEYWORDS`) |

Đồng bộ hiện chỉ chạy khi người dùng bấm **Lấy thư** (chưa có lịch tự quét). Kết nối treo `SYNCING` > 30 phút do job mất sẽ được `stuck-sweeper` chuyển sang ERROR để bấm lại được.

## 5. Lỗi hay gặp

| Thông báo | Nguyên nhân | Cách sửa |
|---|---|---|
| `redirect_uri_mismatch` (Google) / `AADSTS50011` (Microsoft) | URI khai báo khác `APP_URL + /api/mailbox/oauth/callback` (port, `http`/`https`, dấu `/` cuối) | Sửa URI cho khớp từng ký tự; Google có thể cần chờ vài phút |
| *Access blocked: app has not completed verification* | Gmail đang Testing, tài khoản đăng nhập không nằm trong Test users | Thêm email vào **Audience → Test users** |
| `AADSTS7000215 Invalid client secret` | Dán nhầm *Secret ID* thay vì *Value*, hoặc secret hết hạn | Tạo secret mới, copy cột Value |
| `AADSTS50020` / tài khoản cá nhân bị từ chối | Đăng ký chọn *organizational directory only* nhưng tenant để `common` | Đổi Supported account types, hoặc đặt tenant id đúng |
| `AADSTS65001` / cần admin consent | Tenant công ty yêu cầu admin duyệt quyền | Admin bấm **Grant admin consent** ở API permissions |
| Nút Kết nối mờ | Thiếu id/secret của provider, hoặc `MAILBOX_PROVIDER` chưa `live`, hoặc chưa khởi động lại | Kiểm tra `.env`, chạy lại `pnpm dev` |
| Kết nối ACTIVE nhưng không có thư | Email không khớp từ khóa / loại file / quá 30 ngày | Xem bảng bộ lọc ở mục 4 |

Khi báo lỗi để điều tra: gửi thông báo trên màn hình kèm `x-request-id`, và dòng log JSON của worker có `queue: "mailbox-sync"`. **Không gửi client secret hay token.**

## Tham khảo

- Google – Manage OAuth Clients: https://support.google.com/cloud/answer/15549257
- Google – Restricted scopes & verification: https://support.google.com/cloud/answer/13464321
- Microsoft – Register an application: https://learn.microsoft.com/entra/identity-platform/quickstart-register-app
- Microsoft Graph – Mail.Read permission: https://learn.microsoft.com/graph/permissions-reference#mailread
