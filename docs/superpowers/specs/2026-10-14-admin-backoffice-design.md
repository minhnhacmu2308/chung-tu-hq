# Khu Quản trị hệ thống (back-office của đội vận hành)

> Ngày: 2026-10-14 · Trạng thái: FE + backend xong. Backend: module `packages/core/src/modules/admin`, route `/api/admin/**`, role DB `kb_platform` (ADR 0006), migration `0007_admin`.
> FE chọn mock|http theo `NEXT_PUBLIC_DATA_SOURCE` như các màn khác. Mục 6 bên dưới mô tả bản mock; giới hạn còn lại của bản thật ở mục 9.

## 1. Mục tiêu

Đội KhaiBáo AI có một nơi nhìn xuyên mọi doanh nghiệp khách hàng và xử lý việc vận hành mà trước đây phải vào thẳng cơ sở dữ liệu: khóa/mở doanh nghiệp và người dùng, đổi gói, nới hạn mức, theo dõi chi phí AI, cập nhật khóa API dùng chung, chạy lại job lỗi, gửi thông báo tới khách.

## 2. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| A1 | Đối tượng là **đội vận hành KhaiBáo AI**, không phải Owner/Admin của doanh nghiệp (phần đó đã có ở `/settings`) | Chưa có màn nào nhìn xuyên doanh nghiệp |
| A2 | Vận hành **chỉ thấy số liệu tổng hợp**: số hồ sơ, số trang, chi phí, trạng thái, lỗi job. Không mở được nội dung hồ sơ, chứng từ, tờ khai | Dữ liệu thương mại của khách; giữ tinh thần tách org của ADR 0004 |
| A3 | **Ba vai trò nội bộ cố định**: Quản trị cấp cao · Hỗ trợ · Chỉ xem (bảng quyền `STAFF_PERMISSIONS` trong `@kb/contracts`) | Đội nhỏ; cùng kiểu với 5 vai trò cố định bên doanh nghiệp |
| A4 | Nằm ở **`/admin` trong `apps/web`**, route group `(admin)` với khung `AdminShell` riêng | Dùng lại hạ tầng; mock chung nên demo trọn vòng admin ↔ app khách |
| A5 | **Dùng chung trang đăng nhập `/login`**. Quyền quản trị là thuộc tính của *tài khoản*; đăng nhập xong tự về đúng khu; menu hiện theo quyền | Một luồng đăng nhập, đơn giản cho người dùng |
| A6 | Quyền quản trị **không** là vai trò thứ 6 trong doanh nghiệp | Nếu chung danh sách vai trò, Owner của một doanh nghiệp có thể tự gán và thấy mọi doanh nghiệp khác |
| A7 | Mọi thao tác ghi ảnh hưởng tới khách hoặc cấu hình **bắt nhập lý do** và ghi **nhật ký quản trị** (append-only) | Truy vết ai làm gì, vì sao |
| A8 | Thao tác vai trò không được làm thì **ẩn hẳn** trên giao diện; lớp dữ liệu vẫn chặn lần nữa | Không hiện nút rồi báo lỗi |

Ngoại lệ của A7: *mời quản trị viên* và *gửi thông báo* tự ghi nhật ký kèm nội dung, không hỏi thêm lý do.

## 3. Màn hình

| Nhóm | Màn | Đường dẫn | Thao tác (quyền cần) |
|---|---|---|---|
| — | Tổng quan vận hành | `/admin` | — |
| Khách hàng | Doanh nghiệp | `/admin/orgs` | Tạm khóa / mở khóa (SUPPORT) |
| | Chi tiết doanh nghiệp (5 tab: Tổng quan, Thành viên, Gói & sử dụng, Kết nối & chứng thư, Nhật ký) | `/admin/orgs/[id]?tab=` | + Đổi gói, nới hạn mức, gia hạn dùng thử (BILLING) |
| | Người dùng (+ panel chi tiết) | `/admin/users?view=` | Khóa/mở, gửi đặt lại mật khẩu, gửi lại xác thực, đăng xuất mọi phiên (SUPPORT) |
| Gói & chi phí | Gói dịch vụ | `/admin/plans` | Sửa gói (BILLING) |
| | Sử dụng & chi phí | `/admin/usage?month=` | — |
| Vận hành | Tích hợp dùng chung | `/admin/integrations` | Kiểm tra (SUPPORT), cập nhật khóa API (PLATFORM) |
| | Sức khỏe hệ thống | `/admin/system` | Chạy lại job (SUPPORT) |
| | Skill mẫu | `/admin/skill-templates` | Phát hành / ngừng phát hành (PLATFORM) |
| Kiểm soát | Quản trị viên | `/admin/staff` | Mời, đổi vai trò, khóa (STAFF) |
| | Nhật ký quản trị | `/admin/audit?from=&to=` | — |
| | Thông báo hệ thống | `/admin/announcements` | Soạn, thu hồi (SUPPORT) |

"Yêu cầu tham gia đang treo" là một nhóm lọc trong màn Người dùng, không phải màn riêng: việc duyệt vẫn thuộc Owner của doanh nghiệp (ADR 0004), vận hành chỉ nhìn thấy để nhắc.

## 4. Cấu trúc mã

```
packages/contracts/src/dto/admin.ts        schema dữ liệu + bảng quyền STAFF_PERMISSIONS, staffCan()
packages/contracts/src/api/admin.ts        schema input (AdminReasonSchema và các input có lý do)
packages/ui/src/components/feedback.tsx    thêm trạng thái ACCOUNT_*, ORG_*, INTEGRATION_*, SERVICE_*, ANNOUNCEMENT_*, TEMPLATE_* vào STATUS_META

apps/web/src/app/(admin)/                  layout (AdminShell) + page mỏng cho từng màn
apps/web/src/features/admin/
  shell/        AdminShell (menu, kiểm tra quyền), useAdminSession() → { staff, can(permission) }
  common/       ReasonDialog (hộp xác nhận kèm lý do), useAdminMutation, QuotaMeter, admin-display (nhãn, quotaState)
  <màn>/        overview, orgs, users, plans, usage, integrations, system, skill-templates, staff, audit, announcements
apps/web/src/api/admin.ts                  cửa dữ liệu cho màn hình (hiện chỉ có mock)
apps/web/src/mocks/admin/ops.ts            nghiệp vụ mock dạng hàm thuần trên "DB" – có test (ops.test.ts)
apps/web/src/mocks/admin/types.ts          phần `admin` của MockDb
apps/web/src/mocks/seed/admin.ts           dữ liệu mẫu: 11 doanh nghiệp + doanh nghiệp demo, 4 quản trị viên…
```

Ranh giới (depcruise): `features/admin` không import màn hình của khách (chỉ mượn `features/appearance`); màn của khách không import `features/admin`. Giữ để sau này tách thành app riêng được.

## 5. Dữ liệu mock và vòng khép với ứng dụng khách

Doanh nghiệp demo (`db.org`, `db.members`) được ghép vào danh sách của admin lúc đọc và được ghi thẳng khi thao tác. Nhờ vậy:

- Đổi gói / sửa hạn mức gói ở admin → app khách thấy gói mới.
- Khóa một thành viên của doanh nghiệp demo → màn Thành viên của khách thấy đã khóa.
- Gửi thông báo hệ thống → hiện trong panel Thông báo của khách; thu hồi → biến mất.

Đăng nhập: `mocks/api/session.ts → login()` nhận cả email của quản trị viên. Tài khoản mẫu (mật khẩu bất kỳ ≥ 6 ký tự): `bao.hoang@` (Cấp cao), `trang.mai@` (Hỗ trợ), `viet.dinh@khaibao-demo.vn` (Chỉ xem).

## 6. Giới hạn của bản này (nói thẳng)

1. **Chưa có backend.** `api/admin.ts` chỉ trỏ tới mock. Khi `NEXT_PUBLIC_DATA_SOURCE=http`, khu `/admin` vẫn chạy dữ liệu mẫu và hiện cảnh báo vàng ở đầu trang.
2. **Kiểm tra quyền mới ở phía trình duyệt** (AdminShell + lớp mock). `src/proxy.ts` chưa biết tới `/admin`. Đây không phải lớp bảo mật – backend phải chặn ở từng API.
3. **Tạm khóa doanh nghiệp chưa chặn được khách** trong bản mock: trạng thái đổi ở admin nhưng `OrganizationSchema` chưa có trường trạng thái nên app khách chưa hiện gì.
4. Tài khoản vận hành trong mock là tài khoản thuần vận hành (không thuộc doanh nghiệp nào); mở khu khai báo sẽ bị đưa về `/admin`.
5. Doanh nghiệp mẫu (ngoài doanh nghiệp demo) không có dữ liệu kết nối/chứng thư riêng → tab đó hiện trạng thái trống.
6. Số liệu sử dụng của các tháng cũ là số mô phỏng ổn định, không lấy từ `usage_events`.
7. Soạn nội dung skill mẫu (trường, alias, ví dụ) nằm ngoài phạm vi; màn Skill mẫu chỉ quản lý việc phát hành.

## 7. Việc backend cần làm khi tới lượt

| # | Việc | Ghi chú |
|---|---|---|
| B1 | Cờ quyền quản trị trên tài khoản (vd `users.platform_role` nullable) | Không đặt trong `memberships.role` (A6) |
| B2 | Phiên: `/api/admin/session` đọc cùng cookie `kb_session`, trả `AdminSession` hoặc 401 | `proxy.ts` chặn `/admin` khi không có quyền |
| B3 | Module mới (vd `admin`) với use case xuyên org – **đi vòng RLS có kiểm soát**, mỗi use case kiểm `staffCan()` | Cần ADR: đây là nơi duy nhất được đọc xuyên org |
| B4 | Bảng `admin_audit` append-only; mọi use case ghi trong cùng transaction | Schema: `AdminAuditEntrySchema` |
| B5 | `organizations.status` + chặn đăng nhập/thao tác khi SUSPENDED; thêm trạng thái vào `OrganizationSchema` | Gỡ giới hạn #3 |
| B6 | Nới hạn mức theo kỳ (`quota_bonus` gắn với kỳ thanh toán) | Tự hết khi sang kỳ |
| B7 | Báo cáo sử dụng tổng hợp từ `usage_events` theo (org, tháng, loại lệnh gọi) | Tiền tính bằng Decimal |
| B8 | Khóa API dùng chung lưu trong secret store hiện có; API chỉ trả 4 ký tự cuối | Câu hỏi mở #3 của PRODUCT.md (một khóa chung hay mỗi doanh nghiệp một khóa) cần chốt trước |
| B9 | Sức khỏe hệ thống: đọc BullMQ (đếm, job lỗi, retry) + health check hiện có | Thông báo lỗi job phải được lọc, không lộ tên file |
| B10 | Thông báo hệ thống → fan-out vào `notifications` của từng org; thu hồi xóa theo `announcement_id` | |
| B11 | Bắt 2FA cho tài khoản có quyền quản trị | Vì dùng chung phiên đăng nhập với app (A5) |

## 8. Kiểm thử đã có

- `packages/contracts`: `dto/admin.test.ts` – bảng quyền, schema, input.
- `apps/web`: `mocks/admin/ops.test.ts` – phân quyền theo vai trò, lý do bắt buộc, nhật ký, từng nhóm nghiệp vụ, vòng khép với doanh nghiệp demo; `features/admin/common/admin-display.test.ts`, `features/admin/users/user-actions.test.ts` – logic thuần của màn hình.
- Đã mở bằng trình duyệt thật: 17 trạng thái màn × sáng/tối × 1366px/390px, không tràn ngang, không lỗi console; chạy tay các luồng đăng nhập chung, khóa doanh nghiệp, đổi gói, gửi thông báo, vai trò Chỉ xem, chặn tài khoản khách vào `/admin`.
- Chưa có: test Playwright e2e lưu trong repo cho khu `/admin`.

## 9. Bản backend (2026-10-14)

Đã làm B1–B10 của mục 7:

- **Tài khoản vận hành**: bảng `platform_staff` (vai trò, trạng thái) gắn với `users`; đăng nhập chung `/login`, phiên không có org nếu người đó không thuộc doanh nghiệp nào. Mời → tạo tài khoản + liên kết đặt mật khẩu 7 ngày, `INVITED` thành `ACTIVE` ở lần đăng nhập đầu. Tài khoản mẫu (mật khẩu `demo1234`): `bao.hoang@` (Cấp cao), `trang.mai@` (Hỗ trợ), `viet.dinh@khaibao-demo.vn` (Chỉ xem).
- **Quyền**: mọi use case kiểm `staffCan()`; route `/api/admin/**` 401 khi chưa đăng nhập, 403 khi không phải quản trị viên. `GET /api/admin/session` trả `{ session: null }` cho tài khoản khách (để app khách biết không chuyển sang `/admin`).
- **Tạm khóa doanh nghiệp** chặn thật: đăng nhập trả `ORG_SUSPENDED`, phiên đang mở hết hiệu lực ngay; mở lại thì phiên cũ dùng tiếp.
- **Nới hạn mức** chỉ có hiệu lực đúng tháng (giờ VN) đã nới; kiểm tra hạn mức ở web và worker đều cộng phần nới. **Đổi gói** bắt đầu kỳ 30 ngày mới. **Gia hạn dùng thử** lưu `trial_ends_at`.
- **Báo cáo chi phí** tổng hợp từ `usage_events` (AI_* = đọc chứng từ, HS_* = gợi ý HS, CUSTOMS_* = Customs Hub), hồ sơ/trang từ bảng dossiers/documents, tiền bằng Decimal.
- **Khóa tích hợp dùng chung** mã hóa bằng `APP_MASTER_KEY` trong `platform_integrations`, API chỉ trả 4 ký tự cuối, lưu xong gọi thử ngay.
- **Sức khỏe hệ thống** đọc BullMQ thật (đếm, job lỗi, chạy lại); lỗi job được lọc bỏ đường dẫn/tên tệp trước khi hiện.
- **Skill mẫu**: cột `skills.published`; doanh nghiệp mới chỉ nhận bản sao của skill mẫu đang phát hành.
- **Thông báo hệ thống**: bảng `announcements`, bản sao vào `notifications` của mọi thành viên đang hoạt động (cột `announcement_id`), thu hồi xóa theo cột này; doanh nghiệp tạm khóa không nhận.
- **Nhật ký** `admin_audit` append-only, ghi cùng transaction với thao tác.

Kiểm thử: `packages/core/src/flows/admin.int.test.ts` (Postgres thật: kb_app không đọc được bảng admin, phân quyền, tạm khóa chặn đăng nhập, hạn mức, khóa API không lộ, thông báo tới khách rồi thu hồi), `modules/admin/domain/__tests__`, e2e `apps/web/e2e/admin.spec.ts`.

Còn lại:

1. ~~B11 – 2FA~~ **Xong:** TOTP bắt buộc. Đăng nhập chung `/login` không đổi; khu `/admin` hiện bước thiết lập (QR + khóa nhập tay → mã đầu tiên → 8 mã khôi phục chỉ hiện một lần) hoặc nhập mã 6 số cho mỗi phiên. Chưa qua bước này mọi API quản trị trả `MFA_REQUIRED` (403). Khóa TOTP mã hóa bằng `APP_MASTER_KEY`, mã khôi phục lưu hash, không dùng lại được mã đã dùng, 5 lần sai trong 15 phút → khóa tạm. Quản trị cấp cao "Đặt lại xác thực 2 lớp" ở màn Quản trị viên (người đó bị đăng xuất). Bản mock không có 2FA.
2. **Khóa API lưu ở admin chưa được adapter dùng**: hscodepro/Customs Hub/AI vẫn đọc khóa từ biến môi trường (câu hỏi mở #3 của PRODUCT.md – một khóa chung hay mỗi doanh nghiệp một khóa – chưa chốt). "Kiểm tra" chỉ gọi thử thật với AI (Claude); nhà cung cấp khác báo "chưa có đặc tả API".
3. Doanh thu trong báo cáo = giá gói hiện tại (chưa có lịch sử giá/hóa đơn) – tháng cũ chỉ là xấp xỉ.
4. Tháng hạn mức của khách (màn của khách và kiểm tra hạn mức) đang tính theo tháng UTC, phần nới thêm theo tháng giờ VN – lệch tối đa 7 giờ ở ranh giới tháng.
