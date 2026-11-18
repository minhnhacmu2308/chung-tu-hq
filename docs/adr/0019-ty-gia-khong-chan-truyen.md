# ADR 0019 – Tỷ giá trong tờ khai chỉ để ước tính thuế tạm; sang tuần tỷ giá mới không chặn truyền

- Trạng thái: Chấp nhận
- Ngày: 2026-11-19
- Thay luật R8 của `docs/superpowers/specs/2026-10-15-ty-gia-tinh-thue-design.md`

## Bối cảnh

Luật R8 chặn truyền tờ khai (IDA/EDA lần đầu, khai tạm từng tờ, gửi lại IDA) khi ngày truyền thuộc tuần khác tuần của tỷ giá dùng lúc dựng tờ khai
(`RATE_WEEK_CHANGED`), buộc người khai mở lại → dựng lại → duyệt lại. Khi khai thật (19/11/2026), tờ khai dựng tuần trước bị chặn dù nội dung không đổi.

Chủ sản phẩm chốt nghiệp vụ: tỷ giá trong tờ khai **chỉ để tính thuế tạm lúc mở tờ khai nháp**; thuế chính thức do VNACCS tự tính theo tỷ giá
ngày đăng ký. Chặn truyền vì tỷ giá khác thời điểm là sai nghiệp vụ.

## Quyết định

- Bỏ guard tuần tỷ giá ở `submitDeclaration`, `enqueueBranchPreDeclare`, `performOperation` (IDA), `resendOperation` (IDA).
- Tỷ giá tuần vẫn dùng như cũ để dựng tờ khai nháp và hiện thuế ước tính ở màn Review (R1–R7, R9 giữ nguyên).
- Bất biến 7 (không truyền khi còn BLOCKER FAIL hoặc HS chưa xác nhận) giữ nguyên – tỷ giá không thuộc bất biến này.
- Mã lỗi `RATE_WEEK_CHANGED` và nhãn `RATE_WEEK_CHANGED_REOPEN/REBUILD` giữ trong contracts (không còn chỗ phát sinh) để dọn ở thay đổi sau, tránh sửa lan rộng.

## Hệ quả

- Thuế ước tính trên màn Review có thể lệch thuế VNACCS tính khi tờ khai dựng tuần trước được truyền tuần sau – thuế dự kiến Hải quan trả về sau IDA/EDA là số đúng.
- Checklist review backend mục A8 không còn coi "tỷ giá khác tuần" là điều kiện chặn truyền.
