# ADR 0004 – Multi-tenant: mỗi doanh nghiệp là một tenant, người dùng là nhân viên của doanh nghiệp

- Trạng thái: Chấp nhận
- Ngày: 2026-10-12

## Bối cảnh
Khách hàng mục tiêu là doanh nghiệp xuất nhập khẩu tự khai báo. Nhân viên khai báo của doanh nghiệp dùng hệ thống. Chưa phục vụ đại lý hải quan khai hộ nhiều doanh nghiệp.

## Quyết định

**Tách dữ liệu:** một DB dùng chung, mọi bảng nghiệp vụ có `org_id`, bật Row-Level Security. File lưu dưới `orgs/{orgId}/`. Hàng đợi giới hạn đồng thời theo org. `usage_events` theo org.

**Organization = một doanh nghiệp = một MST.** MST là duy nhất trên toàn hệ thống. Người khai (người nhập khẩu / xuất khẩu) trên tờ khai chính là organization.

**Đăng ký:**
1. Người đăng ký tạo tài khoản bằng email + mật khẩu, xác thực email.
2. Nhập MST → kiểm tra định dạng, điền sẵn tên/địa chỉ từ thông tin đăng ký thuế.
3. MST chưa tồn tại → tạo organization, người đăng ký là `OWNER`, kích hoạt gói dùng thử.
4. MST đã tồn tại → gửi yêu cầu tham gia cho Owner duyệt. Không tạo trùng.
5. Owner/Admin mời nhân viên qua email.

**Đăng nhập chỉ bằng email.** MST là định danh doanh nghiệp, không phải tài khoản cá nhân.

**Vai trò:**

| Vai trò | Quyền |
|---|---|
| `OWNER` | Toàn quyền, gói & thanh toán, chuyển quyền sở hữu |
| `ADMIN` | Thành viên, cấu hình skill, tích hợp |
| `DECLARANT` | Tạo hồ sơ, upload, sửa dữ liệu, dựng tờ khai |
| `APPROVER` | Duyệt và truyền tờ khai |
| `VIEWER` | Chỉ xem |

**Dữ liệu:**

```
users ──< memberships (role) >── organizations (mst UNIQUE, plan, quota)
                                     ├──< dossiers
                                     ├──< skills / skill_versions / skill_examples
                                     └──< usage_events
```

Giữ bảng `memberships` (thay vì `users.org_id`) dù hiện mỗi người chỉ thuộc 1 doanh nghiệp: chi phí gần như bằng 0, không phải migrate nếu sau này cần một người thuộc nhiều doanh nghiệp.

**Skill:** riêng từng organization + bộ skill mẫu (template) dùng chung do hệ thống cung cấp. Không chia sẻ dữ liệu hay ví dụ giữa các organization.

## Không làm (ở giai đoạn này)
- Đại lý hải quan khai hộ nhiều doanh nghiệp (cần thêm `declarant_profiles`; sẽ viết ADR mới nếu làm).
- DB riêng cho từng doanh nghiệp (chỉ khi có khách Enterprise yêu cầu).

## Hệ quả
- (+) Mô hình đơn giản, đúng với khách mục tiêu, UI không cần chọn "khai cho ai".
- (−) Muốn phục vụ đại lý sau này phải thêm khái niệm declarant profile và gắn vào dossier.
