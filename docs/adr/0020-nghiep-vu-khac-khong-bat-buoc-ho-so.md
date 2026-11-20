# ADR 0020 – Nghiệp vụ khác (nghiệp vụ phụ trợ thông quan) không bắt buộc gắn hồ sơ

- Trạng thái: Chấp nhận
- Ngày: 2026-11-20
- Đặc tả: `docs/superpowers/specs/2026-11-20-nghiep-vu-khac-design.md`

## Bối cảnh

Các nghiệp vụ phụ trợ thông quan (khai báo định danh, chia tách vận đơn, HYS, danh sách container, KVGS, lệ phí CSHT, gửi hàng vào kho CFS,
đăng ký ngoài giờ…) đang gắn chặt vào hồ sơ: bảng `customs_identifiers`, `kvgs_sheets`, `container_lists`, `hys_submissions` có
`dossier_id NOT NULL`, và khai báo định danh chỉ mở được từ panel ô Số vận đơn của tờ khai.

Hệ thống tiếp nhận của Hải quan hay lỗi. Đợi mở tờ khai mới khai các nghiệp vụ này thì trễ việc khai tờ khai, không thông quan kịp.
Chủ sản phẩm (20/11/2026) yêu cầu menu riêng **Nghiệp vụ khác** để khai trước, theo dõi, tìm kiếm, quản lý.

## Quyết định

- Mỗi nghiệp vụ là **một bản ghi duy nhất**. `dossier_id` **cho phép trống**: khai trước, gắn hồ sơ sau. Mở từ menu Nghiệp vụ khác hay từ tờ khai
  đều đi cùng một use case, không có bản sao thứ hai.
- Bảng chung `customs_ops` (`org_id`, `type`, `status`, mã tham chiếu để tìm kiếm, `dossier_id` trống được, `payload` jsonb parse Zod theo `type`,
  khóa idempotency) làm nguồn cho màn danh sách. Bảng chi tiết đang có (KVGS, container, HYS, định danh) giữ nguyên, thêm dòng tương ứng vào bảng chung.
- **Mỗi loại nghiệp vụ phải được phân loại trước khi làm**: cần số tờ khai hay không (bảng phân loại trong đặc tả; quy tắc
  `.claude/rules/nghiep-vu-khac.md`). Loại cần số tờ khai bắt buộc số tờ khai lúc tạo; loại không cần thì tạo độc lập.
- Gửi Hải quan qua outbox + worker như hiện nay (ADR 0005). Tách trạng thái **lỗi hệ thống Hải quan** (tự thử lại theo backoff) với **bị từ chối**
  (`errorList`, không tự thử lại). Không trừ lượt khai; mọi lần gọi FPT ghi `usage_events`.
- Gắn hồ sơ chỉ khi người dùng xác nhận (code chỉ gợi ý theo số vận đơn / container / MST / số tờ khai). Kết quả điền vào tờ khai ghi `field_audit`.

## Hệ quả

- Migration bỏ `NOT NULL` trên `dossier_id` ở các bảng nghiệp vụ phụ trợ; các unique theo hồ sơ phải soát lại từng cái
  (`customs_identifiers_sending_uq`, `customs_identifiers_dossier_attempt_uq`, `kvgs_sheets_sending_uq`, `container_lists_dossier_branch_attempt_uq`,
  `hys_submissions_dossier_seq_uq`). Postgres coi NULL là khác nhau nên dòng chưa gắn hồ sơ không bị các index này chặn trùng – mỗi loại cần khóa
  idempotency riêng cho dòng độc lập (vd `(org_id, batch_id, batch_index)` của định danh).
- RLS theo `org_id` không đổi; truy vấn danh sách không còn đi qua hồ sơ nên phải lọc `org_id` trực tiếp.
- Loại nghiệp vụ chưa có API FPT làm ở dạng **ghi nhận tay** (nhập số kết quả, đính kèm biên lai); có API thì nối vào outbox, không đổi màn hình.
