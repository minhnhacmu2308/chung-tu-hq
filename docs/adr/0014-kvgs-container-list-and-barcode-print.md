# ADR 0014 – Qua khu vực giám sát: khai danh sách container, lấy DS qua KVGS, in bản kê mã vạch

- Trạng thái: Chấp thuận (2026-11-13)
- Ngày: 2026-11-13
- Spec: `docs/superpowers/specs/2026-11-13-qua-khu-vuc-giam-sat-kvgs-design.md`

## Bối cảnh
Sau thông quan, hàng phải qua khu vực giám sát (KVGS) của cảng/kho. Công chức giám sát quét mã vạch trên **bản kê "Danh sách container / Danh sách hàng hóa đủ điều kiện qua KVGS"** để lấy dữ liệu doanh nghiệp đã truyền, đối chiếu, rồi ký – đóng dấu trên bản in. Hàng nhập đi container phải khai **danh sách container** (vận đơn, số container, số seal) trước thì Hải quan mới có dữ liệu.

Luồng tờ khai đã có bước `CONT` ở nhóm "Chứng từ & cảng" nhưng chỉ mô phỏng một cú bấm. FPT.VNACCS có `V5ContainerReq/Res` (khai danh sách, có đặc tả) và `POST /api/KVGS` (lấy DS + mã vạch). Ban đầu `KVGS` chưa có đặc tả phản hồi; ngày 2026-11-13 FPT gửi `API-KVGS.md` nên đã nối thật.

## Quyết định
1. **Mã vạch container lấy từ Hải quan** (`barcodeImage`, Base64 PNG từng container, in nguyên ảnh). Riêng hàng lẻ: mã vạch là **Code128 do hệ thống sinh từ số tờ khai** (chủ sản phẩm chốt 2026-11-13). Bản in dựng lại đúng mẫu từ dữ liệu `KVGS` đã chuẩn hóa (`KvgsSheet`, `@kb/contracts`).
2. Thay `CONT` bằng hai nghiệp vụ phụ `CONT_LIST` (khai danh sách container – chỉ NK đường biển container) và `KVGS` (lấy DS qua KVGS – mọi tờ đã thông quan). Cả hai chạy qua outbox + worker, idempotent, như HYS: `CONT_LIST` gửi → hỏi phản hồi (poll); `KVGS` là **một lời gọi đồng bộ** `POST /api/KVGS`, chốt kết quả ngay trong `customs-send`.
3. Hai bảng riêng `container_lists` (theo lần khai) và `kvgs_sheets` (giữ lịch sử, in theo bản mới nhất), có `org_id` + RLS. Sửa ô → `field_audit`.
4. Số seal điền sẵn từ vận đơn đã OCR; người dùng kiểm và sửa. Không dùng AI ở nghiệp vụ này.
5. Giao diện: thẻ "Qua khu vực giám sát" trong nhóm ④ của bước Truyền Hải quan + lối tắt ở màn Khai báo Hải quan; trang in riêng, chỉ tiếng Việt; component `Barcode` (QR + Code128 bằng `bwip-js`, và `png` hiển thị ảnh Base64 của Hải quan) thêm vào `@kb/ui`.
6. Không trừ lượt khai (ADR 0011); mỗi lần gọi FPT vẫn ghi `usage_events`.

## Hệ quả
- KVGS đã nối thật theo đặc tả FPT `docs/mauin_danhsachcontqua_kvgs/API-KVGS.md`: một bước, không REF_ID/`KVGSRes`, không tài khoản VNACCS (chỉ JWT), không poll; `errorList` khác rỗng → `REJECTED`. Phản hồi parse bằng Zod đúng tên trường của đặc tả và lưu `raw`; thiếu dữ liệu để in → `KVGS_RESPONSE_INCOMPLETE`. Loại bản kê (container/hàng lẻ) do `isContainer` của API quyết định.
- `containers[].barcodeImage` là Base64 PNG thuần, kiểm bằng regex và giới hạn ~200 KB; không hợp lệ thì không in (không vẽ ảnh hỏng). Bản ghi `kvgs_sheets` cũ (container có `barcode` chuỗi, do giả lập hai bước) đọc ra `sheet: null` – người dùng lấy lại.
- `kvgs-poll` chỉ còn cho `CONT_LIST`; route poll của KVGS đã bỏ. Bản `SENDING` mồ côi của luồng hai bước cũ (chỉ ở môi trường dev) chặn lấy mới do unique index từng phần – xem `apps/worker/CLAUDE.md`.
- Chưa ánh xạ `loaiHinh` (mã) và `ghi_Chu`: `KvgsSheet` chưa có chỗ, thêm khi cần.
- Bảng `kvgs_sheets` có unique index từng phần: một bản `SENDING` cho mỗi (hồ sơ, tờ khai) – chặn gửi trùng ở mức CSDL.
- `field_audit` ghi sau khi commit (như AMA_EDIT), không nằm trong transaction lưu bảng container.
- Thêm một phụ thuộc (`bwip-js`) vào `@kb/ui` (QR/Code128; ảnh PNG của Hải quan không cần).
- Khai HYS danh sách container và đóng chung container nhiều tờ khai để đợt sau.
