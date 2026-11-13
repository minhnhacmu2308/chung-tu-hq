# ADR 0014 – Qua khu vực giám sát: khai danh sách container, lấy DS qua KVGS, in bản kê mã vạch

- Trạng thái: Chấp thuận (2026-11-13)
- Ngày: 2026-11-13
- Spec: `docs/superpowers/specs/2026-11-13-qua-khu-vuc-giam-sat-kvgs-design.md`

## Bối cảnh
Sau thông quan, hàng phải qua khu vực giám sát (KVGS) của cảng/kho. Công chức giám sát quét mã vạch trên **bản kê "Danh sách container / Danh sách hàng hóa đủ điều kiện qua KVGS"** để lấy dữ liệu doanh nghiệp đã truyền, đối chiếu, rồi ký – đóng dấu trên bản in. Hàng nhập đi container phải khai **danh sách container** (vận đơn, số container, số seal) trước thì Hải quan mới có dữ liệu.

Luồng tờ khai đã có bước `CONT` ở nhóm "Chứng từ & cảng" nhưng chỉ mô phỏng một cú bấm. FPT.VNACCS có `V5ContainerReq/Res` (khai danh sách, có đặc tả) và `KVGS` (lấy DS + mã vạch; **chưa có đặc tả phản hồi**).

## Quyết định
1. **Mã vạch lấy từ Hải quan**, hệ thống không tự sinh. Bản in dựng lại đúng mẫu từ dữ liệu `KVGS` đã chuẩn hóa (`KvgsSheet`, `@kb/contracts`).
2. Thay `CONT` bằng hai nghiệp vụ phụ `CONT_LIST` (khai danh sách container – chỉ NK đường biển container) và `KVGS` (lấy DS qua KVGS – mọi tờ đã thông quan). Cả hai chạy qua outbox + worker, gửi → hỏi phản hồi, idempotent, như HYS.
3. Hai bảng riêng `container_lists` (theo lần khai) và `kvgs_sheets` (giữ lịch sử, in theo bản mới nhất), có `org_id` + RLS. Sửa ô → `field_audit`.
4. Số seal điền sẵn từ vận đơn đã OCR; người dùng kiểm và sửa. Không dùng AI ở nghiệp vụ này.
5. Giao diện: thẻ "Qua khu vực giám sát" trong nhóm ④ của bước Truyền Hải quan + lối tắt ở màn Khai báo Hải quan; trang in riêng, chỉ tiếng Việt; component `Barcode` (QR + Code128, SVG, `bwip-js`) thêm vào `@kb/ui`.
6. Không trừ lượt khai (ADR 0011); mỗi lần gọi FPT vẫn ghi `usage_events`.

## Hệ quả
- Gateway `KVGS` thật phải đối chiếu lại khi FPT gửi đặc tả phản hồi; tới lúc đó chỉ có giả lập (`apps/fpt-mock`, mock web) và bộ ánh xạ linh hoạt + lưu phản hồi thô.
- Khi triển khai: cổng `KVGS` thật trả `NOT_SUPPORTED` cho tới khi FPT gửi đặc tả phản hồi (chưa gọi FPT thật); `V5ContainerReq/Res` đã nối thật.
- Bảng `kvgs_sheets` có unique index từng phần: một bản `SENDING` cho mỗi (hồ sơ, tờ khai) – chặn gửi trùng ở mức CSDL.
- `field_audit` ghi sau khi commit (như AMA_EDIT), không nằm trong transaction lưu bảng container.
- Thêm một phụ thuộc (`bwip-js`) vào `@kb/ui`.
- Khai HYS danh sách container và đóng chung container nhiều tờ khai để đợt sau.
