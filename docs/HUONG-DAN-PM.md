# Hướng dẫn cho PM – chạy và chỉnh giao diện KhaiBáo AI

Bản này là **prototype giao diện chạy dữ liệu giả**: bấm được hết các màn, thao tác được (tạo hồ sơ, upload, sửa trường, duyệt, truyền Hải quan…), nhưng chưa có backend và chưa gọi AI thật. Mọi thứ bạn chỉnh ở đây sẽ được giữ lại khi nối backend.

## 1. Chạy lần đầu (khoảng 5 phút)

Cần: **Node.js 22+** (tải ở nodejs.org). Mở terminal tại thư mục `khaibao-ai`:

```bash
npx pnpm@10 install      # cài thư viện (một lần)
npx pnpm@10 dev:web      # chạy ứng dụng
```

Mở **http://localhost:3100**. Trang đăng nhập nhận email bất kỳ + mật khẩu từ 6 ký tự.

Xem toàn bộ component (nút, bảng, form, hộp thoại…) và thử cấu hình giao diện: `npx pnpm@10 ui:playground` → http://localhost:5180.

## 2. Đi một vòng demo

| # | Làm gì | Ở đâu |
|---|---|---|
| 1 | Xem tổng quan: hồ sơ sắp hạn, kết quả phân luồng | Tổng quan |
| 2 | Mở hồ sơ **HANSOL PRECISION** (nhập khẩu, hạn ngày mai) | Hồ sơ khai báo → Nhập khẩu |
| 3 | Bước 3 – OCR & kiểm tra: rê chuột vào trường để thấy vị trí trên chứng từ, sửa hoặc bấm **Đúng** | Thanh 6 bước |
| 4 | Bấm **Xem cây quy trình** để xem sơ đồ các bước | Đầu trang hồ sơ |
| 5 | Bước 4 – AI Agent: xem tiến trình, xác nhận mã HS | |
| 6 | Bước 5 – Review tờ khai, **Phê duyệt** | |
| 7 | Bước 6 – chọn chứng thư số, **Truyền tờ khai**, xem phân luồng + nhật ký thông điệp | |
| 8 | Tạo hồ sơ mới, upload file PDF bất kỳ | Hồ sơ khai báo → Tạo hồ sơ |
| 9 | Bật/tắt trường cần trích xuất cho từng loại chứng từ | Cấu hình Skill AI |
| 10 | Đổi màu thương hiệu, sáng/tối, mật độ, font | Menu trái → **Giao diện** |
| 11 | Hỏi trợ lý AI (câu trả lời là mẫu) | Nút tròn góc phải dưới |

Muốn quay về dữ liệu ban đầu: menu người dùng (góc trái dưới) → **Khôi phục dữ liệu mẫu**.

## 3. Muốn đổi gì – sửa ở đâu

| Muốn đổi | Sửa ở | Ghi chú |
|---|---|---|
| Màu thương hiệu, font, bo góc, mật độ **mặc định** | `packages/ui/src/theme/appearance.ts` (`DEFAULT_APPEARANCE`) | Thử trước bằng nút **Giao diện** cho nhanh |
| Bảng màu nền/chữ/viền/trạng thái | `packages/ui/src/styles/tokens.css` | Mọi màn đổi theo, sáng và tối |
| Kiểu dáng một loại thành phần (mọi nút, mọi bảng…) | `packages/ui/src/components/<tên>.tsx` | Đổi một chỗ, cả hệ thống đổi |
| Bố cục, nội dung, câu chữ một màn | `apps/web/src/features/<màn>/` | Xem bảng §4 |
| Menu trái, thông báo, trợ lý AI | `apps/web/src/features/shell/` + `features/assistant/` | |
| Dữ liệu demo (tên công ty, hồ sơ, số liệu) | `apps/web/src/mocks/seed/` | Đổi cấu trúc → tăng `DB_VERSION` trong `src/mocks/db.ts` |
| Thêm màn mới | `apps/web/src/app/(app)/<đường-dẫn>/page.tsx` + `features/<màn>/` | Thêm mục menu trong `features/shell/app-shell.tsx` |

## 4. Bản đồ màn hình

| Màn | Đường dẫn | Thư mục |
|---|---|---|
| Đăng nhập / Đăng ký | `/login`, `/register` | `features/auth` |
| Tổng quan | `/` | `features/dashboard` |
| Danh sách hồ sơ | `/dossiers` (`?direction=NK` / `XK`) | `features/dossiers` |
| Tạo hồ sơ (bước 1) | `/dossiers/new` | `features/dossiers` |
| Chi tiết hồ sơ + 6 bước | `/dossiers/<id>?step=upload\|ocr\|agent\|review\|submit` | `features/dossier-detail` (từng bước trong `steps/`) |
| Khai báo Hải quan | `/customs` | `features/customs` |
| Cấu hình Skill AI | `/skills`, `/skills/<id>` | `features/skills` |
| Tài khoản & tích hợp | `/settings?tab=…` | `features/settings` |

## 5. "Vibe" chỉnh giao diện bằng Claude Code

Mở Claude Code tại thư mục `khaibao-ai` rồi mô tả điều bạn muốn. Dự án đã có sẵn luật (`CLAUDE.md`) và skill, nên AI sẽ tự sửa đúng chỗ. Ví dụ:

- "Màn Tổng quan: đưa danh sách *Cần xử lý* lên đầu, KPI thu gọn thành một hàng nhỏ."
- "Đổi màu thương hiệu mặc định sang xanh dương, bo góc tròn hơn cho toàn hệ thống."
- "Màn OCR: cho khung chứng từ gốc rộng hơn, cột kết quả hẹp lại; trên mobile chứng từ nằm dưới."
- "Thêm cột *Người tạo* vào bảng hồ sơ và cho lọc theo cột đó."
- "Thêm màn *Báo cáo* ở menu trái, có biểu đồ số tờ khai theo tháng (dữ liệu giả)."

Vài luật hệ thống sẽ **chặn** (để toàn hệ thống đồng bộ, khách hàng tự đổi màu được):
không ghi mã màu trực tiếp, không dùng màu mặc định của Tailwind, không kích thước tùy ý kiểu `w-[123px]`, không style inline, không tự viết nút/ô nhập thô. Cần thứ gì chưa có → nhờ AI "thêm vào @kb/ui".

Sau khi chỉnh, kiểm tra:

```bash
npx pnpm@10 typecheck && npx pnpm@10 lint
```

Cả hai xanh là thay đổi hợp lệ.

## 6. Giới hạn của bản prototype

- Không có backend: dữ liệu lưu trong trình duyệt (localStorage), mỗi máy một bản.
- File upload không được đọc thật; kết quả OCR, mã HS, phân luồng Hải quan là dữ liệu mẫu.
- Đăng nhập không kiểm tra thật; trợ lý AI trả lời theo kịch bản.
- Chứng từ gốc ở màn OCR là bản dựng lại để minh họa, không phải PDF thật.
