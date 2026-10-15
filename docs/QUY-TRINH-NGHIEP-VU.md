# Quy trình nghiệp vụ KhaiBáo AI

> Cập nhật 2026-10-16 theo code hiện tại (nhánh `main`). Tài liệu này mô tả **hệ thống đang chạy thế nào**. Định hướng sản phẩm: `docs/PRODUCT.md`; kiến trúc: `docs/ARCHITECTURE.md`; quyết định: `docs/adr/`.
> Căn cứ pháp lý chính: Phụ lục II TT39/2018/TT-BTC sửa đổi bởi TT121/2025/TT-BTC (hiệu lực 01/02/2026), CV 2061/TCHQ-GSQL.

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Doanh nghiệp, người dùng, vai trò](#2-doanh-nghiệp-người-dùng-vai-trò)
3. [Vòng đời hồ sơ – 6 bước](#3-vòng-đời-hồ-sơ--6-bước)
4. [Bước 1 – Tạo hồ sơ](#4-bước-1--tạo-hồ-sơ)
5. [Bước 2 – Upload chứng từ](#5-bước-2--upload-chứng-từ)
6. [Bước 3 – OCR & kiểm tra](#6-bước-3--ocr--kiểm-tra)
7. [Bước 4 – AI Agent: mã HS, dựng tờ khai, số hóa](#7-bước-4--ai-agent-mã-hs-dựng-tờ-khai-số-hóa)
8. [Bước 5 – Review & phê duyệt tờ khai](#8-bước-5--review--phê-duyệt-tờ-khai)
9. [Bước 6 – Khai báo Hải quan (12 nghiệp vụ)](#9-bước-6--khai-báo-hải-quan-12-nghiệp-vụ)
10. [Cấu hình doanh nghiệp](#10-cấu-hình-doanh-nghiệp)
11. [Gói dịch vụ & hạn mức](#11-gói-dịch-vụ--hạn-mức)
12. [Khu Quản trị hệ thống (đội vận hành)](#12-khu-quản-trị-hệ-thống-đội-vận-hành)
13. [Việc nền & thông báo](#13-việc-nền--thông-báo)
14. [Bất biến nghiệp vụ](#14-bất-biến-nghiệp-vụ)
15. [Chưa làm / hạn chế hiện tại](#15-chưa-làm--hạn-chế-hiện-tại)

---

## 1. Tổng quan

KhaiBáo AI đưa doanh nghiệp xuất nhập khẩu **tự khai báo** đi từ bộ chứng từ tới tờ khai Hải quan trong một luồng:

```mermaid
flowchart LR
  A[Bộ chứng từ<br/>Invoice, PL, B/L, C/O…] --> B[AI đọc chứng từ]
  B --> C[Đối chiếu chéo<br/>26 luật]
  C --> D[Người khai kiểm tra/sửa]
  D --> E[Gợi ý HS<br/>người xác nhận]
  E --> F[Dựng tờ khai<br/>IDA/EDA – code thuần]
  F --> G[Người duyệt phê duyệt]
  G --> H[Khai báo Hải quan<br/>qua Customs Hub / FPT.VNACCS]
```

**Nguyên tắc:** AI chỉ **đọc chứng từ** và **gợi ý mã HS**. Đối chiếu, ánh xạ chỉ tiêu tờ khai, tính trị giá/thuế, quyết định chặn truyền là **code thuần có test** (ADR 0002).

## 2. Doanh nghiệp, người dùng, vai trò

### 2.1 Đăng ký và tham gia

```mermaid
flowchart TD
  R[Đăng ký: email + mật khẩu + MST] --> Q{MST đã có<br/>trong hệ thống?}
  Q -- Chưa --> N[Tạo doanh nghiệp<br/>gói TRIAL, người đăng ký = OWNER<br/>sao chép Skill mẫu] --> L[Đăng nhập ngay<br/>+ gửi email xác thực]
  Q -- Có --> J[Gửi yêu cầu tham gia<br/>PENDING] --> O[OWNER/ADMIN duyệt] --> M[Thành viên vai trò DECLARANT]
```

- MST 10 hoặc 13 số; tên/địa chỉ điền sẵn từ tra cứu đăng ký thuế (hiện là adapter giả).
- Đăng ký tối đa 5 lần/IP/giờ. Đăng nhập: khóa 15 phút sau 10 lần sai (theo email + IP). Phiên 30 ngày, tự gia hạn khi còn < 15 ngày.
- Quên mật khẩu: tối đa 3 yêu cầu/email/giờ, luôn trả "đã gửi" (không lộ email có tồn tại).
- Mời thành viên: mọi vai trò trừ OWNER; lời mời hạn 7 ngày; người được mời đặt tên + mật khẩu là vào được.

### 2.2 Vai trò

| Vai trò | Được làm |
|---|---|
| **OWNER** | Mọi việc (luôn qua kiểm quyền) |
| **ADMIN** | Quản lý thành viên, chứng thư số, tài khoản VNACCS, Skill AI, Mặc định khai báo, ngưỡng nghi ngờ, nguyên tắc 4 mắt + mọi việc của Nhân viên khai báo. **Không được phê duyệt tờ khai** |
| **DECLARANT** (Nhân viên khai báo) | Tạo/hủy hồ sơ, upload, sửa/xác nhận trường, chạy AI Agent, xác nhận HS, sửa chỉ tiêu tờ khai, chuyển sang duyệt, truyền và thực hiện các nghiệp vụ Hải quan |
| **APPROVER** (Người duyệt) | Phê duyệt tờ khai + mọi việc của Nhân viên khai báo |
| **VIEWER** | Chỉ xem |

- **Nguyên tắc 4 mắt** (cấu hình doanh nghiệp, mặc định tắt): người duyệt phải khác người tạo hồ sơ; OWNER được miễn.
- Không ai đổi được vai trò của OWNER, tự đổi vai trò mình, tự khóa mình.

### 2.3 Dữ liệu tách theo doanh nghiệp

Mọi bảng nghiệp vụ có `org_id` + Postgres Row-Level Security; file lưu theo `orgs/{orgId}/`. Người của doanh nghiệp này không đọc/ghi được dữ liệu doanh nghiệp khác (ADR 0004).

## 3. Vòng đời hồ sơ – 6 bước

```mermaid
flowchart LR
  S1[1 Tạo hồ sơ] --> S2[2 Upload chứng từ] --> S3[3 OCR & kiểm tra] --> S4[4 AI Agent] --> S5[5 Review tờ khai] --> S6[6 Khai báo Hải quan]
```

**Trạng thái hồ sơ** và việc làm chuyển trạng thái:

```mermaid
stateDiagram-v2
  [*] --> DRAFT: Tạo hồ sơ
  DRAFT --> PROCESSING: Upload chứng từ
  PROCESSING --> NEEDS_REVIEW: Đọc xong mọi chứng từ
  NEEDS_REVIEW --> PROCESSING: Chạy AI Agent / đọc lại
  PROCESSING --> NEEDS_REVIEW: Agent xong
  NEEDS_REVIEW --> APPROVED: Người duyệt phê duyệt
  APPROVED --> NEEDS_REVIEW: Mở lại tờ khai / gọi sửa
  APPROVED --> SUBMITTED: Khai tạm (IDA/EDA)
  SUBMITTED --> NEEDS_REVIEW: Gọi sửa (IDB/IDD) → sửa
  SUBMITTED --> CLEARED: Hải quan thông quan
  CLEARED --> NEEDS_REVIEW: Sửa sau thông quan
  DRAFT --> CANCELLED: Hủy
  NEEDS_REVIEW --> CANCELLED: Hủy
  APPROVED --> CANCELLED: Hủy
```

- Hủy được khi chưa truyền (không phải SUBMITTED/CLEARED).
- Lùi bước luôn được; tiến tới bước 6 cần tờ khai đã duyệt; hồ sơ SUBMITTED/CLEARED/CANCELLED khóa đổi bước tay.
- **Hạn khai**: nhập khi tạo hồ sơ (mặc định hôm nay + 3), dùng để nhắc trên Tổng quan ("sắp hạn / quá hạn"), không chặn thao tác.

## 4. Bước 1 – Tạo hồ sơ

Người khai nhập:

| Thông tin | Ghi chú |
|---|---|
| Nhập khẩu / Xuất khẩu | Quyết định mẫu tờ khai: IDA (Mẫu 01) hay EDA (Mẫu 02) |
| Mã loại hình | A11, A12, E21, B11… |
| Cơ quan Hải quan | Chi cục đăng ký tờ khai |
| Phương thức vận chuyển | 7 mã VNACCS: 1 không · 2 biển container · 3 biển hàng rời/lỏng (cả hàng LCL vào kho CFS) · 4 bộ · 5 sắt · 6 sông · 9 khác (chỉ tiêu 1.6/2.6) |
| Phân loại cá nhân/tổ chức | Chỉ tờ khai nhập (chỉ tiêu 1.7), mặc định 4 – tổ chức gửi tổ chức |
| Đối tác nước ngoài, điều kiện giao hàng, hạn khai, bộ Skill AI, ghi chú nội bộ | |

Mã hồ sơ tự sinh `HS-{NK|XK}-{YYMM}-{NNN}`. Tạo hồ sơ tính vào hạn mức hồ sơ/tháng của gói.

**Chứng từ gợi ý** (chỉ gợi ý, không chặn): Invoice, Packing List, Hợp đồng (tùy chọn); B/L (biển) hoặc AWB (không); hàng nhập thêm Arrival Notice, C/O, và hóa đơn cước khi điều kiện EXW/FCA/FAS/FOB.

## 5. Bước 2 – Upload chứng từ

- Nhận PDF/PNG/JPG/ZIP; ≤ 25 MB/tệp, ≤ 60 trang/tệp, không nhận PDF có mật khẩu; ZIP tối đa 20 tệp bên trong.
- Tổng số trang của hồ sơ ≤ số trang/hồ sơ của gói.
- Loại chứng từ đoán sơ bộ theo tên tệp; AI phân loại lại ở bước đọc.
- Loại chứng từ: Invoice, Packing List, B/L, AWB, C/O, Hợp đồng, Arrival Notice, Hóa đơn cước, Khác.
- Trạng thái chứng từ: UPLOADING → QUEUED → READING → DONE / ERROR (đọc lại được khi ERROR). Xóa chứng từ → gộp lại dữ liệu lô hàng.

## 6. Bước 3 – OCR & kiểm tra

### 6.1 Đọc chứng từ

```mermaid
flowchart LR
  U[Chứng từ] --> C{Loại còn<br/>đoán theo tên tệp?}
  C -- Có --> AI1[AI phân loại trang<br/>+ gợi ý nhà cung cấp]
  C -- Không --> SK
  AI1 --> SK[Chọn Skill:<br/>theo nhà cung cấp, không có thì theo loại chứng từ]
  SK --> AI2[AI trích xuất theo schema + trường bổ sung + ví dụ đã duyệt]
  AI2 --> Z[Kiểm tra Zod] --> M[Gộp mọi chứng từ → Shipment<br/>phiên bản mới] --> V[Chạy 26 luật đối chiếu]
```

- Mỗi lần gọi AI ghi `usage_events` (token, chi phí).
- Lỗi dữ liệu → chứng từ ERROR; lỗi tạm (mạng, 429, 5xx) → thử lại tự động.

### 6.2 Trạng thái từng trường (ADR 0003 – theo tín hiệu, không theo % của model)

| Trạng thái | Nghĩa |
|---|---|
| CROSS_CHECKED | ≥ 2 chứng từ khớp nhau |
| SINGLE_SOURCE | Chỉ 1 nguồn |
| CONFLICT | Các chứng từ mâu thuẫn |
| INVALID_FORMAT | Sai định dạng (MST, ngày, số…) |
| MODEL_UNSURE | Model báo không chắc |
| USER_CONFIRMED | Người dùng đã sửa hoặc bấm "Đúng" |

**Ngưỡng nghi ngờ** (cấu hình doanh nghiệp): STRICT (đánh dấu cả SINGLE_SOURCE) · BALANCED (mặc định: CONFLICT, INVALID_FORMAT, MODEL_UNSURE) · RELAXED (chỉ CONFLICT, INVALID_FORMAT).

### 6.3 Người khai kiểm tra

- Màn chia đôi: chứng từ gốc bên trái (tô vị trí trường), kết quả bên phải theo nhóm.
- **Sửa** → USER_CONFIRMED; **Đúng** → USER_CONFIRMED; **Hoàn tác** → về giá trị AI đọc. Mỗi thao tác ghi `field_audit` (append-only), cập nhật dữ liệu lô hàng và chạy lại luật.
- Được đi tiếp khi còn trường nghi ngờ (chúng được đánh dấu trên tờ khai). Khóa sửa khi hồ sơ đã duyệt/truyền/hủy.
- Xuất **bảng đọc chứng từ** (Excel) theo từng chứng từ.

### 6.4 Luật đối chiếu chéo (26 luật)

Luật **BLOCKER = FAIL chặn phê duyệt và truyền**. Luật có ghi "NK" chỉ áp cho tờ khai nhập (tờ khai xuất hiển thị "Không áp dụng").

| Mức | Luật |
|---|---|
| **BLOCKER** | Tổng trị giá invoice = Σ dòng hàng · Tối đa 50 dòng/tờ khai (phải tách tờ khai) · Trị giá dòng ≤ 12 chữ số phần nguyên · Trọng lượng Packing List khớp vận đơn · Số chữ số tổng trọng lượng theo phương thức vận chuyển (không: 8+1, khác: 6+3) · Số kiện PL khớp vận đơn · Số kiện là số nguyên dương · Cước vận chuyển để cộng trị giá khi EXW/FCA/FAS/FOB (NK) · Điều kiện giao hàng có trong bảng mã (DPU chỉ tờ khai nhập) · Số AWB ≤ 20 ký tự · Danh sách container theo phương thức vận chuyển (tờ khai xuất hàng container phải có số container – TT121) · Mã nước đối tác ISO 2 ký tự · Hàng chương 84/85 khai MO/CU (CV 2061, NK) |
| **WARNING** | Số invoice trên chứng từ khác khớp · Đơn giá × số lượng = trị giá dòng (±1) · Số lượng ≤ 2 chữ số thập phân · Mô tả hàng ≤ 200 ký tự · Xuất xứ C/O khớp invoice · Phí bảo hiểm phù hợp điều kiện giao hàng (NK) · Cảng dỡ phải ở Việt Nam (NK) · Thứ tự ngày chứng từ (NK) · Tên/địa chỉ đối tác vừa ô khai · Hàng đóng chung container · Mã địa điểm lưu kho |
| **INFO** | Người mua trên invoice là doanh nghiệp theo MST (NK) · HS trên invoice chỉ tham khảo 6 số |

## 7. Bước 4 – AI Agent: mã HS, dựng tờ khai, số hóa

Người khai chọn **Tạo tờ khai** / **Số hóa chứng từ** / **Cả hai**:

| Việc | Làm gì | Ai làm |
|---|---|---|
| Tra cứu mã HS | Gửi HSCodePro theo lượt ≤ 50 dòng; nhận HS 8 số, lý do, cảnh báo, thuế NK (MFN/FTA theo C/O), VAT, tối đa 3 mã thay thế. AI có thể **hỏi lại** người khai; dòng lỗi → **Phân loại lại** | HSCodePro gợi ý – **người phải xác nhận** |
| Ánh xạ dữ liệu | Quy tắc chỉ tiêu Phụ lục II + Mặc định khai báo + ghi đè nguồn của doanh nghiệp; mỗi chỉ tiêu ghi nguồn gốc | Code |
| Dựng tờ khai | Tờ khai nháp mới (giữ chỉ tiêu người dùng đã sửa), trị giá tính thuế, khoản điều chỉnh, thuế dự kiến | Code |
| Số hóa chứng từ | Bản JSON chuẩn hóa của từng chứng từ để lưu/đính kèm | Code |

**Xác nhận HS** (bắt buộc từng dòng, 8 số theo biểu Việt Nam): chọn mã gợi ý, mã thay thế, mã trong biểu hoặc nhập tay. Thuế suất theo thứ tự: kết quả HSCodePro → biểu thuế nội bộ. Quy tắc thuế suất:
- Tờ khai xuất: 0/0. Loại hình E11/E21/E31/E41: miễn thuế NK, không thu VAT khâu nhập.
- Có C/O hợp lệ và biểu có thuế ưu đãi → thuế FTA, mã biểu thuế theo bảng TT39: ATIGA B04, ACFTA B05, AKFTA B06, AJCEP B09, VJEPA B10. EVFTA, VKFTA, CPTPP, RCEP chưa có mã trong văn bản đã đối chiếu → **chặn truyền** đến khi bổ sung bảng mã.
- Còn lại: MFN, biểu B01.

### 7.1 Ánh xạ chỉ tiêu tờ khai – các quy tắc đáng chú ý

| Chỉ tiêu | Quy tắc |
|---|---|
| 1.12/2.11 Người nhập/xuất khẩu | Theo MST tài khoản, không theo tên tiếng Anh trên chứng từ |
| 1.33 Cảng dỡ | Cảng trên B/L là cảng chuyển tải nước ngoài → lấy điểm đến cuối tại Việt Nam |
| 1.37 Văn bản pháp quy | Hàng chương 84/85: **không tự điền**; để trống, chặn phê duyệt đến khi người khai chọn MO (mới) hoặc CU (đã qua sử dụng) |
| 1.39/2.34 Hình thức hóa đơn | 1 hóa đơn → A; nhiều hóa đơn / không có → B (kèm hướng dẫn bảng kê) |
| 1.43/2.38 Phương thức thanh toán | T/T, chuyển khoản → **KC** (ghi phương thức thực tế); TTR chỉ dùng cho chuyển tiền bồi hoàn; O/A → OA |
| 1.44/2.39 Điều kiện giá | Chỉ lấy mã (bỏ địa danh); C&F/CNF chuẩn hóa; tờ khai xuất không có DPU |
| 1.44 ô 1 / 2.39 ô 4 Phân loại giá | Có dòng trị giá 0 (FOC) → C; toàn bộ FOC → B; không có hóa đơn → D (nhập) / không khai (xuất) |
| 1.48 Phí bảo hiểm | Điều kiện đã gồm bảo hiểm (CIF, CIP, C&I, DDU, DDP, DAP, DAF, DAT) → không cộng |
| 1.68 Phần ghi chú | Ghi số C/O trước (TT121), nhắc bổ sung ngày cấp; ≤ 100 ký tự |
| 2.24 Số vận đơn (xuất) | Là **số quản lý hàng hóa** do hệ thống cấp (Mẫu 14), không phải số B/L |
| 2.29 Địa điểm xếp hàng (xuất) | Bắt buộc, phải ở Việt Nam, không tự điền mặc định |
| 2.31 Ngày hàng đi (xuất) | Ngày B/L / ngày bay; không lấy ngày hàng đến |
| 2.69 Mô tả hàng (xuất) | Tự thêm "#&mã nước xuất xứ" khi truyền |

## 8. Bước 5 – Review & phê duyệt tờ khai

```mermaid
flowchart LR
  A[Agent dựng tờ khai nháp] --> B[Chuyển sang duyệt<br/>cần đủ HS đã xác nhận] --> C[Người khai sửa chỉ tiêu<br/>xem hướng dẫn khai từng chỉ tiêu] --> D{Người duyệt<br/>phê duyệt}
  D -- Đạt điều kiện --> E[APPROVED → bước 6]
  D -- Chưa đạt --> C
```

- Tờ khai dạng form theo nhóm, mỗi chỉ tiêu có **nhãn nguồn** (Invoice, B/L, C/O, Hồ sơ, Tài khoản, Mặc định, Hệ thống, Người khai sửa). Bấm **Sửa** hiện **hướng dẫn khai chỉ tiêu** trích Phụ lục II.
- Sửa tay: ghi `field_audit`, giữ qua các lần dựng lại; không sửa tay được số tờ khai, mã loại hình và các chỉ tiêu trị giá/cước/tỷ giá (sửa ở bước 3 rồi dựng lại); kiểm định dạng và độ dài theo danh mục chỉ tiêu.
- **Tỷ giá tính thuế**: tỷ giá mua chuyển khoản Vietcombank lấy tối thứ Năm, áp cho tờ khai đăng ký từ thứ Hai tuần sau. Tờ khai dựng tuần trước sẽ bị chặn khai tạm khi đã sang tuần tỷ giá mới (mở lại để dựng lại).
- Incoterm EXW/FCA/FAS/FOB hiển thị rõ cước, bảo hiểm, phí nước ngoài cộng vào trị giá tính thuế và nguồn từng khoản; phí nội địa (THC, D/O, CFS, lưu kho) không cộng.

**Điều kiện phê duyệt** (theo thứ tự): vai trò APPROVER hoặc OWNER → tờ khai đang là bản nháp → không còn luật BLOCKER = FAIL → đủ HS đã xác nhận → có tỷ giá → đúng nguyên tắc 4 mắt (nếu bật) → đã chọn MO/CU cho hàng chương 84/85 → không còn chỉ tiêu bắt buộc trống.

**Mở lại tờ khai**: được khi đã duyệt mà chưa truyền, hoặc truyền bị từ chối trước khi có số tờ khai. Đã có số tờ khai thì phải dùng nghiệp vụ gọi sửa ở bước 6.

## 9. Bước 6 – Khai báo Hải quan (12 nghiệp vụ)

Màn sắp theo **dòng đời tờ khai**: đầu trang là số tờ khai, phân luồng và nút **Tra cứu trạng thái**; khung **Việc tiếp theo** gợi ý nút chính; bên dưới là 4 giai đoạn. Nút chỉ bấm được đúng lúc, nút khóa có ghi lý do.

| Giai đoạn | Nghiệp vụ (nhập / xuất) | Ý nghĩa |
|---|---|---|
| ① Khai báo tờ khai | **IDA**/EDA → **IDB**/EDB → **IDC**/EDC | Khai tạm (nhận số tờ khai, thuế dự kiến) → gọi sửa khai tạm nếu cần → khai chính thức (phân luồng) |
| ② Sửa đổi bổ sung (trước thông quan) | **IDD**/EDD → **IDA01**/EDA01 → **IDE**/EDE | Gọi tờ khai đã phân luồng về → khai tạm sửa đổi → khai chính thức sửa đổi |
| ③ Sửa đổi sau thông quan | **AMA** → **AMB** → **AMC** | Khai tạm sửa đổi → gọi sửa bản khai tạm → khai chính thức (trong 60 ngày – TT121 Điều 20) |
| ④ Chứng từ & cảng | **HYS** · **Container qua KVGS** · **Lệ phí cảng biển** | Số hóa chứng từ · đưa container qua khu vực giám sát · nộp lệ phí cảng biển |
| Đầu trang | **IID** / IEX | Tra cứu trạng thái tờ khai, dùng mọi lúc khi đã có số tờ khai |

### 9.1 Chuyển giai đoạn

```mermaid
stateDiagram-v2
  [*] --> NOT_SENT
  NOT_SENT --> PRE_DECLARED: IDA (ký số & khai tạm)
  PRE_DECLARED --> RECALLED: IDB gọi sửa
  RECALLED --> PRE_DECLARED: sửa + duyệt lại → IDA
  PRE_DECLARED --> DECLARED: IDC khai chính thức (phân luồng)
  DECLARED --> AMEND_RECALLED: IDD gọi sửa
  AMEND_RECALLED --> AMEND_PRE_DECLARED: sửa + duyệt lại → IDA01
  AMEND_PRE_DECLARED --> AMEND_RECALLED: IDD lần nữa
  AMEND_PRE_DECLARED --> DECLARED: IDE
  DECLARED --> CLEARED: Hải quan thông quan (tra cứu IID)
  CLEARED --> POST_EDITING: Bắt đầu sửa sau thông quan
  POST_EDITING --> POST_PRE_DECLARED: sửa + duyệt lại → AMA
  POST_PRE_DECLARED --> POST_RECALLED: AMB gọi sửa
  POST_RECALLED --> POST_PRE_DECLARED: sửa + duyệt lại → AMA
  POST_PRE_DECLARED --> CLEARED: AMC
  DECLARED --> REJECTED: Hải quan từ chối
```

### 9.2 Quy tắc

- **Ký số & khai tạm (IDA)** chỉ gửi khai tạm. Người khai xem số tờ khai + thuế dự kiến rồi tự bấm **Khai chính thức (IDC)**.
- **Gọi sửa** (IDB, IDD, AMB) và **Bắt đầu sửa sau thông quan**: có hộp thoại xác nhận; thành công thì tờ khai **mở lại ở bước Review** (bản nháp). Người khai sửa chỉ tiêu, Người duyệt phê duyệt lại, rồi mới gửi được nghiệp vụ nội dung tiếp theo (IDA, IDA01, AMA).
- Nghiệp vụ gửi nội dung tờ khai (IDA, IDA01, AMA) luôn kiểm: đã duyệt, HS đủ, không còn BLOCKER, không còn lỗi chặn khi dựng dữ liệu FPT, tỷ giá đúng tuần (IDA).
- **Chặn truyền** (lỗi dựng dữ liệu FPT): thiếu MO/CU cho hàng 84/85; thiếu mã biểu thuế FTA; khoản điều chỉnh trị giá (ngoài cước/bảo hiểm) chưa gửi được ở chỉ tiêu 1.49; tờ khai xuất thiếu xuất xứ dòng hàng.
- Sau **IDC/IDE** hệ thống tự **hỏi trạng thái** (IID nhập / IEX xuất) tới khi thông quan hoặc bị từ chối.
- Đang chờ phản hồi một nghiệp vụ thì các nút khác khóa.
- **Không gửi trùng** (ADR 0005): mỗi nghiệp vụ một dòng outbox có khóa idempotency; **Gửi lại** luôn tra trạng thái trước, Hải quan đã ghi nhận thì không gửi.
- Mọi thông điệp gửi/nhận lưu ở **Nhật ký thông điệp** (đã che MST, mật khẩu) làm hồ sơ pháp lý.
- Kết nối FPT.VNACCS thật hiện hỗ trợ IDA/IDC/EDA/EDC, HYS và tra cứu. Các nghiệp vụ còn lại báo "chưa kết nối FPT" cho tới khi có đặc tả API (AMA đã có đặc tả, chưa ánh xạ). Môi trường dev/demo dùng cổng giả lập đủ 12 nghiệp vụ.

Chi tiết thiết kế: `docs/superpowers/specs/2026-10-15-luong-nghiep-vu-hai-quan-design.md`.

## 10. Cấu hình doanh nghiệp

Menu **Tài khoản & tích hợp**:

| Tab | Nội dung | Ai sửa |
|---|---|---|
| Doanh nghiệp | Thông tin doanh nghiệp (MST khóa) | OWNER/ADMIN |
| Gói & sử dụng | Gói, số hồ sơ/trang đã dùng trong tháng, chi phí AI | Xem |
| Thành viên & vai trò | Mời, đổi vai trò, khóa; duyệt yêu cầu tham gia | OWNER/ADMIN |
| Kết nối hệ thống | Trạng thái HSCodePro, Customs Hub, dịch vụ AI; kiểm tra kết nối | OWNER/ADMIN |
| Chứng thư số | Thêm, đặt mặc định, xóa; nhắc trước 30 ngày khi sắp hết hạn | OWNER/ADMIN |
| Khai báo | **Mặc định khai báo** theo NK/XK (loại hình, chi cục, kho, PTTT…), **ghi đè nguồn** từng chỉ tiêu trong phạm vi cho phép; **tài khoản VNACCS** (lưu mã hóa, không bao giờ trả mật khẩu về trình duyệt) | OWNER/ADMIN |
| Ngưỡng & giao diện | Ngưỡng nghi ngờ, nguyên tắc 4 mắt, giao diện | OWNER/ADMIN |

**Cấu hình Skill AI**: mỗi Skill là cách đọc một loại chứng từ (DOCUMENT) hoặc một nhà cung cấp (SUPPLIER).
- Trường chuẩn bật/tắt (không xóa được), tối đa 20 trường bổ sung do doanh nghiệp định nghĩa (AI đọc thật).
- Mỗi lần sửa trường tạo phiên bản mới.
- Chứng từ mẫu: AI đọc nháp nhãn → người xác nhận.
- **Đánh giá lại** cần ≥ 5 mẫu đã gắn nhãn, đo độ chính xác từng trường.

## 11. Gói dịch vụ & hạn mức

| Gói | Hồ sơ/tháng | Trang/hồ sơ | Giá (VND/tháng) |
|---|---|---|---|
| TRIAL | 10 | 20 | 0 |
| BASIC | 50 | 30 | 990.000 |
| PRO | 150 | 40 | 2.990.000 |
| ENTERPRISE | 1.000 | 100 | Theo hợp đồng |

- Tạo hồ sơ vượt số hồ sơ/tháng (gồm cả phần thưởng thêm trong tháng do đội vận hành cấp) hoặc upload vượt số trang/hồ sơ → `QUOTA_EXCEEDED`.
- Kỳ tính theo tháng dương lịch. Mọi lần gọi AI ghi `usage_events` (token, chi phí USD và VND) theo doanh nghiệp.

## 12. Khu Quản trị hệ thống (đội vận hành)

Khu `/admin` dành cho đội vận hành KhaiBáo AI, nhìn xuyên doanh nghiệp nhưng **chỉ số liệu tổng hợp** (ADR 0006). Bắt buộc **2FA (TOTP)**; mọi thao tác ghi nhật ký kiểm toán.

| Vai trò | Quyền |
|---|---|
| SUPER_ADMIN | Xem, hỗ trợ, gói & thanh toán, nền tảng, nhân sự |
| SUPPORT | Xem, hỗ trợ |
| READONLY | Xem |

Chức năng: tổng quan "Cần chú ý" (vượt hạn mức, gói sắp hết hạn, lỗi tích hợp, job lỗi, yêu cầu tham gia chờ, lấy tỷ giá lỗi) · doanh nghiệp (tạm khóa/mở, đổi gói, cấp thêm hạn mức, gia hạn dùng thử) · người dùng (khóa/mở, gửi lại email, thu hồi phiên) · gói · báo cáo sử dụng/biên lợi nhuận · tích hợp nền tảng (khóa API) · sức khỏe hệ thống và job lỗi (chạy lại) · Skill mẫu · thông báo hệ thống · **tỷ giá tính thuế** (sửa tay có lý do) · nhân sự · nhật ký kiểm toán.

## 13. Việc nền & thông báo

**Việc nền (BullMQ, worker):**

| Job | Việc |
|---|---|
| `extract-document` | Đọc một chứng từ (hoặc chỉ gộp lại) |
| `run-agent` | Chạy các việc của AI Agent |
| `hs-poll`, `hs-answer`, `hs-reclassify` | Theo dõi / trả lời / phân loại lại mã HS với HSCodePro (hỏi mỗi 3 giây, tối đa 15 phút) |
| `customs-send`, `customs-poll` | Gửi một nghiệp vụ Hải quan; hỏi trạng thái tới khi thông quan |
| `skill-sample-read`, `skill-evaluate` | Đọc nháp nhãn mẫu; đánh giá độ chính xác Skill |
| `cert-expiry` | Hằng ngày: nhắc chứng thư số sắp hết hạn |
| `exchange-rate-weekly` | Thứ Năm 23:30 giờ VN: lấy tỷ giá Vietcombank (thử lại mỗi 30 phút) |

**Thông báo trong ứng dụng:**

| Sự kiện | Gửi cho |
|---|---|
| Yêu cầu tham gia / được duyệt | OWNER, ADMIN / người yêu cầu (kèm email) |
| Đọc xong mọi chứng từ, Agent xong, tờ khai được duyệt | Người tạo hồ sơ |
| Hồ sơ chờ phê duyệt | APPROVER, OWNER |
| Kết quả phân luồng, đã thông quan | Người tạo hồ sơ + APPROVER |
| Gọi tờ khai về sửa, nghiệp vụ bị từ chối | Người tạo hồ sơ |
| Chứng thư số sắp hết hạn | OWNER, ADMIN |
| Thông báo hệ thống của đội vận hành | Thành viên các doanh nghiệp được chọn |

## 14. Bất biến nghiệp vụ

1. Mọi truy vấn/ghi dữ liệu nghiệp vụ có `orgId`.
2. Mã định danh (MST, MAWB, HAWB, số invoice/C/O/container, HS) là chuỗi.
3. Tiền/trị giá tính bằng `Decimal`.
4. Ngày nghiệp vụ `YYYY-MM-DD`; thời điểm UTC.
5. AI chỉ đọc chứng từ và gợi ý HS; đối chiếu, ánh xạ, thuế, chặn truyền là code thuần có test.
6. Người dùng sửa trường → ghi `field_audit` append-only.
7. Không truyền tờ khai khi còn BLOCKER FAIL hoặc HS chưa xác nhận.
8. Mọi lần gọi AI ghi `usage_events`.
9. Dữ liệu từ ngoài (HTTP, form, AI, file, queue) kiểm bằng Zod trước khi dùng.

## 15. Chưa làm / hạn chế hiện tại

| Mảng | Hiện trạng |
|---|---|
| Kết nối FPT.VNACCS | Chưa có đặc tả API cho IDB, IDD, IDA01, IDE, AMB, AMC, container qua KVGS, lệ phí cảng biển; AMA có đặc tả nhưng chưa ánh xạ |
| Bảng mã biểu thuế | Chưa có mã cho EVFTA, VKFTA, CPTPP, RCEP (TT121 dẫn chiếu bảng mã trên website Cục Hải quan) |
| Khoản điều chỉnh trị giá 1.49 | Chưa gửi được sang FPT (chặn truyền nếu có) |
| Số quản lý hàng hóa (tờ khai xuất, Mẫu 14) | Chưa lấy tự động; người khai nhập tay |
| Hàng LCL qua kho CFS | Hai văn bản hướng dẫn khác nhau (TT39: mã 3; CV 6376: mã 2) – cần chốt |
| Đọc chứng từ | Chưa đọc lớp chữ PDF / XML hóa đơn điện tử; mọi chứng từ gửi AI |
| Tài khoản | Xác thực email chưa bắt buộc khi đăng nhập; chưa có trang xác thực email / đặt lại mật khẩu / nhận lời mời; chưa chuyển quyền sở hữu, chưa từ chối yêu cầu tham gia; tra cứu MST là giả lập |
| Chi phí | Chỉ ghi chi phí AI; chưa ghi chi phí HSCodePro và Customs Hub |
| Khác | Hủy tờ khai (Mẫu 06), tách vận đơn (Mẫu 12), khai danh sách container qua HYS, đóng chung container nhiều tờ khai xuất (Mẫu 15); đại lý khai hộ nhiều doanh nghiệp; app mobile |
