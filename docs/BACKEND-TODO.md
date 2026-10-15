# Việc chưa rõ / làm sau (backend)

Ghi lại trong lúc dựng backend theo `docs/superpowers/specs/2026-10-13-backend-design.md`. Mỗi mục: cần gì, hiện tạm làm gì, ai quyết.

## Tích hợp ngoài

| # | Mục | Thiếu gì | Tạm thời | Cần |
|---|---|---|---|---|
| T1 | API FPT.VNACCS | **Đã có mẫu curl thật (2026-10-14, `docdungapivnacss/`)** cho login (`/api/auth/login` → JWT Bearer) và EDA (`/api/EDA`, tài khoản trong `objVNACCS_ACCOUNT`, phản hồi `objEDA[0]`, lỗi trong `errorList` với HTTP 200). **Còn thiếu mẫu:** IDA, EDC/IDC, HYS, IEX (đường dẫn, body, phản hồi), mã HTTP lỗi | `FptRestClient` (login → giữ token → gọi, 401 đăng nhập lại, 429/5xx/timeout retry) + `FptVnaccsGateway` theo mẫu thật; `apps/fpt-mock` giả lập đủ luồng, EDA khớp mẫu thật từng trường, phần chưa có mẫu đánh dấu `X-Mock-Assumed`; `FakeCustomsGateway` vẫn là mặc định | Curl thật cho IDA/EDC/IDC/HYS/IEX → thêm fixture, sửa mock + `FPT_PATHS`; tài khoản cổng test (không phải production) |
| T2 | hscodepro | **Đã tích hợp 2026-10-15** theo `docs/integrations/hscodepro-api-v1.md` (lượt bất đồng bộ, AI hỏi lại người khai, thuế theo C/O). Chờ HSCodePro deploy + cấp khóa để test thật | Dev/test: `HS_CLASSIFIER=fake` (catalog_hs) hoặc `hscodepro` trỏ máy giả lập `pnpm fpt-mock` (khóa `dev-hs-key`) | Khi có khóa: `HSCODEPRO_URL=https://dev.aixuatnhapkhau.cloud HSCODEPRO_INTERNAL_KEY=… pnpm hscodepro:smoke` (checklist §10), rồi bật `HS_CLASSIFIER=hscodepro` cho worker |
| T3 | Tra cứu MST (thông tin đăng ký thuế) | Cổng tra cứu của Tổng cục Thuế có captcha, chưa có API | `FakeTaxRegistryLookup`: trả "Doanh nghiệp MST …" + cờ đã tồn tại trong hệ thống | Nhà cung cấp dữ liệu doanh nghiệp (VD: API bên thứ ba) |
| T4 | Tra cứu hóa đơn điện tử | Chưa có cách lấy XML HĐĐT cước | Đọc PDF bằng AI | Quyết định có mua dịch vụ không |
| T5 | Ký số tờ khai | Chưa rõ FPT ký thay hay cần ký phía client | `submitDeclaration` chỉ kiểm chứng thư tồn tại (NO_CERT); `digital_certificates` chỉ metadata. **Tài khoản VNACCS: xong 2026-10-14** – Kết nối hệ thống → thẻ Customs Hub → "Nhập tài khoản VNACCS" (Quản trị/Chủ sở hữu), lưu mã hóa `org_secrets` kind VNACCS, gateway đọc qua `readVnaccsCredentials`; "Kiểm tra kết nối" đăng nhập API FPT thật khi `CUSTOMS_GATEWAY=fpt` | Xác nhận với FPT |
| T6 | Email | Chưa chọn nhà cung cấp SMTP production | `MAIL=console` (log) hoặc `MAIL=smtp` → Mailpit dev | Chọn SMTP (SES, SendGrid, Mailgun…) |

## Dữ liệu danh mục

| # | Mục | Thiếu gì | Tạm thời |
|---|---|---|---|
| D1 | Biểu thuế (HS 8 số, thuế suất MFN/FTA, VAT, chính sách) | HSCodePro trả thuế NK (MFN/FTA theo `co_form`) + VAT cho mã gợi ý và mã thay thế; chưa có chính sách quản lý chuyên ngành (API v1) | Xác nhận mã: thuế theo ứng viên HSCodePro → `catalog_hs` (15 dòng seed, chế độ giả) → mã nhập tay để trống thuế + ghi chú. Giảm VAT theo nghị định không áp tự động |
| D2 | Tỷ giá tính thuế theo tuần | **Xong 2026-10-15** theo NĐ 08/2015 Đ21 k5 (sửa bởi NĐ 167/2025): tỷ giá mua chuyển khoản Vietcombank cuối ngày thứ Năm tuần trước, áp cả tuần. Job `exchange-rate-weekly` thứ Năm 16:30 UTC (23:30 VN) chụp `pXML.aspx` → `exchange_rates` (`date` = thứ Hai hiệu lực, `source` VCB), thử lại mỗi 30 phút ×16 tới ~07:00 VN thứ Sáu; hết lượt → `exchange_rate_fetches` FAILED → "Cần chú ý". Khu Quản trị → Tỷ giá tính thuế: xem 8 tuần, nhập tay (MANUAL, kèm lý do, job không đè). Truyền tờ khai bị chặn `RATE_WEEK_CHANGED` khi sang tuần mới | Tỷ giá chéo NHNN cho ngoại tệ Vietcombank không công bố: nhập tay (chưa có nguồn máy đọc) |
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
| N7 | Skill của org mới / org demo | Sao chép từ 10 skill mẫu (skill ánh xạ SK-MAP-* đã bỏ 2026-10-15, migration `0010`) (org `org_system`, bảng `skills.is_template`) khi đăng ký MST mới (hook `identity.onOrgCreated`) và khi seed. Bản sao bắt đầu ở v1, 0 mẫu, chưa có độ chính xác (khác mock FE có số liệu sẵn) |

## Kỹ thuật nhỏ

| # | Mục | Hiện tại |
|---|---|---|
| K1 | `Member.lastActiveAt` của thành viên khác | Bảng `sessions` RLS chỉ lộ phiên của chính mình → chỉ người đang đăng nhập có `lastActiveAt`. Sửa sau bằng cột `users.last_seen_at` cập nhật khi touch session |
| K2 | Giới hạn đồng thời job theo org (spec §3.3) | Worker GĐ 2 dùng concurrency chung = 3; chưa giới hạn theo org |
| K3 | ClaudeAiProvider chưa được chạy thử với khóa thật | **2026-10-14:** đổi sang structured outputs (`output_config.format` từ Zod) – bản cũ ép `tool_choice` bị Sonnet 5.5/Opus 5.5 trả 400; bật `fallbacks: "default"` khi model từ chối; refusal/max_tokens → AiDataError (không retry); test bằng fetch giả. Bảng giá `MODEL_PRICING_USD_PER_MTOK` sửa theo giá hiện hành. **Đã chạy thật 2026-10-14** (Sonnet 5.5, hóa đơn 1 trang: phân loại + trích xuất đúng, ~$0.025). **Còn lại:** eval với bộ PDF thật (bộ `evals/golden/hansol` là PDF giả 1 KB) |
| K4 | Kết quả "Đánh giá lại" skill | Job `skill-evaluate` chạy nền; FE (`api/http/skills.ts`) poll `GET skills/:id/evaluation` tối đa 3 phút. GĐ 6: báo qua thông báo thay vì poll |
| K5 | Độ chính xác skill lưu `numeric(6,4)` | Làm tròn 4 chữ số; đủ cho hiển thị % |
| K6 | Thông báo trong app | Port `Notifier` (shared) → adapter identity ghi `notifications`; sự kiện: đọc xong chứng từ, agent xong, chờ duyệt (APPROVER/OWNER), đã duyệt, phân luồng, thông quan, FPT từ chối, chứng thư ≤30 ngày (job `cert-expiry` 01:00 UTC). Chưa gửi email cho các sự kiện này |
| K7 | Dashboard | Màn Tổng quan tự tính từ `GET dossiers` + session (đủ cho GĐ này); route `GET dashboard` tổng hợp để dành cho API/Enterprise |
| K8 | Eval trích xuất | **2026-10-15:** `pnpm eval --live --lot <thư mục>` chấm trên lô thật (PDF + Excel đáp án STT/Tên trường/Trị giá, `mapping.json` tùy chọn). Lô FANS25040166 (biển) + YZS24120950 (air): **73/75 = 97,3%** (trước khi có danh mục: 66,7%); 2 lệch còn lại: C/O ô 3 (đáp án kèm chữ nhãn mẫu), số C/O lô YZS (đáp án Excel sai – PDF ghi 02241416230537193). Lô thật để ngoài git (`lo mẫu/`, `evals/private/`). `pnpm eval` offline vẫn dùng bộ HANSOL giả |

## Ngoài phạm vi chuẩn trường chứng từ (2026-10-15)

| # | Mục | Ghi chú |
|---|---|---|
| V1 | AMA – tờ khai bổ sung | Đặc tả `TAI LIEU TICH HOP VNACCS/VNACCS_AMA v1.4.xlsx` (VN_AMA, VN_AMA_HANG, VAL8000…) |
| V2 | Khai danh sách container | `KHAI BAO DS CONT.xlsx` (ContainerReq/ContainerRes) – sau khi có số tờ khai |
| V3 | Đọc mã thông điệp phản hồi REP_VNACCS | `REP_VNACCS V1.1.xlsx` (VAE1LD0 phân luồng, VAE1LF0 thông quan, VAF8010 chứng từ thuế…) để hiển thị kết quả IEX chi tiết |
| V4 | Bảng đọc chứng từ chưa gộp sửa tay | Excel xuất ra là giá trị AI đọc của từng chứng từ; giá trị người khai sửa nằm ở màn kiểm tra/tờ khai |

## Khu Quản trị hệ thống (GĐ 7) – xong 2026-10-14

Chi tiết và giới hạn: `docs/superpowers/specs/2026-10-14-admin-backoffice-design.md` mục 9, ADR 0006.

| # | Mục | Hiện tại |
|---|---|---|
| A1 | 2FA cho tài khoản vận hành | **Xong 2026-10-14:** TOTP (ứng dụng xác thực) bắt buộc với mọi tài khoản quản trị; lần đầu thiết lập bằng QR + 8 mã khôi phục, mỗi phiên nhập mã 6 số (chống dùng lại mã, khóa 15 phút sau 5 lần sai); Quản trị cấp cao đặt lại 2FA cho người mất điện thoại (ghi nhật ký). Migration `0008_admin_2fa` |
| A2 | Khóa API dùng chung | Lưu mã hóa ở `platform_integrations` nhưng adapter vẫn đọc biến môi trường – chờ chốt một khóa chung hay mỗi doanh nghiệp một khóa |
| A3 | Hải quan từ chối tờ khai (IEX) | Kết quả truyền hiện "Hải quan từ chối"; hồ sơ chưa đổi trạng thái và chưa gửi thông báo – cần chốt luồng xử lý tiếp (mở lại / khai sửa) |

## Lỗi đã sửa khi tăng độ phủ test (2026-10-14)

Incoterm kèm địa danh ("FOB BUSAN") không được cộng cước; CIF có dòng "Ocean freight" bị cộng cước hai lần; "SHANGHAI"/"CHANGI" khớp nhầm sân bay Nội Bài (alias "HAN"); EDA thay im lặng cảng xếp không tra được mã bằng Hải Phòng; thông báo chứng thư sắp hết hạn gửi trùng mỗi lần chạy job; tra cứu IEX ghi đè trạng thái "bị từ chối"; IDC được chấp nhận nhưng không có phân luồng bị ghi là gửi thành công; mẫu skill không có đuôi tên tệp bị đọc như ảnh JPEG; màn Truyền hiện tờ khai bị từ chối thành "Đang kiểm tra"; bộ giới hạn đăng nhập đếm cả lần đăng nhập đúng.
