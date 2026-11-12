# ADR 0013 – Xuất khẩu "khai trước": dựng tờ khai từ dữ liệu lô hàng, hệ thống phát hành chứng từ

- Trạng thái: Chấp thuận (2026-11-09)
- Ngày: 2026-11-06

## Bối cảnh
Luồng hiện tại chỉ đi một chiều: **chứng từ → AI đọc → tờ khai**. Hàng xuất khẩu có hai cách làm:

1. **Chứng từ trước** (TH1): DN có Invoice/PL rồi mới khai EDA. Luồng hiện tại đã làm được, chỉ vướng một chỗ: B/L và C/O luôn có **sau** tờ khai (B/L cấp khi hàng lên tàu; C/O cần số tờ khai xuất).
2. **Khai trước** (TH2): DN (SXXK, gia công, chế xuất, có ERP) lấy dữ liệu đơn hàng để khai EDA, rồi mới làm Invoice, PL, B/L, C/O.

Câu trả lời của chủ sản phẩm (2026-11-06):
- Invoice/PL do hệ thống sinh là **chứng từ chính thức gửi khách hàng**. **Số invoice đó được khai vào chỉ tiêu số hóa đơn trên tờ khai xuất.**
- **Hóa đơn GTGT xuất khẩu** lập từ thông tin tờ khai (số tờ khai…) để **báo cáo cơ quan thuế Việt Nam**, không gửi khách.
- Dữ liệu đầu vào lấy từ **Excel, danh mục hàng hóa, tờ khai cũ và API của hệ thống nội bộ khách hàng**.

## Quyết định

### 1. Một luồng; mỗi chứng từ tự có nguồn
Không tách hai luồng. Mỗi chứng từ dự kiến của hồ sơ có `source`:

| Nguồn | Nghĩa | Ví dụ |
|---|---|---|
| `UPLOADED` | Tải lên, AI đọc (như hiện nay) | Invoice của TH1, B/L, C/O về sau |
| `ISSUED` | Hệ thống phát hành từ dữ liệu lô hàng | Invoice, PL của TH2 |
| `PENDING_AFTER_DECLARATION` | Chưa có, sẽ có sau khi khai; không chặn khai | B/L, C/O, D/O |

Hồ sơ xuất khẩu có thêm lựa chọn **Cách bắt đầu**: *Từ chứng từ* (mặc định, như cũ) hoặc *Khai trước*. Lựa chọn này chỉ đặt nguồn mặc định cho các chứng từ dự kiến; người khai đổi được từng chứng từ.

`Shipment` vẫn là nguồn sự thật duy nhất để dựng tờ khai **và** phát hành chứng từ. Hai thứ cùng một nguồn nên không thể lệch nhau.

### 2. Nguồn dữ liệu cho `Shipment` (thay bước OCR ở chế độ Khai trước)
| Nguồn | Cách làm | Nhãn nguồn chỉ tiêu |
|---|---|---|
| Excel | Mẫu tải về theo đúng cột tờ khai cần (dòng hàng + thông tin chung); parse bằng Zod; lỗi báo theo dòng/cột | `EXCEL` |
| Danh mục hàng hóa | Chọn mặt hàng từ `product-catalog` đã có: tên, HS, đơn vị, đơn giá, xuất xứ điền sẵn; chỉ nhập số lượng | `CATALOG` |
| Tờ khai cũ | Chép thông tin chung + dòng hàng từ tờ khai đã khai của DN; số lượng, trị giá để trống | `PREVIOUS_DECLARATION` |
| API hệ thống nội bộ | **Khách đẩy dữ liệu vào** (push – hệ thống không kéo từ ERP): `POST /api/v1/shipments` (API key theo doanh nghiệp, `Idempotency-Key` bắt buộc, Zod). Tạo/cập nhật hồ sơ ở trạng thái nháp, **không tự khai** | `CUSTOMER_API` |
| Nhập tay | Như form hiện có | `USER` |

Mỗi lần ghi trường vẫn ghi `field_audit` (bất biến 6) kèm nguồn. HS từ danh mục hoặc tờ khai cũ là **gợi ý**: người khai vẫn phải xác nhận theo luồng HS hiện có (bất biến 7). API nhận dữ liệu là cổng mới từ bên ngoài, nên làm theo ADR 0005: adapter riêng, ghi log, giới hạn tần suất, `orgId` lấy từ API key.

### 3. Hóa đơn thương mại: cấp số trước khai, phát hành sau thông quan (sửa 2026-11-12)
*Thay phương án cũ (phát hành trước khai + phát hành lại theo phiên bản + danh mục L/C + đối chiếu UCP600) – chủ sản phẩm thấy quá nhiều bước, chốt 2026-11-12:*
- **Cách A – giữ số trước, in sau**: bấm *Cấp số hóa đơn* (trước khi khai) → số cấp theo mẫu của doanh nghiệp, trạng thái `RESERVED`, **tự điền vào chỉ tiêu Số hóa đơn** của tờ khai. Chưa cấp số thì luật BLOCKER `R-INVOICE-ISSUED` chặn duyệt/truyền (chế độ Khai trước, nguồn Invoice `ISSUED`). Tờ khai và hóa đơn luôn cùng số (kiểm tra sau thông quan, xuất trình ngân hàng).
- **Mẫu số do doanh nghiệp cấu hình** (Cài đặt › Doanh nghiệp): chữ cố định + `{YYYY}`/`{YY}`/`{MM}` + đúng một `{NNN}` (3–8 chữ N), đánh lại theo tháng / năm / không (mặc định `INV{YY}{MM}-{NNN}`, mỗi tháng). Kiểm mẫu bằng hàm thuần dùng chung (`contracts/src/invoice-numbering.ts`): đánh lại theo tháng/năm mà thiếu mã ngày → từ chối (số sẽ trùng). Số ≤ 35 ký tự, là `string` (bất biến 2).
- **Không trùng, không tái dùng**: bộ đếm `document_counters` (khóa org, loại, mẫu, kỳ) tăng bằng UPSERT … RETURNING trong transaction cấp số (khóa dòng); index duy nhất `(org, loại, số)` trên `issued_documents` – số đã tồn tại (vd mẫu số từng đổi) thì bỏ qua lấy số kế tiếp. Hủy số = `VOID` kèm lý do, chỉ khi hồ sơ chưa khóa; cấp lại = số mới. Tờ khai đã có số Hải quan thì nhắc sửa EDD/EDE/AMA.
- **Một hồ sơ một hóa đơn** (index một phần: tối đa một số `RESERVED`/`ISSUED` mỗi hồ sơ).
- **Phát hành sau thông quan**: chỉ khi hồ sơ `CLEARED` (nút ở bước OCR & kiểm tra và bước Truyền). Chọn mẫu in + nhập thông tin bổ sung tờ khai không có (số hợp đồng, số/ngày L/C, ngân hàng phát hành, số/ngày vận đơn) – **in nguyên văn, không đối chiếu L/C**. Nội dung đóng băng vào `snapshot` (shipment + số tờ khai + ký mã hiệu + người ký + bản chép mẫu in) → `ISSUED`. Phát hành lại cùng số được (đổi mẫu/thông tin). Phát hành không đổi tờ khai nên làm được khi hồ sơ đã khóa.
- **Mẫu in do doanh nghiệp thiết kế** (bảng `invoice_templates`, chỉ Quản trị): ghép 14 nhóm thông tin chuẩn của Commercial Invoice (UCP600 Đ18, ISBP 821 mục C) – người bán, người mua, thông tin hóa đơn, L/C, vận chuyển, điều kiện, số tờ khai, ký mã hiệu, bảng hàng, tổng tiền + bằng chữ, đóng gói, xuất xứ, câu xác nhận, ô ký; bật/tắt (5 nhóm bắt buộc), kéo sắp xếp, đổi nhãn in; chọn/sắp cột bảng hàng (mô tả, số lượng, thành tiền bắt buộc); tiêu đề (cấm Proforma/Provisional), phiên bản Incoterms, câu xác nhận, số bản ORIGINAL/COPY. Nhiều mẫu, tối đa một mặc định; chưa có mẫu thì dùng mẫu dựng sẵn. Ghép bố cục trên khung có sẵn – không làm trình kéo-thả tự do.
- **In** A4 từ snapshot (lưu PDF bằng trình duyệt), nội dung tiếng Anh; Packing List cùng số, cùng mẫu nhưng bỏ nhóm/cột tiền. Render bằng **code thuần, không AI** (bất biến 5). Tiền `Decimal` (bất biến 3): tổng hóa đơn = Σ thành tiền dòng làm tròn 2 số lẻ, cùng cách với tổng trị giá trên tờ khai.
- **Một lô nhiều invoice tải lên (TH1)**: liệt kê toàn bộ số hóa đơn trên tờ khai (đã làm ở 2a, xem Lộ trình). Hóa đơn do hệ thống phát hành giữ một hóa đơn mỗi hồ sơ.
- *Chưa làm*: ký số PDF, logo trên mẫu in, xuất Excel.

### 4. Chứng từ đến sau: B/L, C/O
- Hệ thống **không phát hành B/L**; việc này do hãng tàu/forwarder làm. Hệ thống phát hành **Shipping Instruction** (dữ liệu để forwarder làm B/L) từ `Shipment`.
- C/O: xuất **bộ dữ liệu xin C/O** (số + ngày tờ khai, HS, tiêu chí xuất xứ theo form). Tích hợp eCoSys là việc sau.
- Luật đối chiếu cần chứng từ đang `PENDING_AFTER_DECLARATION` thì trả `SKIPPED` với lý do "Chờ chứng từ sau khai". Không FAIL, không chặn truyền.
- Khi B/L/C/O thật được tải lên: AI đọc (như cũ) → **đối chiếu ngược với tờ khai đã khai** (cân, kiện, container, cảng, người nhận, xuất xứ). Lệch thì hiện cảnh báo kèm gợi ý nghiệp vụ sửa. Không tự sửa tờ khai.

### 5. Hóa đơn GTGT xuất khẩu (báo cáo thuế, không gửi khách)
- **Thời điểm**: chỉ lập khi tờ khai **đã thông quan** (lô nhiều tờ: theo từng tờ đã thông quan, hoặc gộp khi mọi tờ thông quan – cấu hình doanh nghiệp). Trước đó nút lập hóa đơn khóa, ghi lý do.
- Hệ thống soạn **dữ liệu hóa đơn GTGT** từ tờ khai: số/ngày tờ khai, người mua, dòng hàng, trị giá, tỷ giá.
- **Tỷ giá** – doanh nghiệp chọn một trong hai (cấu hình chung, sửa được trên từng hóa đơn trước khi phát hành):
  - *Theo tờ khai*: tỷ giá tính thuế trên tờ khai đã thông quan.
  - *Tỷ giá thiết lập chung*: bảng tỷ giá doanh nghiệp tự đặt cho việc xuất hóa đơn (theo ngày, theo loại tiền).
  Tỷ giá và nguồn của nó lưu cùng hóa đơn; quy đổi bằng `Decimal`.
- Gửi qua port `EInvoiceProvider` (module `integration`, ADR 0005, job nền, idempotency theo số tờ khai + phiên bản). **Thiết kế cho mọi nhà cung cấp** (port chung, mỗi nhà cung cấp một adapter, tài khoản lưu `org_secrets`); **MISA meInvoice làm adapter đầu tiên**. Có adapter giả cho dev/test – không gọi MISA thật khi phát triển.
- Người khai xem bản nháp rồi mới bấm phát hành. Lưu số/ký hiệu HĐĐT trả về vào hồ sơ. Tờ khai sửa đổi sau khi đã phát hành HĐĐT thì gợi ý lập hóa đơn điều chỉnh/thay thế.

## Lộ trình
1. **GĐ1 – Khai khi chưa đủ chứng từ**: `source` cho chứng từ dự kiến; luật trả `SKIPPED` khi chứng từ `PENDING_AFTER_DECLARATION`. Có ích ngay cho TH1.
   *Đã làm (2026-11-09)*: `dossiers.document_sources` (migration 0034); hồ sơ XK mới có vận đơn (B/L hoặc AWB theo phương thức) mặc định "có sau khi khai"; bước Tải chứng từ có nút gạt cho B/L, AWB, C/O của hồ sơ XK; đổi xong chạy lại luật. Luật khai báo `awaits`: **chỉ khi luật đã SKIPPED vì thiếu dữ liệu** thì đổi lý do thành "Chờ chứng từ sau khai". Dữ liệu đã có (nhập tay, chứng từ khác) mà sai thì vẫn FAIL/WARN. `R-CONTAINER-LIST` vẫn chặn hàng XK container chưa có số container, kèm nhắc nhập số container theo booking / Packing List (chủ sản phẩm chốt).
2. **GĐ2 – Chế độ Khai trước**: nhập từ Excel, danh mục hàng hóa, tờ khai cũ; phát hành Invoice/PL, dãy số, điền số hóa đơn vào tờ khai; Shipping Instruction. Chia phần: 2a liệt kê số hóa đơn → 2b phát hành Invoice/PL (đã làm) → 2c nguồn dữ liệu lô hàng (danh mục, tờ khai cũ, Excel) → mẫu PDF/Excel, ký số, Shipping Instruction.
   *2a đã làm (2026-11-10)*: `mapping/invoice-list.ts` – lô ≥ 2 hóa đơn ghi "So HD: <số> <dd/mm/yyyy>, …" theo thứ tự chứng từ vào Phần ghi chú (≤ 100), tràn sang IDA 1.50 (≤ 280, nối ngay sau `DDMMYYYY#&`) / EDA 2.32 (≤ 140); nội dung sẵn có của ô giữ nguyên. Không đủ chỗ hoặc hóa đơn chưa đọc được số → nghi ngờ ở Phần ghi chú, gợi ý HYS. Áp dụng cho invoice tải lên (TH1). Số hóa đơn (chỉ tiêu Số hóa đơn) giữ cách cũ. Biết còn thiếu: dòng hàng hiện chỉ gộp từ hóa đơn đầu tiên (`extraction/domain/merge.ts` `mergeItems`) – xử lý cùng 2b.
   *Nhập tay lô hàng đã làm (2026-11-10, làm trước 2b vì phát hành invoice cần dữ liệu)*: bảng `manual_shipments` (migration 0035, RLS), `extraction/domain/manual.ts` ghép sau khi gộp chứng từ – nhập tay thắng chứng từ, chứng từ khác số → `CONFLICT` kèm ghi chú; dòng hàng nhập tay thay dòng đọc từ chứng từ; thành tiền dòng = SL × đơn giá làm tròn 2 số lẻ (Decimal), tổng = Σ dòng. Lưu → `field_audit` nguồn `MANUAL_EDIT` từng ô đổi, gộp lại shipment, luật, tờ khai nháp. API `GET/PUT /api/dossiers/:id/manual-shipment`. Giao diện: bước Tải chứng từ (hồ sơ XK chưa có chứng từ) có nút "Nhập tay dữ liệu lô hàng"; bước OCR có khối "Dữ liệu lô hàng nhập tay" (popup: người mua, điều kiện giao hàng, vận chuyển, dòng hàng – chọn mặt hàng từ danh mục hàng hóa điền sẵn tên/mã/HS gợi ý/đơn vị/xuất xứ). Số invoice không nhập tay – cấp khi phát hành (2b). Chưa làm: Excel, chép tờ khai cũ.
   *Mẫu số invoice (chốt 2026-11-10)*: `{PREFIX}{YY}{MM}-{NNN}`, đánh lại mỗi tháng.
   *Sau thông quan (2026-11-12)*: migration `0037_invoice_after_clearance` + `0038_invoice_release_columns` (`issued_documents` bỏ `version`, trạng thái `RESERVED`/`ISSUED`/`VOID`, `snapshot` null khi mới cấp số, `released_*`, `template_id`, index số duy nhất; `invoice_templates`; `organizations.invoice_number_pattern/reset`). Use case `issueInvoiceAction` (RESERVE / RELEASE / VOID), `invoice-templates.ts`. Dữ liệu GĐ2b cũ: SUPERSEDED bị xóa, ACTIVE → ISSUED.
   *2b đã làm (2026-11-10, phần phát hành lại theo phiên bản đã thay ở mục 3)*: tạo hồ sơ XK có **Cách bắt đầu** (*Từ chứng từ* / *Khai trước* – `startMode`); khai trước đặt Invoice + PL nguồn `ISSUED` (bước Tải chứng từ có nút gạt "Hệ thống phát hành" từng loại, ô ISSUED không nhận file, không tính là thiếu). Bảng `issued_documents` (mỗi dòng một phiên bản: `ACTIVE` / `SUPERSEDED` / `VOID`, nội dung đóng băng `snapshot` jsonb, index một phần: tối đa một bản ACTIVE mỗi hồ sơ) + `document_counters` (khóa `org, loại, tiền tố, YYMM`; tăng bằng UPSERT … RETURNING trong transaction phát hành – khóa dòng tới khi commit), migration 0036, RLS. Use case `issueInvoiceAction` (ISSUE / REISSUE / VOID) ở module extraction: số cấp lúc phát hành; phát hành lại chỉ khi dữ liệu lô hàng đã đổi và tờ khai chưa có số Hải quan (cùng số, phiên bản + 1); hủy = `VOID` kèm lý do, số không dùng lại, phát hành tiếp cấp số mới; tờ khai đã có số thì giao diện nhắc sửa EDD/EDE/AMA. Mỗi thao tác ghi `field_audit` (`/invoice/no`, nguồn `INVOICE_ISSUE`) rồi gộp lại shipment: `applyIssued` ghép **sau cùng** – số → `invoice.no` (chỉ tiêu Số hóa đơn; nhãn nguồn hiển thị "Invoice"), ngày invoice nếu lô hàng chưa có, `shipment.issuedInvoice`. Luật BLOCKER `R-INVOICE-ISSUED` (XK, nguồn Invoice `ISSUED`): chưa có `issuedInvoice` → FAIL (số nhập tay không thay được). Tổng invoice = Σ thành tiền dòng làm tròn 2 số lẻ (cùng cách với `manualTotal`). PL cùng số, kiện/trọng lượng lấy từ shipment. Tiền tố: nhập lúc phát hành, gợi ý theo lần gần nhất của doanh nghiệp (chưa có màn cấu hình riêng). Gộp chứng từ: dòng hàng nối từ **mọi** invoice theo thứ tự (lô nhiều invoice đánh số dòng lại liên tục), tổng = Σ tổng các invoice. Giao diện: khối "Invoice & Packing List phát hành" ở bước OCR & kiểm tra (xem trước, phát hành, phát hành lại, hủy số có lý do, lịch sử). Chưa làm: mẫu PDF/Excel, ký số, nhãn nguồn riêng `ISSUED_INVOICE` trên tờ khai, một lô nhiều invoice phát hành (hiện một invoice mỗi hồ sơ).
   *2b – UCP600 & L/C (2026-11-11) – ĐÃ BỎ 2026-11-12, thay bằng mục 3 mới (cấp số trước khai, phát hành sau thông quan, mẫu in doanh nghiệp; gỡ danh mục L/C, migration 0037 cũ, đối chiếu UCP600). Ghi lại để truy vết:* danh mục **thư tín dụng** (`letters_of_credit`, migration 0037, RLS; thuộc module extraction vì phát hành phải khóa dòng L/C trong cùng transaction – depcruise `module-infra-own-schema`). Sửa L/C = tu chỉnh, `version` + 1; số đã dùng = Σ invoice ACTIVE theo `issued_documents.lc_id` (không lưu). Khối nhập tay có **phương thức thanh toán** (L/C / T/T / khác), chọn L/C (phải còn mở, cùng loại tiền), **ký mã hiệu**, nút chép nguyên văn tên/địa chỉ applicant. Phát hành theo L/C: `checkInvoiceAgainstLc` (code thuần) – BLOCKER chặn: loại tiền (UCP600 18(a)(iii)), vượt số tiền kể cả dung sai (18(b), 30(a); "about" = ±10%), **tên người mua ≠ applicant nguyên văn từng ký tự** (18(a)(ii) – quyết định 2026-11-11), tên người bán ≠ beneficiary, L/C hết hạn/đóng, cấm giao từng phần mà đã có chuyến khác (31), Incoterm khác; WARNING cần tick "đã xem": mô tả hàng (18(c)), nước applicant (14(j)), quá ngày giao hàng muộn nhất, L/C đã sửa sau khi phát hành. Snapshot thêm `lc`, `marks`, `signatory`, địa chỉ người bán, phiên bản Incoterms. Cài đặt › Doanh nghiệp: tiền tố số mặc định, người ký, **tên người bán trên chứng từ** (tiếng Anh, khớp beneficiary; rỗng = tên DN) (`organizations.invoice_*`). Hạn L/C so với **max(hôm nay, ngày invoice)**. L/C đang được hồ sơ chọn không xóa được; L/C đóng/đổi sau khi chọn không khóa việc sửa dữ liệu lô hàng (chỉ chặn lúc phát hành). **Trang in A4** `/dossiers/:id/issued-invoice/:issuedId/print?doc=invoice|packing`: in từ snapshot, nhãn chứng từ tiếng Anh, bộ ORIGINAL/COPY theo L/C (UCP600 17), mô tả hàng L/C dòng đầu, `TERMS – INCOTERMS® 2020`, số tiền bằng chữ (`amountInWords`, `@kb/contracts`), câu bắt buộc, ô ký; bản VOID/SUPERSEDED có chữ chìm. Chưa làm: số trang "Page x/y" trên từng trang giấy khi hóa đơn dài, trọng lượng từng dòng trên PL, ký số, đọc L/C (MT700) bằng AI, nhiều L/C một hồ sơ. Số đoạn ISBP 821 chưa đối chiếu bản chính thức (ICC Pub. 821E).
3. **GĐ3 – Đối chiếu ngược** B/L, C/O với tờ khai đã khai, gợi ý EDD/EDE/AMA.
4. **GĐ4 – Tích hợp**: API hệ thống nội bộ khách hàng; HĐĐT GTGT xuất khẩu; dữ liệu xin C/O.

## Hệ quả
- Bất biến 5 giữ nguyên: phát hành chứng từ và HĐĐT là code thuần; AI chỉ đọc chứng từ đến sau.
- Thêm bảng: số chứng từ phát hành (dãy số, phiên bản, `VOID`), mẫu chứng từ theo doanh nghiệp, API key + nhật ký nhận dữ liệu, lần phát hành HĐĐT. Mọi bảng có `org_id` + RLS.
- Mẫu Invoice/PL, thông báo lỗi, nhãn nguồn mới phải có đủ 3 ngôn ngữ trên giao diện. Nội dung chứng từ in ra theo ngôn ngữ mẫu chọn, độc lập với ngôn ngữ giao diện.

## Đã chốt (chủ sản phẩm, 2026-11-06)
1. HĐ GTGT xuất khẩu lập **sau khi tờ khai thông quan**; tỷ giá **theo tờ khai** hoặc **tỷ giá thiết lập chung** của doanh nghiệp (mục 5).
2. Nhà cung cấp HĐĐT: **hỗ trợ tất cả**, **MISA trước** (mục 5).
3. Ký số invoice: **tùy chọn theo từng khách hàng** (mục 3).
4. Lô nhiều invoice: **khai tất cả số hóa đơn vào tờ khai** – ghi chú, ký hiệu và số hiệu, chi tiết khai trị giá (mục 3).
5. API nội bộ: **khách đẩy dữ liệu vào** (mục 2).
6. Độ dài tối đa khi liệt kê nhiều số hóa đơn (chốt 2026-11-10): **Phần ghi chú 100 ký tự**, **Ký hiệu và số hiệu 140**, **Chi tiết khai trị giá 280**. Code: 140 (`mapping/eda.ts` `MRK_MAX`), 280, ghi chú 1.68 / 2.57 = 100 trong danh mục chỉ tiêu (cảnh báo độ dài, chặn sửa ô, luật HYS `noteMaxLen`). Riêng đặc tả trường FPT của EDA (`contracts/src/fpt/eda.ts` `TK_NT2`) trước để không giới hạn vì FPT ghi "Memo" – đã đặt 100 cho khớp IDA.
7. Hóa đơn thương mại (chốt 2026-11-12): **phát hành sau tờ khai thông quan**; số **cấp trước khi khai** và điền vào tờ khai (cách A); **bỏ danh mục L/C và kiểm tra UCP600**; **một hồ sơ một hóa đơn**; mẫu số và mẫu in do doanh nghiệp cấu hình (mục 3).

## Còn mở
1. Tài khoản MISA meInvoice sandbox để làm adapter, và hồ sơ API MISA bản đang dùng.
