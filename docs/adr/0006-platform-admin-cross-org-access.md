# ADR 0006 – Khu quản trị hệ thống đọc xuyên doanh nghiệp qua vai trò DB riêng

- Trạng thái: Chấp nhận
- Ngày: 2026-10-14

## Bối cảnh
Đội vận hành KhaiBáo AI cần một nơi nhìn mọi doanh nghiệp (`/admin`, spec `docs/superpowers/specs/2026-10-14-admin-backoffice-design.md`): khóa/mở doanh nghiệp, đổi gói, xem chi phí AI, chạy lại job lỗi, gửi thông báo. Toàn bộ bảng nghiệp vụ bật RLS theo `app.org_id` (ADR 0004) và role ứng dụng `kb_app` không thể đọc xuyên org – đúng như mong muốn cho ứng dụng của khách.

## Quyết định

1. **Vai trò DB riêng `kb_platform`**: `LOGIN BYPASSRLS`, chỉ có quyền `SELECT/INSERT/UPDATE/DELETE` trên bảng và `USAGE` trên sequence của schema `public` – không sở hữu bảng, không có quyền DDL. Tạo bởi `ensurePlatformRole` khi chạy migration (cần user migration có quyền superuser hoặc `CREATEROLE` + BYPASSRLS).
2. **Chỉ module `admin` dùng kết nối này** (`DATABASE_PLATFORM_URL`; thiếu thì suy từ `DATABASE_URL` với user `kb_platform`). Composition root tạo một pool riêng và chỉ trao cho `createAdminInfrastructure`. depcruise: chỉ `modules/admin/infrastructure` được đọc bảng của module khác.
3. **Chỉ số liệu tổng hợp**: use case admin không trả nội dung hồ sơ, chứng từ, tờ khai (A2 của spec). Không có repo nào trong `admin` đọc `extracted_fields`, `shipments`, `declarations.fields`, file trong storage.
4. **Mọi use case kiểm quyền bằng `staffCan()`** (bảng quyền dùng chung với FE trong `@kb/contracts`) và mọi thao tác ghi đi kèm một dòng `admin_audit` trong **cùng transaction**. `admin_audit` append-only: không có API sửa/xóa; `kb_app` không có policy nên không đọc/ghi được.
5. **Tài khoản vận hành là tài khoản người dùng thường** (`users`) có thêm một dòng `platform_staff` (vai trò `SUPER_ADMIN | SUPPORT | READONLY`, trạng thái). Đăng nhập chung trang `/login`; phiên không có org nếu người đó không thuộc doanh nghiệp nào. Quyền quản trị không phải vai trò trong `memberships` (A6).

## Hệ quả
- Một lỗ hổng trong module `admin` lộ dữ liệu của mọi doanh nghiệp → giữ module mỏng, test phân quyền cho từng use case, review kỹ mọi truy vấn mới.
- Nhà cung cấp Postgres được quản lý có thể không cho tạo role BYPASSRLS → khi đó tạo `kb_platform` bằng tay theo hướng dẫn của nhà cung cấp hoặc chuyển sang policy `kb_platform` riêng trên từng bảng.
- Chưa có 2FA cho tài khoản vận hành (B11 của spec) – bắt buộc trước khi mở cho người ngoài đội.
