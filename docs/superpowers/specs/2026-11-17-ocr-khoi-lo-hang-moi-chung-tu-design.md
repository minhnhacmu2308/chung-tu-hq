# Thiết kế: khối "thông tin lô hàng" đọc trên mọi chứng từ

- Ngày: 2026-11-17
- Trạng thái: đã duyệt (2026-11-17)
- Liên quan: ADR 0003 (trạng thái trường), ADR 0013 (hàng xuất khai trước), `shipment-spec.ts`, `merge.ts`, `catalog/documents.ts`

## 1. Ý định và lý do

Người khai không bao giờ phải gõ lại thông tin đã in trên chứng từ khách gửi. Thước đo: sang bước Tờ khai, ô nào có dữ liệu trên giấy thì ô đó đã có sẵn giá trị.

Ca kích hoạt: hồ sơ xuất khẩu chỉ có một Commercial Invoice (VL0611826). Invoice in cảng xếp, cảng dỡ, tàu/chuyến, số container, số seal, số L/C, điều kiện CFR. Hệ thống bỏ hết các thông tin này vì:

1. Schema đọc của Invoice (`packages/contracts/src/extraction/invoice.ts`) không có các trường đó, nên model không được phép trả về.
2. Bảng gộp (`packages/core/src/modules/extraction/domain/shipment-spec.ts`) khóa cứng "ô nào lấy từ loại chứng từ nào": cảng, tàu, container chỉ lấy từ B/L, AWB, Arrival Notice, C/O.
3. "Trường bổ sung" của skill (`skill-keys.ts`, `withCustomFields`) đọc được vào túi `custom`, hiện ở màn OCR với nhãn "(bổ sung)" (`document-sheet.ts:26`) nhưng không chảy vào tờ khai.

Kết quả: EDA trống 2.60 (container), tên tàu (PTVC_TEN), cảng (2.27/2.28); người dùng phải mở thẻ nhập tay và gõ lại 6 ô, dù chứng từ đã có đủ.

Vấn đề không nằm ở từng trường thiếu mà ở việc gán cứng "thông tin nào thuộc chứng từ nào". Chứng từ khách hàng rất đa dạng; mọi chứng từ đều có thể chứa thông tin tờ khai cần.

## 2. Mục tiêu, không mục tiêu, phản mục tiêu

Mục tiêu:
- Thông tin lô hàng in trên bất kỳ loại chứng từ nào cũng được đọc, hiện ở tab chứng từ đó trên màn OCR, và chảy vào tờ khai.
- Chứng từ mới, mẫu lạ không cần sửa code để các ô tờ khai được điền.
- Không thêm thao tác cho người dùng so với hiện nay. Chỉ bớt.

Không mục tiêu (làm sau, ngoài phạm vi):
- Trường riêng của doanh nghiệp (túi `custom`) lên tờ khai; khu "Thông tin khác" với nút "Gán vào ô" tự học alias. Đây là bước kế tiếp, dựng trên nền bản này.
- Thêm loại chứng từ mới (booking, shipping instruction, hóa đơn GTGT).
- Đối chiếu ngược B/L, C/O với tờ khai đã truyền (ADR 0013 giai đoạn 3).
- Mặc định xuất xứ VN cho hàng xuất; liên kết danh mục theo người mua; MST người mua nước ngoài. Đã ghi backlog riêng.

Phản mục tiêu (làm được mà vẫn coi là hỏng):
- Model điền giá trị không in trên giấy (bịa). Một ô sai tốn hơn một ô trống.
- Số lượng ô "Cần xem" tăng vì cảnh báo vô ích ở những cặp đã biết là ghi chung chung (C/O, hóa đơn cước – xem 5.1). Lệch chữ giữa các chứng từ khác thì vẫn báo: người dùng chọn được review.
- Hồ sơ đã khai xong bị đổi dữ liệu khi đọc lại.

## 3. Ràng buộc

- API Claude structured output giới hạn 16 tham số kiểu union trong một schema; trường nullable là union. `ai-schema.ts` đã né bằng cách gửi chuỗi/ngày nullable dạng chuỗi rỗng. Khối mới phải đi qua cùng cơ chế và test `ai-schema.test.ts` (đếm union ≤ 16) phải còn xanh cho cả 8 loại chứng từ, kể cả khi doanh nghiệp thêm 20 trường bổ sung.
- Khóa idempotency của extraction gồm `EXTRACTION_SCHEMA_VERSION` và `PROMPT_VERSION` (`process-document.ts:57`). Đổi schema thì phải tăng phiên bản; hồ sơ cũ muốn có ô mới phải đọc lại và tính tiền lượt đọc mới.
- Trạng thái trường theo ADR 0003: tính từ tín hiệu, không lấy từ model. Thiết kế này không thêm trạng thái mới.
- Nhập tay (`manual.ts`) và hóa đơn phát hành (`issued.ts`) vẫn thắng dữ liệu đọc. Không đổi.
- Quy ước repo: đổi quy ước gộp phải có ADR; nhãn đủ vi/en/zh; mọi thay đổi có test; hai agent review trước commit.

## 4. Các cách đã cân nhắc

| Cách | Nội dung | Được | Mất |
|---|---|---|---|
| A. Vá theo trường | Thêm cảng, tàu, container, L/C vào schema Invoice và PL; thêm INVOICE vào nguồn các ô đó | Nhanh, giải ca này | Vẫn khóa cứng; khách sau in thông tin khác lại sửa code |
| **B. Khối lô hàng dùng chung (chọn)** | Mọi loại chứng từ đọc cùng một khối trường lô hàng; mọi chứng từ là nguồn ngang nhau của mọi ô | Chứng từ mới, mẫu lạ không cần sửa code; càng nhiều chứng từ càng nhiều ô được đối chiếu chéo | Tốn thêm token mỗi chứng từ; hồ sơ dở phải đọc lại; trường riêng doanh nghiệp vẫn chưa lên tờ khai |
| C. Nhãn–giá trị tự do + ánh xạ học được | Model trả mọi cặp nhãn–giá trị; lớp ánh xạ về ô chuẩn; người dùng "gán vào ô", hệ thống học alias | Dynamic tuyệt đối, kiêm lối ra cho trường bổ sung | Ánh xạ sai khó phát hiện hơn thiếu ô; khối lượng lớn; người dùng gán tay vài lần đầu cho mỗi khách |

Người dùng chọn B. C giữ làm bước kế tiếp, dựng trên B.

Trong B, một phương án con đã bị người dùng bác: chia nguồn thành "chủ" và "dự phòng" theo từng ô (B/L là chủ của cảng, invoice chỉ là dự phòng). Lý do bác: chứng từ nào cũng có thể chứa thông tin cần thiết, và chứng từ nào đáng tin phụ thuộc hướng (hàng xuất lúc khai chỉ có invoice/PL do chính mình lập, B/L có sau). Gán cứng "chủ" theo ô là một kiểu khóa cứng nữa.

## 5. Các quyết định thiết kế

### 5.1 Mọi chứng từ là nguồn ngang nhau

Quyết định của người dùng.

- Mỗi ô lô hàng lấy giá trị từ bất kỳ chứng từ nào có in. Invoice, Packing List, Contract, OTHER… đứng ngang hàng B/L, AWB, Arrival Notice: được đọc, được so, lệch thì cảnh báo.
- Ngoại lệ giữ nguyên như hiện nay (người dùng chọn phương án A): hai cặp đã biết là ghi chung chung vẫn giữ cờ `fallback`, chỉ dùng khi mọi nguồn khác trống và không đem ra so.
  - C/O cho cảng xếp/dỡ (C/O ghi "HO CHI MINH, VIET NAM" khi B/L ghi "CAT LAI").
  - Hóa đơn cước cho ngày hàng đến (ngày phát hành hóa đơn ≈ ngày hàng về, không phải ETA).
  Lý do: bỏ hai ngoại lệ này sẽ thêm một cảnh báo vô ích cho gần như mọi hồ sơ nhập có C/O. So bằng mã cảng để tự khớp "CAT LAI" với "HO CHI MINH" để đợt sau.
- Một nguồn: `SINGLE_SOURCE`. Hai chứng từ ghi khớp sau chuẩn hóa: `CROSS_CHECKED`. Khác nhau sau chuẩn hóa: `CONFLICT`, hiện ở "Cần xem", kèm ghi chú "B/L ghi X; Invoice ghi Y". Việc kiểm là của người dùng.
- Khi `CONFLICT`, giá trị mặc định hiện ra lấy theo thứ tự nguồn hiện có trong `shipment-spec` (thứ tự chỉ còn vai trò chọn mặc định, không còn quyền thắng im lặng). Người dùng nói "trên cái nào cũng được, miễn có cảnh báo".

### 5.2 Khối lô hàng (`ShipmentBlockSchema`)

Đề xuất của tôi. Một schema Zod dùng chung, gắn vào **cả 9 loại chứng từ kể cả `OTHER`** (chứng từ lạ bị phân loại OTHER; không gắn thì mục tiêu "mẫu lạ không cần sửa code" không đạt) dưới dạng **object lồng riêng `lot`**, không trộn vào trường của loại. Lý do lồng: nhiều loại có key trùng tên nhưng khác nghĩa (`FREIGHT_INVOICE.invoiceNo` là số hóa đơn cước, `BILL_OF_LADING.date` là ngày lên tàu, `ARRIVAL_NOTICE.vessel` gộp tàu/chuyến); lồng `lot` thì `lot.invoiceNo` luôn là số hóa đơn thương mại in trên chứng từ đó, không đụng nghĩa cũ. Mọi trường nullable, mô tả bắt đầu bằng "chỉ chép nếu in trên chứng từ".

Trường trong khối, chia theo nhóm hiện có của màn OCR:

- Vận tải: `portOfLoading`, `portOfDischarge`, `vessel`, `voyage`, `flightNo`, `containers[{no, sealNo, size}]`, `billNo`, `masterBillNo`, `departureDate`, `arrivalDate`, `packages`, `packageUnit`, `grossWeightKg`, `netWeightKg`, `volumeCbm`, `marks`, `freightTerm`.
- Thương mại: `incoterm`, `incotermPlace`, `currency`, `paymentTerms`, `lcNo`, `poNo`, `contractNo`, `invoiceNo`, `invoiceDate`.

Trường nào loại chứng từ đó đã có sẵn với cùng nghĩa (ví dụ Invoice đã có `incoterm`) thì bỏ khỏi `lot` của loại đó để model không chép hai lần; nguồn của ô vẫn đọc trường sẵn có. Danh sách bỏ theo từng loại do người làm lập, tiêu chí: cùng nghĩa, không chỉ cùng tên. Đo hiện tại: loại nặng nhất (Packing List) khoảng 9/16 union sau khi thêm khối.

`lcNo` và `sealNo` không có ô trên EDA/IDA (tra wiki `to-khai-domain-chi-tieu-to-khai-xuat-eda.md`: EDA có 2.60 container, không có ô L/C, không có ô seal). Vẫn đọc và lưu trong Shipment: seal để đối chiếu B/L và KVGS về sau; `lcNo` để gợi ý phương thức thanh toán.

Danh mục trường chuẩn (`catalog/documents.ts`) phải khớp schema (test `catalog.test.ts`), nên các trường mới của khối được thêm vào danh mục của từng loại với `since: 3` (hoặc giá trị kế tiếp) để skill cũ không bị coi là thiếu trường. Kiểu `since` hiện là `1 | 2` (`catalog/types.ts:15`) → nới thành `1 | 2 | 3`.

Ô mới trong `ShipmentSchema` (lựa chọn của tôi): `invoice.lcNo`, `invoice.contractNo`, `transport.volumeCbm`, `transport.marks`. `manual.ts:28` đang ghi `/marks` vào chỗ không tồn tại (no-op) → trỏ về `transport.marks` để nhập tay ký mã hiệu hoạt động lại.

### 5.3 Bảng gộp sinh nguồn tự động

Đề xuất của tôi. `shipment-spec.ts` giữ cấu trúc `FieldSpec`, nhưng với các ô thuộc khối lô hàng, `sources` được sinh từ danh sách loại chứng từ thay vì liệt kê tay. Thứ tự sinh = thứ tự ưu tiên hiện có của ô đó (giữ nguyên để không đổi giá trị mặc định của hồ sơ nhập khẩu hiện tại), các loại chứng từ chưa có trong danh sách nối vào sau theo một thứ tự cố định. `regionKey` = tên trường trong khối để vẫn khoanh vùng trên ảnh.

Các ô không thuộc khối (bên bán, bên mua, dòng hàng, trường đặc thù như `warehouseCode`) giữ nguyên bảng tay như hiện nay.

`merge.ts:164` hiện lấy `containers` chỉ từ B/L. Đổi thành: gom container từ mọi chứng từ, loại trùng theo số container (chuẩn hóa chữ hoa, bỏ khoảng trắng); cùng số mà seal khác thì giữ seal của nguồn đứng trước và ghi chú lệch. Container không phải trường `Sourced<string>` nên trạng thái lệch seal thể hiện bằng ghi chú trên ô "Số container", không thêm trạng thái mới.

### 5.4 Chuẩn hóa khi so

Quyết định của người dùng: cảng ghi khác chữ giữa hai chứng từ vẫn báo lệch để người dùng review, không nới lỏng.

- Cảng: chỉ chuẩn hóa như hiện nay (`str`: bỏ khoảng trắng đầu cuối) cộng chữ hoa và gộp khoảng trắng. "BA RIA - VUNG TAU (CM-TV), VIETNAM" (invoice) với "VUNG TAU" (B/L) → `CONFLICT`, người dùng chọn. Tra mã cảng để tự khớp: đợt sau.
- Tàu: model được yêu cầu tách số chuyến ra `voyage` (`COSCO SHIPPING PLANET 049W` → tàu `COSCO SHIPPING PLANET`, chuyến `049W`). Khác chữ sau khi tách → `CONFLICT`.
- Giá trị chính xác (số container, seal, số vận đơn, L/C, PO, ngày, số kiện, cân): chuẩn hóa như hiện nay (`ident`, `num`, `date`); khác là `CONFLICT`.

### 5.5 Chống bịa

Đề xuất của tôi, vì phản mục tiêu số 1.

- `SYSTEM_PROMPT` thêm một câu: chỉ chép giá trị in trên chứng từ; không suy ra cảng từ địa chỉ, không suy ra tàu từ tên hãng; không có thì để trống.
- Với file quét, giá trị trong khối lô hàng không có vùng (`_regions`) thì vẫn nhận nhưng đánh `MODEL_UNSURE` qua `uncertainties`. Người làm quyết định cách ép model ghi vào `uncertainties` khi không chỉ được vùng.
- Trước khi bật mặc định: chạy bộ đo trên ít nhất 10 chứng từ thật gồm cả loại không in thông tin vận tải, đếm số ô bịa. Ngưỡng chấp nhận: 0 ô bịa trên bộ đo. Người dùng cung cấp mẫu; bộ `evals/golden` hiện chỉ có lô nhập `hansol`.

### 5.6 Tờ khai

- EDA và IDA: `SO_CONT` / `SL_CONT` lấy container từ Shipment bất kể nguồn; `source` đang ghi cứng `"BILL_OF_LADING"` (`eda.ts:138`, `ida.ts:217`) → đổi theo nguồn thật. Ghi chú khi trống giữ nguyên. `PTVC_TEN`, cảng, `NGAY_DI` dùng `fromSourced` như hiện nay nên tự nhận nguồn mới.
- `PT_TT`: theo 5.11.
- Dữ liệu nhập tay vẫn thắng. Hồ sơ đã có giá trị nhập tay không đổi gì.

### 5.7 Màn OCR

- Tab chứng từ hiện thêm các ô lô hàng có giá trị, trong nhóm "VẬN TẢI" và "THƯƠNG MẠI" hiện có. Ô trống không hiện (hành vi hiện tại). Không thêm nhóm, không thêm nút.
- Nhãn nguồn trên ô (hiện "Một nguồn", "Khớp 2 chứng từ") giữ nguyên. Không gắn cờ "kiểm lại" cho giá trị chỉ có trên invoice: trạng thái vẫn `SINGLE_SOURCE`, ngưỡng BALANCED không đưa vào "Cần xem".
- Thẻ nhập tay lô hàng giữ nguyên; khi ô đã có giá trị đọc được, thẻ hiện giá trị đó làm gợi ý để người dùng không gõ lại (nếu thẻ chưa làm vậy; người làm kiểm).

### 5.8 Phiên bản và hồ sơ cũ

- Tăng `EXTRACTION_SCHEMA_VERSION` và `PROMPT_VERSION`. Hồ sơ đang ở bước OCR hoặc trước khi khai: người dùng bấm "Đọc lại" để có ô mới; tính tiền như một lượt đọc. Hồ sơ đã khai: không tự đọc lại, không đổi dữ liệu.
- Skill mẫu và skill doanh nghiệp hiện có: trường mới có `since` mới nên không bị báo thiếu; màn skill cho bật/tắt đọc từng trường như hiện nay.

### 5.9 Tài liệu và quy ước

- ADR mới `0018-ocr-shipment-block-every-document.md`: ghi quyết định "mọi chứng từ là nguồn ngang nhau" thay cho bảng nguồn theo loại, và lý do bỏ "chủ/dự phòng".
- Cập nhật ADR 0003 phần hệ quả nếu cần (không thêm trạng thái).
- Cập nhật `.claude/rules` hoặc skill liên quan đến thêm trường đọc, nếu có mô tả quy trình "thêm trường vào schema + shipment-spec".
- Ghi backlog còn lại (C: nhãn–giá trị tự do; trường riêng lên tờ khai) vào `docs/BACKEND-TODO.md`.

### 5.10 Định dạng đầu ra gọn (tốc độ)

Quyết định đã thống nhất với người dùng (lo chậm). Số gốc trên production (103 lượt): đầu vào trung bình 10.152 token, đầu ra trung bình 1.137 (trung vị 649); thời gian tải lên → có kết quả trung vị 16 s, p90 37 s.

- Khối `lot` **không** gửi dạng object nhiều trường nullable (model phải trả `""` cho từng ô trống, ~150 token vô ích). Gửi dạng mảng chỉ liệt kê ô có in: `lot: [{ key: <enum tên trường>, value: string }]`, mảng rỗng nếu không in gì. Enum không tính là union nên không đụng giới hạn 16.
- Sau khi nhận, chuyển mảng về object `lot` (key → value) trước khi parse bằng schema gốc, để phần còn lại của hệ thống (getter, regions, merge) thấy object như thiết kế 5.2. `containers` là mảng object riêng `lotContainers: [{no, sealNo, size}]`.
- Mục tiêu: chứng từ không in thông tin lô hàng gần như không tốn thêm đầu ra; tăng thời gian ≤ 2 s ở trung vị. Đo trên bộ mẫu trước khi bật.
- Ngoài phạm vi, làm sau: prompt caching cho phần prompt + schema cố định (code chưa dùng).

### 5.11 Phương thức thanh toán: AI chọn mã, regex kiểm chéo

Quyết định đã thống nhất với người dùng.

- Hiện nay: AI chép nguyên văn `paymentTerms`; `packages/contracts/src/declaration/payment-resolve.ts` đổi ra mã TK_IVP (1.43 / 2.38) bằng regex từ khóa. Trượt các cách viết không có từ khóa ("irrevocable documentary credit at sight", "30% deposit, balance against copy B/L", "draft at 60 days sight") và ca chỉ có số L/C.
- Thêm trường `paymentMethodCode` (enum đúng danh mục mã) vào schema của INVOICE, SALES_CONTRACT, OTHER (chỉ các loại có thể ghi điều khoản thanh toán). Mô tả kèm nghĩa từng mã và các quy tắc đã có trong `resolvePayment`: T/T, chuyển khoản → KC (không phải TTR); TTR chỉ là chuyển tiền bồi hoàn L/C; documentary credit / có số L/C → LC; đặt cọc + T/T phần còn lại → KC; không có thông tin → để trống.
- Vẫn chép nguyên văn `paymentTerms` (dùng cho chi tiết khai trị giá khi KC).
- Kiểm chéo: mã AI = mã regex → nhận, không cảnh báo. Khác, hoặc chỉ một bên có → ô thanh toán vào "Cần xem", ghi chú hiện cả hai gợi ý. `lot.lcNo` có giá trị là thêm một tín hiệu LC.
- Danh mục: code có 17 mã (`code-tables.ts:47`), wiki `to-khai-domain-danh-muc-ma-vnaccs.md` ghi 15 mã (29.DM_GANCODE). Người làm đối chiếu danh mục gốc trước khi đưa vào enum; không lấy từ trí nhớ. Lệch thì hỏi người dùng.

## 6. Để lại cho người làm

- Cách `extend` khối vào từng schema mà không trùng key với trường sẵn có; tên hằng `EXTRACTION_SCHEMA_VERSION` mới.
- Thứ tự cố định cho các loại chứng từ được nối thêm vào `sources`.
- Cách ép model đưa trường không chỉ được vùng vào `uncertainties`.
- Thẻ nhập tay có đang hiện gợi ý từ giá trị đọc được hay chưa.
- Bộ đo chống bịa: cấu trúc file mẫu, cách chạy, chỗ lưu kết quả.

## 7. Kiểm chứng

- Test đơn vị: merge với một invoice có đủ cảng/tàu/container → Shipment đủ ô, trạng thái `SINGLE_SOURCE`; invoice + B/L khớp → `CROSS_CHECKED`; khác số container → `CONFLICT` kèm ghi chú; cảng "BA RIA - VUNG TAU (CM-TV), VIETNAM" và "VUNG TAU" → `CONFLICT`.
- Test mapping: EDA từ Shipment chỉ có invoice → 2.60, PTVC_TEN, cảng có giá trị; có `lcNo` → PT_TT gợi ý LC.
- `ai-schema.test.ts` còn xanh cho cả 8 loại với 20 trường bổ sung.
- `catalog.test.ts` khớp schema.
- Bộ đo chống bịa trên chứng từ thật trước khi bật trên production.
