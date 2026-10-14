# Việc chưa rõ / làm sau (backend)

Ghi lại trong lúc dựng backend theo `docs/superpowers/specs/2026-10-13-backend-design.md`. Mỗi mục: cần gì, hiện tạm làm gì, ai quyết.

## Tích hợp ngoài

| # | Mục | Thiếu gì | Tạm thời | Cần |
|---|---|---|---|---|
| T1 | API FPT.VNACCS | Đặc tả trong `business/13-API-FPT-dac-ta` chỉ có tên nghiệp vụ và cấu trúc object, **không có URL endpoint, cách xác thực HTTP, mã lỗi HTTP, vỏ phản hồi chung**; tên object IDA (`objVN_IDA…`) suy từ mẫu EDA | GĐ 5: Zod `@kb/contracts/fpt` (meta từng trường + key camelCase .NET), `FptVnaccsGateway` dựng/kiểm payload, `FptHttpClientStub` ném GATEWAY_ERROR; `FakeCustomsGateway` cho dev/demo (số tờ khai theo hash, luồng 60/30/10, HYS lỗi lần đầu khi hash%7==0, thông quan sau 3 lần hỏi) | Tài khoản test + tài liệu endpoint từ FPT; xác nhận cách truyền USER_ID/PASSWORD/TERMINAL_* |
| T2 | hscodepro | Chưa có đặc tả API `/v1/classify` (tham số, kết quả, xác thực) | `FakeHsClassifier` dùng catalog HS tối thiểu | Đặc tả hoặc khóa API |
| T3 | Tra cứu MST (thông tin đăng ký thuế) | Cổng tra cứu của Tổng cục Thuế có captcha, chưa có API | `FakeTaxRegistryLookup`: trả "Doanh nghiệp MST …" + cờ đã tồn tại trong hệ thống | Nhà cung cấp dữ liệu doanh nghiệp (VD: API bên thứ ba) |
| T4 | Tra cứu hóa đơn điện tử | Chưa có cách lấy XML HĐĐT cước | Đọc PDF bằng AI | Quyết định có mua dịch vụ không |
| T5 | Ký số tờ khai | Chưa rõ FPT ký thay hay cần ký phía client | `submitDeclaration` chỉ kiểm chứng thư tồn tại (NO_CERT); `digital_certificates` chỉ metadata; tài khoản VNACCS chưa có màn nhập (org_secrets kind VNACCS) → `VnaccsCredentialsReader` trả null | Xác nhận với FPT |
| T6 | Email | Chưa chọn nhà cung cấp SMTP production | `MAIL=console` (log) hoặc `MAIL=smtp` → Mailpit dev | Chọn SMTP (SES, SendGrid, Mailgun…) |

## Dữ liệu danh mục

| # | Mục | Thiếu gì | Tạm thời |
|---|---|---|---|
| D1 | Biểu thuế (HS 8 số, thuế suất MFN/FTA, VAT, chính sách) | Không có nguồn trong repo | `catalog_hs` 15 dòng seed từ mock (`db/seed/catalogs.ts`) + `keywords` cho `FakeHsClassifier`; `HscodeproClassifier` chỉ là khung HTTP (T2) |
| D2 | Tỷ giá tính thuế theo ngày | Chưa có nguồn chính thức tự động | Bảng `exchange_rates` seed 11 tiền tệ ngày seed; tra "gần nhất ≤ ngày khai dự kiến (giờ VN)"; thiếu → chỉ tiêu tỷ giá suspect, trị giá 0, log agent cảnh báo. Chưa có màn nhập tỷ giá (admin GĐ 7) |
| D3 | Mã địa điểm lưu kho, cảng, cửa khẩu, đơn vị tính, nước, chi cục, loại hình | `DANH MUC CHUAN VNACCS.xlsx` chỉ mô tả cấu trúc, không có dữ liệu | `declaration/code-tables.ts` (contracts) nhiều mã `unverified`; cảng ~36 LOCODE trong `catalog-resolve.ts` (ưu tiên bến cụ thể trước cảng chung); thiếu mã → chỉ tiêu suspect "Không tìm thấy mã…"; mã địa điểm lưu kho (1.29) luôn nhập tay |
| D4 | Danh mục chuẩn VNACCS qua API `SyncCategory` của FPT | Phụ thuộc T1 | Seed tay |

## Nghiệp vụ cần chốt

| # | Mục | Hiện tại |
|---|---|---|
| N1 | Xác thực email trước khi dùng (ADR 0004) | Giai đoạn 1: đăng ký xong được dùng ngay (khớp màn hình); gửi email xác thực; **chưa chặn** người chưa xác thực. Sẽ chặn ở bước truyền tờ khai |
| N2 | Người dùng có yêu cầu tham gia đang chờ duyệt đăng nhập | Trả lỗi `MEMBERSHIP_PENDING`; màn đăng nhập hiện thông báo chung "Sai email hoặc mật khẩu" (cần sửa màn khi có thời gian) |
| N3 | Nguyên tắc 4 mắt (người duyệt ≠ người tạo) | `canApprove` đã có tham số `fourEyes`; org chưa có cột cấu hình → container truyền `false`. Thêm cột `organizations.four_eyes` + màn cài đặt khi chốt |
| N4 | Chính sách lưu trữ/xóa chứng từ | Chưa chốt |
| N5 | Một người thuộc nhiều doanh nghiệp | Schema cho phép; đăng nhập chọn membership ACTIVE đầu tiên; chưa có màn chọn doanh nghiệp |
| N6 | Gắn nhãn mẫu skill (GĐ 3) | Mẫu tải lên → job `skill-sample-read` cho AI đọc bằng cấu hình hiện tại → nhãn nháp (`expected`); "Xác nhận" đánh LABELED. API `PATCH skills/:id/samples/:sampleId` (`labelSample`) đã có để người duyệt sửa nhãn, **chưa có màn hình sửa nhãn** – màn OCR có thể thêm nút "Lưu làm mẫu" lấy giá trị người dùng đã xác nhận |
| N8 | Chỉ tiêu tờ khai: nhiều ô con | Catalog theo Phụ lục II: 1.44/2.39 gồm 4 ô (phân loại giá, Incoterm, mã tiền, tổng trị giá) – UI tách thành 4 chỉ tiêu `code` riêng cùng `no`; payload FPT (GĐ 5) ghép lại theo `fptField` |
| N9 | Sửa tay chỉ tiêu tờ khai | API `PATCH dossiers/:id/declaration/fields/:code` đã có (nguồn USER, audit DECL_EDIT, giữ khi dựng lại) – màn Review chưa có ô sửa |
| N10 | Mở lại tờ khai (reopen) | API `POST dossiers/:id/declaration/reopen` (tờ khai → DRAFT, hồ sơ → review) khi đã duyệt chưa truyền hoặc FPT từ chối khai trước; màn Review chưa có nút |
| N7 | Skill của org mới / org demo | Sao chép từ 12 skill mẫu (org `org_system`, bảng `skills.is_template`) khi đăng ký MST mới (hook `identity.onOrgCreated`) và khi seed. Bản sao bắt đầu ở v1, 0 mẫu, chưa có độ chính xác (khác mock FE có số liệu sẵn) |

## Kỹ thuật nhỏ

| # | Mục | Hiện tại |
|---|---|---|
| K1 | `Member.lastActiveAt` của thành viên khác | Bảng `sessions` RLS chỉ lộ phiên của chính mình → chỉ người đang đăng nhập có `lastActiveAt`. Sửa sau bằng cột `users.last_seen_at` cập nhật khi touch session |
| K2 | Giới hạn đồng thời job theo org (spec §3.3) | Worker GĐ 2 dùng concurrency chung = 3; chưa giới hạn theo org |
| K3 | ClaudeAiProvider chưa được chạy thử với khóa thật | Cần `ANTHROPIC_API_KEY` + 1 PDF thật; FakeAiProvider dùng cho dev/test. Vị trí (region) chỉ có khi fixture cung cấp |
| K4 | Kết quả "Đánh giá lại" skill | Job `skill-evaluate` chạy nền; FE (`api/http/skills.ts`) poll `GET skills/:id/evaluation` tối đa 3 phút. GĐ 6: báo qua thông báo thay vì poll |
| K5 | Độ chính xác skill lưu `numeric(6,4)` | Làm tròn 4 chữ số; đủ cho hiển thị % |
| K6 | Thông báo trong app | Port `Notifier` (shared) → adapter identity ghi `notifications`; sự kiện: đọc xong chứng từ, agent xong, chờ duyệt (APPROVER/OWNER), đã duyệt, phân luồng, thông quan, FPT từ chối, chứng thư ≤30 ngày (job `cert-expiry` 01:00 UTC). Chưa gửi email cho các sự kiện này |
| K7 | Dashboard | Màn Tổng quan tự tính từ `GET dossiers` + session (đủ cho GĐ này); route `GET dashboard` tổng hợp để dành cho API/Enterprise |
| K8 | Eval trích xuất | `pnpm eval` offline chỉ có 1 lô HANSOL (PDF giả 1 KB + bộ dữ liệu cố định của FakeAiProvider) → thêm PDF thật + `--live` khi có khóa Claude; ngưỡng fail < 90% |
