# ADR 0018 – Khối "thông tin lô hàng" đọc trên mọi chứng từ; mọi chứng từ là nguồn ngang nhau

- Trạng thái: Chấp nhận (chưa bật production – chờ đo trên mẫu XK thật, xem "Chưa làm")
- Ngày: 2026-11-17
- Thiết kế: `docs/superpowers/specs/2026-11-17-ocr-khoi-lo-hang-moi-chung-tu-design.md`

## Bối cảnh

Hồ sơ xuất khẩu chỉ có một Commercial Invoice (VL0611826): invoice in cảng xếp/dỡ, tàu/chuyến, container, seal, số L/C, CFR. Hệ thống bỏ hết
vì (1) schema đọc của Invoice không có các trường đó; (2) `shipment-spec.ts` khóa cứng ô nào lấy từ loại chứng từ nào (cảng/tàu/container chỉ
từ B/L, AWB, Arrival Notice, C/O); (3) trường bổ sung của skill vào túi `custom`, không chảy vào tờ khai. Kết quả: EDA trống 2.60, PTVC_TEN,
cảng; người khai gõ lại 6 ô dù chứng từ đã có. Gốc vấn đề là việc gán cứng "thông tin nào thuộc chứng từ nào".

## Quyết định

- **Khối `lot` dùng chung** (`packages/contracts/src/extraction/lot.ts`, `LotSchema`) gắn vào **cả 9 loại chứng từ kể cả `OTHER`**, lồng riêng
  dưới key `lot` (không trộn vào trường loại: `FREIGHT_INVOICE.invoiceNo`, `BILL_OF_LADING.date`… khác nghĩa). Mọi trường nullable, "chỉ chép
  nếu in". `LOT_OMIT` bỏ khỏi `lot` của loại những key loại đó đã có **cùng nghĩa** (không chỉ cùng tên).
- **Mọi chứng từ là nguồn ngang nhau** của mọi ô lô hàng (thay bảng nguồn theo loại, bác phương án "chủ/dự phòng": chứng từ nào đáng tin
  phụ thuộc hướng – hàng xuất lúc khai chỉ có invoice/PL, B/L có sau). Một nguồn `SINGLE_SOURCE`, khớp ≥ 2 `CROSS_CHECKED`, khác nhau sau chuẩn
  hóa `CONFLICT` kèm ghi chú "X ghi A; Y ghi B" – vẫn là "Cần xem". Thứ tự nguồn trong `shipment-spec` chỉ còn chọn giá trị mặc định khi
  CONFLICT. Không thêm trạng thái mới (ADR 0003 giữ nguyên). `sources` của ô thuộc khối được sinh từ danh sách loại, không liệt kê tay.
- **Ngoại lệ giữ cờ `fallback`** (chỉ dùng khi mọi nguồn khác trống, không đem ra so): C/O cho cảng xếp/dỡ (ghi chung "HO CHI MINH, VIET NAM")
  và hóa đơn cước cho ngày hàng đến. So bằng mã cảng để tự khớp: đợt sau.
- **Chuẩn hóa khi so:** cảng chỉ chữ hoa + gộp khoảng trắng (khác chữ vẫn `CONFLICT`, theo ý người dùng); tàu/chuyến được tách (`vessel`, `voyage`);
  số container/seal/vận đơn/L/C/PO/ngày/số kiện/cân dùng `ident`/`num`/`date`.
- **Container từ mọi chứng từ**, loại trùng theo số (chữ hoa, bỏ khoảng trắng); dòng chỉ-đọc `containers` trên màn OCR.
- **Phương thức thanh toán:** AI chọn mã `paymentMethodCode` (enum đúng 17 mã `code-tables.ts`) trên INVOICE / SALES_CONTRACT / OTHER, vẫn chép
  nguyên văn `paymentTerms`; kiểm chéo với `resolvePayment` (regex).
- **Đầu ra gọn:** `lot` gửi AI dạng mảng `[{key, value}]` chỉ ô có in + `lotContainers`, chuyển về object trước khi parse (không tốn ~150 token cho
  ô trống; enum không tính vào giới hạn 16 union). Prompt v4 (`PROMPT_VERSION = "4"`), `EXTRACTION_SCHEMA_VERSION = 4`.
- **Chống bịa:** `SYSTEM_PROMPT` mục 6 – không suy cảng từ địa chỉ, tàu từ tên hãng, ngày hóa đơn làm ngày đi.
- **Tờ khai:** EDA/IDA `SO_CONT`/`SL_CONT` lấy container bất kể nguồn, `source` theo chứng từ thật (không còn cứng `BILL_OF_LADING`).
  Nhập tay (`manual.ts`) và hóa đơn phát hành vẫn thắng.
- **Quy ước mới ở `@kb/contracts` (`dto/ocr.ts`)** – xem skill `adding-document-type`:
  - `isReadOnlyField(key)`: ô chỉ đọc trên màn OCR (hiện `containers`, sửa qua thẻ nhập tay lô hàng khi thẻ có trên màn – XK hoặc chưa có chứng từ; NK sửa `SO_CONT`/`SL_CONT` ở bước Review tờ khai). Server (`_field-edit.ts`)
    từ chối sửa giá trị, web (`field-row.tsx`) khóa ô.
  - `isHiddenOcrRow(key)`: dòng không hiện trên màn OCR (hiện `payment_method_code`, hiện qua ô mã của dòng thanh toán); không tính vào số ô
    "Cần xem". Server `countSuspect` và web `ocrRows` dùng chung để hai bên không lệch số.
  Thêm key vào đúng predicate này khi một ô chỉ đọc hoặc chỉ-để-đối-chiếu; không viết lại điều kiện ở web hay server.

## Lệch so với thiết kế, quyết định lúc làm

| Điểm | Quyết định | Lý do / cái giá |
|---|---|---|
| Đối chiếu mã PTTT | Regex có mã + AI `null` → **nhận**, không cảnh báo (khi không có số L/C) | AI null là trạng thái của mọi lô đã đọc trước thay đổi; cảnh báo sẽ chặn hồ sơ cũ. Cái giá: lệch một phía thật có thể không bị cờ |
| Chứng từ không có chữ PTTT | Có mã AI hoặc số L/C → **gợi ý** mã đó (nghi ngờ, kèm ghi chú); mặc định hồ sơ chỉ khi không có tín hiệu nào | Khớp ca invoice chỉ có "L/C No". Cái giá: hiện mã AI thay mặc định công ty, gắn "Cần xem" |
| Chặn rời OCR (`ocrExitBlockers`) | Chỉ chặn khi **có chữ PTTT** mà lệch | Không chặn chứng từ không ghi PTTT |
| Mã PTTT lệch giữa chứng từ | Hiện qua ghi chú dòng thanh toán, không tính riêng ở `countSuspect` (dòng ẩn) | Một predicate chung `isHiddenOcrRow` |
| Container `no` rỗng từ AI | **Bỏ** entry trong `fromAiOutput`, không làm hỏng cả lượt đọc | Ràng buộc "một trường lỗi không được hỏng cả lần đọc" thắng `no: z.string()`. Cái giá: container có seal nhưng không số bị bỏ im lặng |
| Cảng, tàu | Viết hoa khi gộp | Để so ổn định |
| Seal khác nhau cùng số container | Ghi chú + `CONFLICT` ở **dòng container** (field chiếu `containers`), merge giữ seal đầu | Container không phải `Sourced<string>` |
| Eval lô hàng xuất | `mapping.json` thêm `{"direction":"XK"}`, runner đọc hướng khai (`lot` run) | Chạy được lô XK trong eval |

## Hệ quả

- (+) Chứng từ mới, mẫu lạ tự điền ô tờ khai; càng nhiều chứng từ càng nhiều ô được đối chiếu chéo.
- (−) Token đầu vào/ra mỗi chứng từ tăng (đã gọn bằng mảng thưa); hồ sơ đang ở bước OCR phải "Đọc lại" (tính tiền một lượt đọc); hồ sơ đã khai
  không đổi. Phiên bản schema/prompt mới đổi khóa idempotency.
- (−) Cảng ghi khác chữ giữa chứng từ vẫn hiện "Cần xem" (ví dụ "BA RIA - VUNG TAU (CM-TV), VIETNAM" với "VUNG TAU") cho tới khi so bằng mã cảng.
- Skill cũ không bị báo thiếu: trường mới có `since: 3` trong danh mục (`catalog/types.ts`).

## Chưa làm

- **Chưa chạy eval live – chưa merge vào `main`.** `main` tự deploy (`.github/workflows/deploy.yml`), nên nhánh này chỉ merge khi eval live
  trên các lô vàng (có ít nhất một file scan) đạt ngưỡng dưới đây (BACKEND-TODO L5). Chờ mẫu XK vàng của người dùng: thư mục PDF + một sheet `.xlsx` mỗi chứng từ như `evals/golden/hansol`,
  cùng `mapping.json` `{"direction":"XK"}`. Ngưỡng chấp nhận: 0 ô bịa trên ≥ 10 chứng từ thật gồm loại không in thông tin vận tải; thời gian
  tăng ≤ 2 s ở trung vị. Kèm báo cáo: danh mục 17 mã (code) vs 15 mã (wiki 29.DM_GANCODE) – giữ 17 (đang dùng ở regex/mapping production, TT39 PL II).
- Backlog (`docs/BACKEND-TODO.md`): nhãn–giá trị tự do + "Gán vào ô" tự học alias; trường bổ sung (`custom`) lên tờ khai; so cảng bằng mã;
  prompt caching.
