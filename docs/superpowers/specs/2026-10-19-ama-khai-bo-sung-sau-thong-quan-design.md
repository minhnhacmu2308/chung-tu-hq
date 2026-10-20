# Khai bổ sung sau thông quan (AMA) – bản khai riêng, không sửa tờ khai gốc

Ngày: 2026-10-19 · Nhánh: `main`

## 1. Mục tiêu và căn cứ

**Mục tiêu:** tờ khai đã thông quan muốn sửa thì lập **bản khai bổ sung AMA riêng**, tham chiếu tới tờ khai gốc. Tờ khai gốc giữ nguyên, khóa toàn bộ. Luồng AMA (khai tạm) → AMB (gọi về sửa) → AMC (khai chính thức) đã có trong code; phần thiếu là nội dung bản khai và màn hình nhập.

**Căn cứ:**
- `tailieuchitieukhaibao/CHIEUTIEU_AMA_NHAP_XUAT.docx`: 4 ảnh màn hình phần mềm khai báo – tab Thông tin tờ khai, Danh sách hàng (chi tiết hàng), Thông điệp HQ. Ghi chú: đã khai AMC là khóa toàn bộ.
- Đặc tả FPT `VNACCS_AMA v1.3.xlsx`: `VN_AMA` (đầu bản khai), `VN_AMA_HANG` (dòng hàng), `VN_AMA_TRANGTHAI` (trạng thái trả về). Một bộ chỉ tiêu cho cả nhập và xuất, phân biệt bằng `TK_YNK` (I/E).

**Quyết định của chủ sản phẩm (2026-10-19):**
- AMA là nghiệp vụ độc lập, không sửa trực tiếp trên tờ khai gốc.
- Phần "Trước" tự lấy từ tờ khai gốc (số Hải quan trả về) và khóa; phần "Sau" người khai sửa, **app tự tính lại tiền thuế "Sau"**.
- Làm cả 2 tiện ích ngoài đặc tả: **Mã hàng (Trước/Sau)** (lưu nội bộ, không gửi) và ô chọn **Hợp đồng gia công** để chèn vào ghi chú sau khai bổ sung.

## 2. Đối chiếu giao diện ↔ đặc tả

Mọi ô "Request" của `VN_AMA` đều có trên tab Thông tin tờ khai (bảng đầy đủ trong trao đổi ngày 2026-10-19). Dòng hàng: `HAG_RAN`, mô tả `HAG_CMB/CMA`, xuất xứ `HAG_ORB/ORA`, thuế XNK trước `HAG_MKB/MKQ/MKC/MKT/MKR/MKA` – sau `HAG_AKB/AKQ/AKC/AKT/AKR/AKA`, thuế và thu khác n=1..5 trước `HAG_MBn/MQn/MCn/MKn/MRn/MAn` – sau `HAG_ABn/AQn/ACn/AKn/ARn/AAn`.

Điểm cần kiểm khi nối FPT thật: "mã xác định thuế suất trước" có hai mã cùng mô tả (`HAG_MKn` đánh dấu Request, `HAG_KIn` không) – gửi theo `HAG_MKn`.

## 3. Dữ liệu

Bản khai bổ sung `PostAmendment` (một hồ sơ có thể có nhiều bản theo thời gian, chỉ một bản đang mở):

```
{ id, dossierId, seq, status: DRAFT | APPROVED | PRE_DECLARED | RECALLED | REGISTERED,
  header: Record<mã VNACCS VN_AMA, string>,
  lines: { id, ran /* số dòng gốc */, itemCodeBefore?, itemCodeAfter?, before: Record<mã, string>, after: Record<mã, string> }[],
  result?: { syn /* số tờ khai bổ sung */, notice, registeredAt, over60, totals… } }
```

- Trạng thái nối với `stage` hiện có: DRAFT/APPROVED ↔ `POST_EDITING`, PRE_DECLARED ↔ `POST_PRE_DECLARED`, RECALLED ↔ `POST_RECALLED`, REGISTERED → stage trở lại `CLEARED`.
- Sửa được khi DRAFT hoặc RECALLED. PRE_DECLARED: chỉ xem (muốn sửa thì AMB). REGISTERED: khóa toàn bộ.
- Mọi lần sửa ô ghi `field_audit` như tờ khai.

**Điền sẵn khi lập bản khai** (bấm "Bắt đầu sửa sau thông quan"):
- Đầu bản khai: `TK_YNK` theo chiều hồ sơ; `TK_ICN` số tờ khai; `TK_ICB`, `TK_CHS`, `TK_CHB`, `TK_IDD` (ngày đăng ký), `TK_IPD` (ngày cấp phép), `TK_RED`, người khai `TK_IMC/IMN/IMT/IMY/IMA`, `TK_REF`, `TK_ENC`, ngân hàng/bảo lãnh lấy từ tờ khai gốc; `TK_TTC` = VND; tỷ giá trước `TK_CDB/RTB` = tỷ giá tính thuế của tờ khai gốc, tỷ giá sau `TK_CDA/RTA` để trống; ghi chú trước `TK_NTB` = ghi chú tờ khai gốc, ghi chú sau `TK_NTA` = bằng ghi chú trước.
- Dòng hàng: người khai **chọn dòng của tờ khai gốc** cần bổ sung (nút "Thêm dòng" → chọn số dòng). "Trước" lấy từ tờ khai gốc + số Hải quan trả về; "Sau" mặc định bằng "Trước".

**Tự tính "Sau"** (hàm thuần trong `@kb/contracts`, số thập phân dạng chuỗi, không dùng `number`):
- Thuế XNK: `HAG_AKA` = `HAG_AKB` × thuế suất % (`HAG_AKR`).
- Thuế và thu khác loại tính trên trị giá cộng thuế XNK (VAT – mã VB…): trị giá `HAG_ABn` = `HAG_AKB` + `HAG_AKA`; `HAG_AAn` = `HAG_ABn` × `HAG_ARn` %. Khớp ảnh mẫu: 78.721.520,22 × 1,05 = 82.657.596,231; × 10% = 8.265.759,6231.
- Thuế suất không phải dạng % (thuế tuyệt đối) → không tự tính, người khai nhập tiền thuế, ô ghi "Thuế suất tuyệt đối – nhập số tiền".
- Người khai sửa trị giá/số lượng/thuế suất "Sau" → tiền thuế "Sau" tính lại ngay; sửa tay tiền thuế thì giữ số đã sửa và đánh dấu "đã sửa tay".

**Hợp đồng gia công:** danh sách lấy từ số/ngày hợp đồng trên các tờ khai của doanh nghiệp (cùng loại hình gia công) và tờ khai gốc; chọn → chèn `SO HOP DONG: <số> ngày <dd/mm/yyyy>` vào `TK_NTA`.

## 4. Màn hình

Bước 5 (Review) khi hồ sơ đang khai bổ sung: thêm tab **"Khai bổ sung AMA"** (mặc định), giữ "Tờ khai đầy đủ" ở chế độ chỉ xem (khóa toàn bộ, thông báo "Tờ khai đã thông quan – sửa qua bản khai bổ sung AMA").

Tab "Khai bổ sung AMA" gồm 3 phần như phần mềm khai báo:
1. **Thông tin tờ khai** – dựng bằng layout + renderer sẵn có của form tờ khai (`declaration-layout` + `BlockView`), nhóm theo ảnh: tờ khai gốc & cơ quan HQ · người khai · lý do & nộp thuế · bảo lãnh · tỷ giá trước/sau · ghi chú trước/sau (+ Hợp đồng gia công).
2. **Danh sách hàng** – bảng các dòng đã chọn (số dòng gốc, mô tả, HS trước→sau, tiền thuế trước→sau, tăng/giảm); bấm dòng mở panel chi tiết như ảnh: mô tả trước/sau, xuất xứ, khối Thuế XNK (Trước/Sau), khối Thuế và thu khác 1–5 (Trước/Sau). Ô "Trước" chỉ đọc.
3. **Thông điệp HQ** – danh sách thông điệp đã gửi/nhận của AMA/AMB/AMC (mã, tên, thời gian) và kết quả Hải quan trả về (số tờ khai bổ sung, số thông báo, ngày đăng ký, cờ quá 60 ngày, tổng tăng/giảm).

Thanh dưới: Lưu · Phê duyệt (người duyệt) → bước 6 khai AMA/AMB/AMC như hiện có.

## 5. Backend

- `@kb/contracts`: `fpt/ama.ts` (dòng chỉ tiêu `VN_AMA`, `VN_AMA_HANG` theo kiểu `fpt/hys.ts`, schema request/response), DTO `PostAmendment`, layout AMA, hàm tính lại, danh mục **Mã lý do khai bổ sung** (`TK_REC`).
- `@kb/core` module `integration`: bảng `post_amendments` (jsonb header/lines, có `org_id`); use case lập / sửa ô / thêm–bớt dòng / phê duyệt; `startPostAmendment` lập bản khai thay vì mở lại tờ khai gốc (bỏ `markDraft`); `performOperation` AMA gửi `buildAmaRequest(bản khai)`; cổng FPT thêm nghiệp vụ AMA (AMB/AMC vẫn "chưa có đặc tả API").
- Mock: cùng chữ ký, `DB_VERSION` tăng.

## 6. Ngoài phạm vi

Thuế TTĐB/BVMT/chống bán phá giá tự tính (chỉ VAT và thuế XNK theo %); in bản khai bổ sung; AMB/AMC qua FPT thật (chưa có đặc tả API).
