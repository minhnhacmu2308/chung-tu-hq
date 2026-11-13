# Qua khu vực giám sát (KVGS) – khai danh sách container, lấy DS qua KVGS, in bản kê mã vạch

- Ngày: 2026-11-13 · Trạng thái: chờ duyệt spec
- ADR: [0014](../../adr/0014-kvgs-container-list-and-barcode-print.md)
- Tài liệu nguồn: `docs/mauin_danhsachcontqua_kvgs/` (2 mẫu in thật: *In bản kê mã vạch container*, *In bản kê mã vạch hàng lẻ*), ảnh màn "Khai báo danh sách container của tờ khai" của phần mềm khai báo đang dùng, `docs/vnaccs-api/README.md` (`V5ContainerReq/Res`, `KVGS`).

## 1. Mục tiêu

Sau khi tờ khai được thông quan / giải phóng hàng, doanh nghiệp đưa hàng qua khu vực giám sát (KVGS) của cảng/kho. Công chức giám sát **quét mã vạch trên bản kê** để lấy dữ liệu doanh nghiệp đã truyền vào hệ thống, đối chiếu, rồi ký – đóng dấu xác nhận lên chính bản in đó.

KhaiBáo AI phải làm trọn trong hồ sơ:

1. **Hàng nhập đi container**: khai danh sách container (vận đơn – số container – số seal) với Hải quan; dữ liệu điền sẵn từ vận đơn đã OCR, người dùng kiểm tra/sửa.
2. **Mọi tờ khai đã thông quan**: gửi yêu cầu lấy danh sách qua KVGS, nhận dữ liệu + **nội dung mã vạch do Hải quan cấp**.
3. **In bản kê** đúng mẫu: *Danh sách container* hoặc *Danh sách hàng hóa (hàng lẻ)* đủ điều kiện qua KVGS.

Thành công = người làm hàng in được bản kê mà công chức quét được, không phải mở phần mềm khác.

### Ràng buộc đã chốt với chủ sản phẩm
- Mã vạch **phải lấy từ Hải quan** (API `KVGS`), không tự sinh – Hải quan quét để tra dữ liệu đã truyền.
- Phạm vi đợt đầu: cả nhập/xuất, cả hàng container/hàng lẻ.
- Số seal lấy từ vận đơn đã OCR (`BillOfLading.containers[].sealNo`), người dùng kiểm và sửa.
- Vị trí: thẻ trong nhóm ④ "Chứng từ & cảng" của bước Truyền Hải quan + lối tắt ở màn Khai báo Hải quan.

### Ngoài phạm vi (đợt sau)
- Khai HYS danh sách container (tự sinh file Excel thủ tục A02) – chỉ đặt liên kết sang thẻ HYS.
- Đóng chung container cho nhiều tờ khai.
- Nối gateway `KVGS` thật – chờ FPT có đặc tả phản hồi (hiện chỉ có body request).

## 2. Dữ liệu và luồng (backend)

### 2.1 Module
`packages/core/src/modules/integration`, theo khuôn HYS (`hys-submissions.ts`, `send-hys.ts`, `process-hys.ts`): use case gửi → outbox → worker gọi FPT → hỏi kết quả → cập nhật.

### 2.2 Bảng mới (đều có `org_id` + RLS)

**`container_lists`** – một bản ghi cho mỗi (hồ sơ, tờ) × lần khai.
| Cột | Ghi chú |
|---|---|
| `id`, `org_id`, `dossier_id`, `branch` | |
| `attempt` | Lần khai 1, 2, … (như "Lần KB") |
| `rows` jsonb | `[{ billNo, containerNo, sealNo, note, source: "OCR" \| "USER", sourceFieldId? }]` – mọi mã là `string` |
| `status` | `DRAFT` → `SENDING` → `ACCEPTED` \| `REJECTED` (+ `NO_RESPONSE` khi quá hạn hỏi) |
| `ref_id`, `receipt_no`, `receipt_date` (YYYY-MM-DD), `errors` jsonb | Từ `V5ContainerRes` (`reF_ID`, `sO_TN`, `ngaY_TN`, `errorList`) |
| `sent_rows` jsonb, `sent_at` (UTC) | Ảnh chụp đã gửi |

**`kvgs_sheets`** – kết quả lấy DS qua KVGS cho mỗi (hồ sơ, tờ), giữ lịch sử, bản in dùng bản `ACCEPTED` mới nhất.
| Cột | Ghi chú |
|---|---|
| `id`, `org_id`, `dossier_id`, `branch`, `status`, `ref_id`, `receipt_no`, `receipt_date` | Hai bước gửi → lấy phản hồi như danh sách container |
| `sheet` jsonb | `KvgsSheet` đã chuẩn hóa (mục 2.4) |
| `raw` jsonb | Phản hồi thô (gỡ lỗi; không đưa vào log) |
| `fetched_at` (UTC) | "Kết xuất dữ liệu lúc" |

Sửa ô bảng container → ghi `field_audit` (append-only) với `entity = container_list_row`.

### 2.3 Luồng nghiệp vụ
- **`CONT_LIST` – Khai danh sách container** (chỉ NK, phương thức vận chuyển mã 2):
  - Mở khi tờ đã có số tờ khai. Bản nháp tạo lần đầu từ `containers[]` của vận đơn đã OCR (thiếu → packing list / arrival notice; vẫn thiếu → bảng rỗng).
  - Bấm Khai → job `V5ContainerReq` (khóa idempotency `dossierId:branch:CONT_LIST:attempt`) → worker hỏi `V5ContainerRes` theo lịch poll hiện có đến `tranG_THAI` 12 (chấp nhận) / 10 (từ chối).
  - Sửa sau khi `ACCEPTED` → tạo lần khai mới (`attempt + 1`), phải gửi lại.
- **`KVGS` – Lấy DS qua KVGS**:
  - Mở khi tờ `CLEARED` (thông quan / giải phóng hàng); NK container thêm điều kiện `CONT_LIST` `ACCEPTED` ở lần khai mới nhất.
  - Job gửi `KVGS` (`TK_SOTK`, `TK_NGAYDK` dd/MM/yyyy, `TK_MAHQ`, `MA_DV`; không gửi tài khoản VNACCS) → hỏi phản hồi → parse Zod → `KvgsSheet`.
  - Lấy lại bất kỳ lúc nào; bản in luôn theo lần mới nhất thành công.
- **`customs-flow`** (`@kb/contracts`): thay `CONT` bằng `CONT_LIST` + `KVGS` (phase `DOCS`, kind `side`), điều kiện trong `operationAvailability`, `nextCustomsOperation` khi `CLEARED` trả `CONT_LIST` (NK container chưa chấp nhận) hoặc `KVGS` (chưa lấy). Lý do khóa: mã ổn định (`KVGS_REQUIRES_CLEARANCE`, `KVGS_REQUIRES_CONTAINER_LIST`, `CONT_LIST_NOT_APPLICABLE` (XK hoặc không phải container), `CONT_LIST_REQUIRES_DECLARATION_NUMBER`) + nhãn 3 ngôn ngữ. Dữ liệu cũ có `CONT` trong lịch sử thông điệp: giữ nhãn để hiển thị.

### 2.4 `KvgsSheet` (`@kb/contracts`, Zod)
```ts
{
  kind: "CONTAINER" | "CARGO",
  regionOffice: string,          // "Chi cục Hải quan khu vực II"
  customsOffice: string,         // "Hải quan cửa khẩu cảng Sài Gòn khu vực 1"
  supervisionOffice: string,     // dòng 1: chi cục giám sát – mã kho: tên kho
  sealRequired: boolean,         // "Tờ khai (không) phải niêm phong"
  companyName: string, taxCode: string,
  declarationNo: string, declarationStatus: string,
  declarationDate: string, declarationDateTo: string | null,  // YYYY-MM-DD
  typeName: string, channel: string,
  cargoControlNo: string,        // Số quản lý hàng hóa
  barcode: string | null,        // nội dung mã vạch đầu trang (mẫu hàng lẻ)
  containers: { containerNo: string, sealNo: string | null, customsSealNo: string | null, barcode: string }[],
  cargo: { quantity: string, quantityUnit: string, grossWeight: string, weightUnit: string } | null,  // số dạng chuỗi thập phân
  exportedAt: string,            // UTC
}
```
Gateway FPT ánh xạ tên trường phản hồi một cách linh hoạt (camelCase .NET / HOA), thiếu trường bắt buộc để in → `DomainError` `KVGS_RESPONSE_INCOMPLETE` + lưu `raw`. Có cờ gỡ lỗi như `FPT_DEBUG_TRACE`.

### 2.5 Không dùng AI
Toàn bộ là code thuần có test (bất biến 5). Mỗi lần gọi FPT ghi chi phí Customs Hub vào `usage_events` qua port hiện có. **Không trừ lượt khai** (ADR 0011 – lượt chỉ tính ở IDC/EDC).

### 2.6 Route (`apps/web/src/app/api`, mỏng)
- `GET/PUT dossiers/:id/kvgs/:branch/container-list` – xem / lưu nháp bảng.
- `POST dossiers/:id/kvgs/:branch/container-list/send`, `.../poll` – khai / lấy phản hồi.
- `POST dossiers/:id/kvgs/:branch/fetch`, `.../poll` – lấy DS qua KVGS / lấy phản hồi.
- `GET dossiers/:id/kvgs/:branch` – trạng thái 2 khối + `KvgsSheet` mới nhất.
- `POST dossiers/:id/kvgs/:branch/container-list/refill` – lấy lại từ chứng từ.

## 3. Giao diện – thẻ "Qua khu vực giám sát"

**Vị trí**: Hồ sơ → bước Truyền Hải quan → nhóm ④ "Chứng từ & cảng" (`submit-step.tsx`, `PhaseSection`). Lô nhiều tờ: mỗi tờ một thẻ, chọn tờ như phần trên. Code ở `features/dossier-detail/steps/kvgs/` (như `hys/`).

```
┌─ ④ Chứng từ & cảng ─────────────────────────────────────────────────────┐
│ [IconTile] Qua khu vực giám sát · Tờ khai 108007708100 · A11 · 02CI     │
│            Ngày ĐK 27/02/2026 · Lần khai 1                 [Lịch sử ▸]  │
│ ┌ 1  Khai danh sách container ─────────────┐ ┌ 2  Lấy DS qua KVGS ─────┐│
│ │ StatusBadge                              │ │ StatusBadge             ││
│ │ Số tham chiếu · Số TN · Ngày TN          │ │ Số tham chiếu · Số TN … ││
│ │ [Khai DS container] [Lấy phản hồi]       │ │ [Lấy DS qua KVGS]       ││
│ │                                          │ │ [Lấy phản hồi][In ▾]    ││
│ └──────────────────────────────────────────┘ └─────────────────────────┘│
│ Danh sách container (n)      [Lấy lại từ chứng từ] [Nhập Excel] [⋯]    │
│ # │ Số vận đơn │ Số container │ Số seal │ Ghi chú │ 🗑                  │
│ [+ Thêm dòng]                                                   [Lưu]   │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Hai khối trạng thái**: `Grid cols={{ base: 1, md: 2 }}`, mỗi khối `StatusBadge` (thêm trạng thái vào `STATUS_META` nếu thiếu), số Hải quan trả, nút. Khối 2 khóa kèm lý do (`reasonText`).
- **"Lấy phản hồi"**: dự phòng; worker tự hỏi, thẻ tự làm mới (poll như thẻ HYS).
- **Bảng container**: lưới sửa trực tiếp như `ocr/items-table.tsx` (ngoại lệ `kb-allow-raw` đã có tiền lệ); ⓘ nguồn OCR (chứng từ, trang); kiểm trên dòng: số container ISO 6346 (4 chữ + 7 số + chữ số kiểm), seal bắt buộc (V5), không trùng, ≥ 1 dòng. Menu ⋯: Xuất Excel, Xóa toàn bộ (`ConfirmDialog`). Nhập Excel: cột Số vận đơn / Số container / Số seal / Ghi chú.
- **Theo loại tờ khai**:
  - NK container: đủ 2 khối + bảng sửa được.
  - XK container: không có khối 1; bảng chỉ đọc từ chỉ tiêu 2.60.
  - Không phải container (mã khác 2): chỉ khối 2; mẫu in mặc định "Hàng lẻ".
- **Xác nhận trước khi gửi**: `ConfirmDialog` (`tone` thông tin) nêu "Doanh nghiệp khai: …" và "Dữ liệu sẽ gửi tới: <chi cục>".
- **Lỗi Hải quan**: `errorList` hiện dưới bảng, đánh dấu dòng theo `rowPosition`, kèm `proposedSolution`; dùng lại khối lỗi FPT của màn truyền (`customs-errors.ts`).
- **Lịch sử**: nhật ký thông điệp hiện có, lọc theo `CONT_LIST` / `KVGS`.
- **Màn Khai báo Hải quan** (`features/customs/customs-page.tsx`): `RowActions` thêm "Qua khu vực giám sát" (mở thẻ, tờ đã thông quan) và "In bản kê mã vạch" (khi đã có `KvgsSheet`).
- Quyền: gửi/sửa chỉ `DECLARANT`, `APPROVER`, `ADMIN`; vai trò khác xem và in. Đang gửi hoặc đã chấp nhận → bảng chỉ đọc, nút "Sửa và khai lại".
- 3 ngôn ngữ: mọi nhãn trong `kvgs.messages.ts`.

## 4. Mẫu in bản kê mã vạch

- Trang: `/dossiers/[id]/kvgs/[branch]/print?mau=cont|le`, theo tiền lệ `issued-invoice/[issuedId]/print`. Code `features/kvgs-print/`.
- Thanh công cụ (3 ngôn ngữ, ẩn khi in): chọn mẫu, chọn tờ, **In**, **Tải PDF** (hộp in trình duyệt; A4 dọc).
- Nội dung bản in chỉ tiếng Việt (văn bản pháp lý) – `kvgs-print.vi.ts`. Màu đen/trắng cố định cả khi app đang chế độ tối.
- Bố cục và câu chữ theo đúng 2 mẫu trong `docs/mauin_danhsachcontqua_kvgs/`: đầu trang (chi cục khu vực, hải quan cửa khẩu, ngày), tiêu đề, "Tờ khai (không) phải niêm phong", mục 1–9, bảng, "Ghi chú" nguyên văn, "Kết xuất dữ liệu lúc".
- **Mẫu container**: STT | Số hiệu container (1) | Số seal container (2) | Số seal Hải quan (3) | Xác nhận của công chức (4) | Mã vạch (5) – QR mỗi dòng từ `containers[].barcode`. ~8 dòng/trang, lặp tiêu đề bảng, "Trang x/y".
- **Mẫu hàng lẻ**: STT | Số lượng hàng (1) | Tổng trọng lượng hàng (2) | Lượng hàng thực tế qua KVGS (3) | Xác nhận của công chức (4); cột 3–4 để trống đủ cao để ghi tay nhiều lần; Code128 góc trên phải từ `barcode`.
- Dữ liệu chỉ từ `KvgsSheet` mới nhất; chưa có → `EmptyState` + nút về thẻ. In nguyên văn dữ liệu Hải quan trả (không sửa chữ hoa/dấu).
- **`Barcode`** mới trong `@kb/ui` (`type: "qr" | "code128"`, SVG, `aria-label`), thư viện `bwip-js`; theo skill `adding-ui-component` (test, playground, `DESIGN-SYSTEM.md`).

## 5. Xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| Chưa thông quan / giải phóng hàng | Khóa khối 2 – `KVGS_REQUIRES_CLEARANCE` |
| NK container chưa được chấp nhận danh sách | Khóa khối 2 – `KVGS_REQUIRES_CONTAINER_LIST` |
| Thiếu seal, sai ISO 6346, trùng, bảng rỗng | Chặn Khai, tô ô lỗi |
| Hải quan từ chối (10) | `errorList` theo dòng + hướng dẫn, cho sửa và khai lại |
| Chưa có phản hồi (11) quá hạn | `NO_RESPONSE`, mở "Lấy phản hồi" |
| FPT lỗi mạng / 5xx | Thử lại qua outbox, idempotent |
| Phản hồi KVGS thiếu trường để in | `KVGS_RESPONSE_INCOMPLETE`, không cho in, lưu `raw` |
| Đổi container sau khi chấp nhận | Lần khai mới; bản in cũ (nếu có) ghi rõ "theo lần khai trước" trên thẻ |

## 6. Giả lập
- `apps/fpt-mock`: `V5ContainerRes` có kịch bản chấp nhận/từ chối (theo dữ liệu, vd seal `REJECT…`); `KVGS` thành hai bước gửi → lấy phản hồi, trả đủ trường của 2 mẫu + nội dung QR/mã vạch giả. Cập nhật `postman-flows.test.ts`.
- Mock web (`src/mocks/api/customs.ts` hoặc `src/mocks/api/kvgs.ts`): cùng hành vi, cho demo Vercel; seed có một hồ sơ NK container đã thông quan và một XK hàng lẻ đã thông quan.

## 7. Test
- **contracts**: `operationAvailability` cho `CONT_LIST`/`KVGS` (NK/XK × container/lẻ × giai đoạn); ISO 6346; Zod `KvgsSheet`; lý do khóa có nhãn đủ 3 ngôn ngữ.
- **core**: gửi / hỏi / chấp nhận / từ chối / khai lại; idempotency; RLS theo `orgId`; điền sẵn từ OCR; `field_audit` khi sửa; `usage_events`; integration test Postgres cho 2 bảng.
- **fpt-mock**: luồng Postman cho 2 nghiệp vụ.
- **web**: thẻ (khóa/mở, sửa ô, xác nhận, lỗi theo dòng, chỉ đọc theo quyền), trang in (2 mẫu, sang trang, rỗng), lối tắt màn Khai báo Hải quan, axe, i18n.
- **@kb/ui**: `Barcode` (QR, Code128, SVG, a11y).
- **Trình duyệt**: sáng/tối, 1366/390; xem trước in A4 với 1 container, 12 container, hàng lẻ; quét thử QR bằng điện thoại.

## 8. Tài liệu cần cập nhật
`docs/QUY-TRINH-NGHIEP-VU.md` (mục Chứng từ & cảng, bỏ dòng "chưa có đặc tả … container qua KVGS"), `docs/vnaccs-api/README.md` (bảng trạng thái tích hợp – qua `scripts/vnaccs-api-docs`, không sửa tay), `apps/web/CLAUDE.md` (route mới), `docs/DESIGN-SYSTEM.md` (`Barcode`), `docs/BACKEND-TODO.md` (V2).
