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
| N2 | Người dùng có yêu cầu tham gia đang chờ duyệt đăng nhập | **Xong 2026-10-14:** màn đăng nhập hiện lý do từ backend cho `MEMBERSHIP_PENDING` / `MEMBERSHIP_DISABLED` / `NO_ORGANIZATION` / `RATE_LIMITED` (các mã chỉ trả sau khi mật khẩu đúng); sai email/mật khẩu vẫn giữ câu chung (`features/auth/login-error.ts`) |
| N3 | Nguyên tắc 4 mắt (người duyệt ≠ người tạo) | **Xong 2026-10-14:** cột `organizations.four_eyes` (migration 0006), `PATCH org/four-eyes` (Quản trị/Chủ sở hữu), công tắc ở Cài đặt → Tùy chọn; màn Review khóa nút duyệt và giải thích khi người tạo tự duyệt. Chủ sở hữu được miễn |
| N4 | Chính sách lưu trữ/xóa chứng từ | Chưa chốt |
| N5 | Một người thuộc nhiều doanh nghiệp | Schema cho phép; đăng nhập chọn membership ACTIVE đầu tiên; chưa có màn chọn doanh nghiệp |
| N6 | Gắn nhãn mẫu skill (GĐ 3) | Mẫu tải lên → job `skill-sample-read` cho AI đọc → nhãn nháp (`expected`). **Xong 2026-10-14:** `GET skills/:id/samples/:sampleId` trả mẫu kèm nhãn; màn Skill → Mẫu có nút "Gắn nhãn / Sửa nhãn" mở hộp thoại sửa các trường vô hướng rồi `PATCH` (`labelSample`). **Còn lại:** trường có cấu trúc (bên mua/bán, bảng hàng) chưa sửa được; chưa xem được file mẫu cạnh form; nút "Lưu làm mẫu" từ màn OCR chưa làm |
| N8 | Chỉ tiêu tờ khai: nhiều ô con | Catalog theo Phụ lục II: 1.44/2.39 gồm 4 ô (phân loại giá, Incoterm, mã tiền, tổng trị giá) – UI tách thành 4 chỉ tiêu `code` riêng cùng `no`; payload FPT (GĐ 5) ghép lại theo `fptField` |
| N9 | Sửa tay chỉ tiêu tờ khai | **Xong 2026-10-14:** màn Review có nút Sửa từng chỉ tiêu khi tờ khai còn nháp (nguồn USER, audit DECL_EDIT, giữ khi dựng lại). Luật `canEditField`: `DERIVED_DECLARATION_FIELD_CODES` không sửa tay (số tờ khai, mã loại hình, và đầu vào tính thuế: điều kiện giá, tiền tệ, tổng trị giá, tỷ giá, phí VC/BH, khoản điều chỉnh – sửa ở bước đọc chứng từ); chỉ tiêu bắt buộc không để trống; số/ngày đúng dạng theo catalog. **Còn lại:** chỉ tiêu kiểu mã chưa kiểm theo bảng mã; chỉ tiêu dòng hàng chưa sửa được |
| N10 | Mở lại tờ khai (reopen) | **Xong 2026-10-14:** màn Review có nút "Mở lại để sửa" khi tờ khai đã duyệt chưa truyền. **Còn lại:** trường hợp FPT từ chối khai trước (tờ khai SUBMITTED, chưa có số) backend cho mở lại nhưng màn Truyền chưa có nút |
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

## Khu Quản trị hệ thống (GĐ 7) – xong 2026-10-14

Chi tiết và giới hạn: `docs/superpowers/specs/2026-10-14-admin-backoffice-design.md` mục 9, ADR 0006.

| # | Mục | Hiện tại |
|---|---|---|
| A1 | 2FA cho tài khoản vận hành | **Xong 2026-10-14:** TOTP (ứng dụng xác thực) bắt buộc với mọi tài khoản quản trị; lần đầu thiết lập bằng QR + 8 mã khôi phục, mỗi phiên nhập mã 6 số (chống dùng lại mã, khóa 15 phút sau 5 lần sai); Quản trị cấp cao đặt lại 2FA cho người mất điện thoại (ghi nhật ký). Migration `0008_admin_2fa` |
| A2 | Khóa API dùng chung | Lưu mã hóa ở `platform_integrations` nhưng adapter vẫn đọc biến môi trường – chờ chốt một khóa chung hay mỗi doanh nghiệp một khóa |
| A3 | Hải quan từ chối tờ khai (IEX) | Kết quả truyền hiện "Hải quan từ chối"; hồ sơ chưa đổi trạng thái và chưa gửi thông báo – cần chốt luồng xử lý tiếp (mở lại / khai sửa) |

## Lỗi đã sửa khi tăng độ phủ test (2026-10-14)

Incoterm kèm địa danh ("FOB BUSAN") không được cộng cước; CIF có dòng "Ocean freight" bị cộng cước hai lần; "SHANGHAI"/"CHANGI" khớp nhầm sân bay Nội Bài (alias "HAN"); EDA thay im lặng cảng xếp không tra được mã bằng Hải Phòng; thông báo chứng thư sắp hết hạn gửi trùng mỗi lần chạy job; tra cứu IEX ghi đè trạng thái "bị từ chối"; IDC được chấp nhận nhưng không có phân luồng bị ghi là gửi thành công; mẫu skill không có đuôi tên tệp bị đọc như ảnh JPEG; màn Truyền hiện tờ khai bị từ chối thành "Đang kiểm tra"; bộ giới hạn đăng nhập đếm cả lần đăng nhập đúng.
