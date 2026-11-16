# ADR 0016 – Thương hiệu doanh nghiệp và ảnh đại diện: ảnh ở kho file, phục vụ qua route cùng origin có kiểm phiên

- Trạng thái: Chấp nhận
- Ngày: 2026-11-16

## Bối cảnh

Doanh nghiệp muốn thấy tên và logo của mình thay cho "KhaiBáo AI" sau khi đăng nhập (menu, tiêu đề tab, biểu tượng tab trình duyệt);
mỗi thành viên muốn có ảnh đại diện. Trang đăng nhập / đăng ký chưa biết doanh nghiệp nào nên giữ thương hiệu KhaiBáo AI. Khu Quản trị
hệ thống không đổi.

## Quyết định

- **Dữ liệu:** `organizations.brand_name`, `logo_key`, `logo_updated_at`; `users.avatar_key`, `avatar_updated_at` (migration
  `0045_org_branding_avatars`, đều nullable). **Ảnh không nằm trong DB** mà ở kho file đang dùng cho chứng từ (MinIO/S3): khóa
  `branding/<orgId>/logo-<id>.<ext>`, `avatars/<userId>/<id>.<ext>`. Module identity khai port tối thiểu `ImageStore`
  (`put/get/delete`); `container.ts` nối vào `dossier.storage` – identity không import port của dossier.
- **Chỉ nhận PNG / JPEG / WebP, tối đa 1 MB, nhận theo byte đầu file** (`sniffImage` trong `@kb/contracts`, dùng chung backend + dữ
  liệu mẫu). SVG bị từ chối vì chứa được script; GIF không cần. Lỗi có mã lý do `IMAGE_TYPE_UNSUPPORTED` / `IMAGE_TOO_LARGE`.
- **Đổi ảnh:** ghi ảnh mới (khóa mới) → trỏ DB sang khóa mới → xóa ảnh cũ (cố gắng; lỗi chỉ để lại file mồ côi). Không ghi đè cùng
  khóa nên URL cũ đang cache không bao giờ trả ảnh sai.
- **Quyền:** tên + logo chỉ Quản trị / Chủ sở hữu (`canManageOrg`, ghi `org_audit`: `ORG_BRAND_NAME`, `ORG_LOGO_SET`,
  `ORG_LOGO_REMOVED`); ảnh đại diện chỉ chính người đó (RLS `users_update` cũng chặn). Đọc ảnh thành viên chỉ khi người đó là thành
  viên của org đang đăng nhập, ngược lại 404.
- **Phục vụ ảnh qua route cùng origin có kiểm phiên**: `GET /api/org/logo`, `/api/me/avatar`, `/api/org/members/:id/avatar` trả byte
  với `Content-Type` theo byte đầu file, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`,
  `Cache-Control: private, max-age=31536000, immutable`. URL luôn kèm `?v=<thời điểm đổi>` (`brand.logoVersion`,
  `member.avatarVersion` trong phiên) nên đổi ảnh là đổi URL.
- **Giao diện:** `Sidebar brand.logoSrc`, `SidebarUser avatarSrc`, component `ImagePicker` mới (`@kb/ui`); favicon do `OrgFavicon`
  trong khung app đổi `<link rel=icon / apple-touch-icon>` sang logo và trả lại mặc định khi rời khung; tiêu đề tab thay "KhaiBáo AI"
  bằng tên thương hiệu (`usePageTitle`). Chế độ mock lưu ảnh dạng data URL trong DB giả; một hàm `orgLogoSrc` / `memberAvatarSrc`
  chọn URL theo nguồn dữ liệu.

## Vì sao không dùng presigned URL của kho

- Favicon và `<img>` trong menu cần **URL ổn định** suốt phiên và cache được lâu; presigned URL hết hạn sau vài phút và đổi mỗi lần ký
  → tab mất biểu tượng, menu tải lại ảnh liên tục, React Query phải ký lại.
- Cùng origin: không phải mở CORS / CSP cho domain kho, cookie phiên tự đi kèm, ảnh của org khác không lộ qua URL đoán được.
- Ảnh nhỏ (≤ 1 MB) và cache `immutable` → mỗi người tải mỗi ảnh một lần, chi phí đi qua web không đáng kể.

## Hệ quả

- Thêm một lần đọc kho file cho mỗi ảnh chưa cache. Nếu sau này cần ảnh công khai (email, trang đăng nhập theo tên miền riêng) thì làm
  route/bucket công khai riêng, không nới route hiện tại.
- File mồ côi khi xóa ảnh cũ lỗi: chấp nhận; dọn bằng job định kỳ khi cần.
