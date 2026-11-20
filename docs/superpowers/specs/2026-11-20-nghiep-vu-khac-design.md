# Nghiệp vụ khác – nghiệp vụ phụ trợ thông quan (thiết kế)

- Ngày: 2026-11-20 · Trạng thái: đã chốt nghiệp vụ, chưa code
- Quyết định kiến trúc: ADR 0020. Quy tắc khi thêm loại mới: `.claude/rules/nghiep-vu-khac.md`.

## 1. Mục tiêu

Menu **Nghiệp vụ khác** (dưới khu Hải quan) có màn danh sách để khai trước, theo dõi, tìm kiếm, quản lý các nghiệp vụ phụ trợ thông quan.
Lý do: hệ thống tiếp nhận của Hải quan hay lỗi; đợi mở tờ khai mới khai thì trễ, tờ khai không thông quan kịp.

## 2. Phân loại theo số tờ khai (bắt buộc cho mọi loại)

| Nhóm | Loại nghiệp vụ | Cổng / API | Trạng thái nối |
|---|---|---|---|
| **A. Không cần số tờ khai** – khai độc lập, gắn hồ sơ sau | Khai báo định danh | FPT `V5IdentifierReq/Res` | Đã nối (đang gắn hồ sơ – cần tách) |
| | Chia tách vận đơn | FPT `TachVanDonReq/Res` | Chưa nối |
| | HYS (số tiếp nhận ghi vào 1.63/2.53) | FPT `hys` | Đã nối (đang gắn hồ sơ) |
| | Đăng ký ngoài giờ | Cổng V5 Hải quan; **chưa có trong tài liệu FPT** `docs/vnaccs-api/` | Chờ FPT; trước mắt ghi nhận tay |
| **B. Cần số tờ khai** – tạo phải có số tờ khai (nhập tay hoặc chọn hồ sơ) | Danh sách container | FPT `V5ContainerReq/Res` | Đã nối |
| | KVGS (sau thông quan) | FPT `KVGS` | Đã nối |
| | Lệ phí cơ sở hạ tầng | Cổng thu phí của cảng, không qua FPT | Ghi nhận tay |
| | Gửi hàng vào kho CFS | Chưa có API FPT | Ghi nhận tay |

Nhóm B kiểm đủ bộ số tờ khai + ngày đăng ký + chi cục lúc tạo. Thêm loại mới: xem `.claude/rules/nghiep-vu-khac.md`.

## 3. Mô hình dữ liệu

- Bảng chung `customs_ops`: `org_id`, `type`, `status`, `bill_no`, `container_nos`, `declaration_no`, `customs_office`, `receipt_no`, `result_no`,
  `dossier_id` (trống được), `payload` jsonb (Zod discriminated union theo `type` – bất biến 9), `idempotency_key`, `attempt`, `error`, `created_by`, thời điểm.
- Bảng chi tiết có sẵn giữ nguyên, ghi thêm dòng vào bảng chung để màn danh sách đọc một nguồn.
- Trạng thái chung: Nháp · Đang gửi · Lỗi hệ thống HQ (tự thử lại theo backoff, gửi lại được) · Bị từ chối (`errorList`, không tự thử lại) ·
  Chưa phản hồi · Thành công · Ghi nhận tay.

## 4. Màn danh sách

- Đường dẫn dự kiến `/customs/ops`. Lọc: loại, trạng thái, chi cục, ngày, lô, "Chưa gắn hồ sơ". Tìm: số vận đơn, container, số tờ khai, số tiếp nhận, số kết quả.
- Cột: Loại · Tham chiếu · Chi cục · Trạng thái · Số kết quả · Hồ sơ gắn · Người tạo · Cập nhật. Bấm dòng mở chi tiết (dùng lại component của panel tờ khai).
- Lọc chạy ở backend theo `org_id`, có phân trang. Bộ lọc "Lỗi hệ thống HQ" kèm gửi lại hàng loạt.
- Giao diện đủ vi/en/zh, chỉ dùng `@kb/ui`.

## 5. Gắn hồ sơ

Khi dựng tờ khai, code tìm nghiệp vụ chưa gắn khớp số vận đơn / container / MST / số tờ khai và **gợi ý**; người dùng xác nhận mới gắn.
Gắn xong tự điền kết quả (số định danh → 1.26/2.24, số tiếp nhận HYS → 1.63/2.53), ghi `field_audit`.

## 6. Đăng ký số định danh theo lô

Nghiệp vụ đã chốt (20/11/2026):
- Hải quan **cho xin nhiều số định danh cùng nội dung khai** (cùng MST, chi cục, loại hàng).
- Số định danh **dùng được đến hết 31/12 của năm được cấp**.
- Chưa thấy FPT giới hạn số lời gọi.

Thiết kế:
- Nút **Đăng ký số định danh** (vi/en/zh). Hộp thoại: số lượng (1–50) + ô khai như hiện nay (điền sẵn từ lần gửi trước). Gửi xong đóng ngay, người dùng làm việc khác.
- Use case `requestIdentifierBatch(ctx, { count, request, clientKey })`: một transaction tạo N dòng `customs_identifiers` SENDING cùng `batch_id`,
  đẩy N job `identifier-send` (`jobId: identifier-send:<id>`). `clientKey` (UUID do client sinh) là khóa idempotency: lưu thẳng làm `batch_id`, unique `(org_id, batch_id, batch_index)` – bấm hai lần thì lần sau trùng khóa, trả lại lô đã có, không tính phí FPT hai lần.
  `processIdentifier`, `pollIdentifier` (30 giây, tối đa 40 lần), `stuck-sweeper` giữ nguyên.
- Queue `identifier-send` chạy song song tối đa 3 job (an toàn; chạy thật ổn thì tăng).
- Lô xong (mọi dòng ACCEPTED / REJECTED / NO_RESPONSE) → thông báo người tạo, vd "Lô 10 định danh: 9 có số, 1 bị từ chối". Mỗi lần gọi FPT ghi `usage_events`.
- **Hạn dùng**: tính từ `identified_on` (`YYYY-12-31`), không lưu cột. Chưa dùng mà qua ngày đó (giờ Việt Nam) → **Hết hạn**, không chọn được ở 1.26/2.24.
  Từ 01/12 cảnh báo "Hết hạn 31/12" trên số chưa dùng và dòng tổng "Còn N số chưa dùng sẽ hết hạn 31/12".
- **Dùng số**: panel ô 1.26/2.24 chọn số chưa dùng, chưa hết hạn từ kho. Thứ tự: (1) giữ số bằng `UPDATE … SET used_at, used_by_dossier_id WHERE used_at IS NULL`
  (hai hồ sơ cùng chọn chỉ một bên được); (2) điền ô và ghi `field_audit` trong transaction của module tờ khai; bước (2) lỗi thì trả số lại (`used_at = NULL`).
- **Lọc**: trạng thái (Đang gửi · Có số – chưa dùng · Đã dùng · Hết hạn · Bị từ chối · Chưa phản hồi), ngày đăng ký, chi cục, lô; tìm số định danh / số tiếp nhận / hồ sơ đã dùng.
- **Xóa dòng lỗi** để làm sạch dữ liệu: chọn nhiều + nút "Xóa các dòng lỗi" theo bộ lọc.
  - Được xóa: **Bị từ chối**; **Chưa phản hồi** có cảnh báo (Hải quan đã cấp số tiếp nhận, vẫn có thể trả số định danh sau – nên Hỏi kết quả trước).
  - Không được xóa: **Đang gửi**, dòng **đã có số** (chưa dùng / đã dùng / hết hạn).
  - Xóa mềm (`deleted_at`, `deleted_by`), ghi `org_audit`; backend kiểm lại bằng `UPDATE … WHERE status IN ('REJECTED','NO_RESPONSE')`.
- Migration `customs_identifiers`: bỏ `NOT NULL` trên `dossier_id`; thêm `batch_id`, `batch_index`, `used_at`, `used_by_dossier_id` (FK `dossiers`, `ON DELETE SET NULL` – xóa hồ sơ không xóa số đã cấp), `deleted_at`, `deleted_by`;
  unique mới `(org_id, batch_id, batch_index)`. `customs_identifiers_dossier_attempt_uq` và `customs_identifiers_sending_uq` thêm điều kiện `WHERE deleted_at IS NULL`
  (NULL `dossier_id` vốn không va nhau trong unique của Postgres). Dòng trong lô: `attempt` = số lần gửi của chính dòng đó (1, tăng khi Gửi lại).

## 7. Đăng ký ngoài giờ

Khai qua cổng V5 của Hải quan, **không cần số tờ khai**. Ô khai:

| Ô | Kiểu | Kiểm |
|---|---|---|
| Ngày giờ đăng ký | nhập giờ Việt Nam, lưu UTC | bắt buộc |
| Mã chi cục Hải quan | `string`, danh mục chi cục | bắt buộc, có trong danh mục |
| Nội dung đăng ký làm ngoài giờ | text tự do (thường "làm thủ tục cho tờ khai …") | bắt buộc; độ dài theo đặc tả V5 |

Nội dung là text tự do → không tự gắn hồ sơ (có số 12 chữ số thì có thể gợi ý, người dùng xác nhận). Chưa có API trong tài liệu FPT → hỏi FPT
endpoint, body, cách hỏi kết quả; chưa có thì ghi nhận tay.

## 8. Thứ tự làm (mỗi bước một PR)

1. Màn danh sách + đăng ký số định danh theo lô (khai độc lập) + chọn số có sẵn ở ô 1.26/2.24. Bước này chỉ có một loại nên màn danh sách đọc thẳng
   `customs_identifiers`; chưa tạo `customs_ops` (tạo ở bước 2, khi có loại thứ hai, để không phải đồng bộ hai bảng cho cùng một loại).
2. Bảng `customs_ops` + chia tách vận đơn (đã có API) + HYS khai độc lập.
3. Ghi nhận tay: ngoài giờ (đưa lên bước 2 nếu FPT có API sớm), CFS, lệ phí CSHT; hiện KVGS + container trong danh sách chung.
4. Gợi ý gắn hồ sơ + tự điền kết quả vào tờ khai.

## 9. Còn mở

- Đăng ký ngoài giờ: FPT có bọc API trên cổng V5 không; giới hạn độ dài ô nội dung, định dạng ngày giờ.
- Lệ phí CSHT, CFS: có tích hợp cổng nào về sau không.
