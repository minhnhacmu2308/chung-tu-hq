# Chuẩn trường chứng từ → chỉ tiêu VNACCS, cấu hình theo tài khoản

> Ngày: 2026-10-15 · Trạng thái: thiết kế đã duyệt (hướng A), chờ kế hoạch triển khai.
> Dữ liệu tham chiếu: `lo mẫu/LÔ FANS25040166` (đường biển), `lo mẫu/bộ chứng từ` YZS24120950 (hàng không), mỗi lô có Excel kết quả chuẩn; đặc tả `TAI LIEU TICH HOP VNACCS/` (trùng `business/13-API-FPT-dac-ta/`, thêm REP_VNACCS, AMA v1.4, KHAI BAO DS CONT).

## 1. Mục tiêu

Mọi lô, mọi khách hàng, mọi mẫu chứng từ cho ra **cùng một bộ trường chuẩn theo loại chứng từ** (dạng "STT – Tên trường – Trị giá" như Excel mẫu). Từ bộ trường đó dựng tờ khai IDA/EDA đủ chỉ tiêu VNACCS và truyền qua FPT (đã tích hợp). Mỗi tài khoản (= một doanh nghiệp, ADR 0004) tự cấu hình thêm mà không cần sửa code.

**Thành công khi:**
1. Hai lô mẫu chạy `pnpm eval --live` đạt ≥ 95% số trường khớp Excel.
2. Hai lô mẫu dựng được tờ khai không còn chỉ tiêu bắt buộc trống ngoài các chỉ tiêu chỉ người khai biết. Kho (1.29) phải tự lấy được từ Arrival Notice.
3. Một tài khoản thêm được trường bổ sung riêng và AI đọc ra giá trị thật, không cần phát hành code.
4. Bộ quy tắc ánh xạ mới cho ra đúng y kết quả của `IDA_MAPPINGS`/`EDA_MAPPINGS` hiện tại trên bộ test có sẵn, trước khi bổ sung quy tắc mới.

## 2. Hiện trạng (2026-10-15)

- **Schema trích xuất viết tay, cứng trong code.** Đó là các file `packages/contracts/src/extraction/*.ts` và `extractionSchemaFor`. Skill chỉ thêm gợi ý nhãn vào prompt. `addSkillField` không lấy thêm được dữ liệu vì output bị schema cố định ràng buộc.
- **`schemaKeyFor` làm lệch mã giữa skill mẫu và schema.** Lệch ở các trường: AWB `airport_departure`, AN `warehouse`, CO `origin_criterion`, FRT `seller_tax_code`, Invoice `model_no`.
- **Skill MAPPING (SK-MAP-IDA/EDA) chỉ để hiển thị.** Mã của nó không khớp với `IDA_MAPPINGS`. Ánh xạ thật nằm cứng trong `declaration/domain/mapping/{ida,eda}.ts`.
- **Gộp hồ sơ (`SHIPMENT_FIELDS`, `merge.ts`) bỏ mất:** AWB `hawbNo`, ngày B/L/AWB, notify party, nơi phát hành, `volumeCbm`, `items` của C/O, mã số thuế/thông tin bên phát hành hóa đơn cước.
- **Các lỗi cụ thể:**
  - KHO (1.29) luôn trống.
  - NGAY_DEN chỉ lấy từ Arrival Notice.
  - NGAY_DI của EDA đọc nhầm `transport.arrivalDate`.
- **So với Excel mẫu, schema còn thiếu:** MB/L, số kiện, trọng lượng, kho, ghi chú trên AN; Part No/Model và nơi của điều kiện giao hàng trên Invoice; nơi phát hành B/L; ô 3, 9, 12 của C/O; chuyến bay + ngày bay của AWB.

## 3. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| C1 | **Danh mục trường chuẩn** (`DOC_CATALOG`) trong `@kb/contracts` là metadata đi kèm schema Zod của từng loại chứng từ: nhãn tiếng Việt, nhãn thường gặp, thứ tự, phiên bản thêm trường. Test bắt danh mục ↔ schema khớp từng key. Schema Zod giữ làm nguồn kiểu TypeScript | Một nguồn cho chuẩn đọc, giao diện, Excel xuất ra và đáp án eval, mà không mất kiểu tĩnh phần gộp đang dùng (sửa ngày 2026-10-15 khi lập kế hoạch) |
| C2 | Cấu hình gắn theo **tài khoản (org)** | Mỗi khách hàng một tài khoản (đã chốt với PO) |
| C3 | **Trường bổ sung riêng** của tài khoản được đưa vào schema lúc chạy (object `custom`), nên AI đọc thật | Khách mới có mẫu lạ không cần phát hành code |
| C4 | Mỗi chỉ tiêu là một **quy tắc**: logic mặc định là code có test (giữ nguyên `from` hiện tại), kèm khai báo dạng dữ liệu `options` gồm các **nguồn thay thế được phép** (mỗi nguồn là hàm đọc thuần có id + nhãn) và `allowFixed`. Tài khoản chỉ chọn trong danh sách này | ADR 0002; giữ đúng y kết quả mặc định, không viết lại logic tra mã/cước/cảnh báo đã có test (sửa ngày 2026-10-15) |
| C5 | Tài khoản chỉ **ghi đè trong phạm vi quy tắc cho phép**: chọn hoặc đổi thứ tự nguồn trong `allowedSources`, hoặc đặt giá trị cố định khi `allowFixed`. **Chỉ tiêu trị giá/thuế (`DERIVED_DECLARATION_FIELD_CODES`) bị khóa** | Sai trị giá/thuế là sai tờ khai |
| C6 | Mỗi chỉ tiêu trên tờ khai ghi **nguồn gốc**: mã quy tắc, nguồn đã dùng, có bị ghi đè không | Người duyệt hiểu vì sao có giá trị đó |
| C7 | Bỏ loại skill **MAPPING**. Màn Skill chỉ còn DOCUMENT/SUPPLIER; cấu hình ánh xạ chuyển sang Cài đặt | Nội dung hiện tại chỉ để trang trí và gây hiểu nhầm |
| C8 | Tăng `EXTRACTION_SCHEMA_VERSION` lên 2. Trường mới required + nullable trong output AI như quy ước hiện tại. Dữ liệu v1 đã lưu không parse lại (phần gộp đọc bằng getter, key thiếu coi như null) | Không phải đọc lại toàn bộ chứng từ cũ; muốn đủ trường mới thì bấm Đọc lại |
| C9 | Lô thật của khách **không commit**: để ở `evals/private/` (gitignore). CI dùng bộ ẩn danh `evals/golden/` | Dữ liệu thương mại của khách |
| C10 | Ngoài phạm vi: AMA (khai bổ sung), khai danh sách container, đọc mã REP_VNACCS. Ghi vào `docs/BACKEND-TODO.md` | Là nghiệp vụ sau khi đã có tờ khai |

## 4. Danh mục trường chuẩn

### 4.1 Kiểu

```ts
// packages/contracts/src/catalog/types.ts
type DocFieldType = "text" | "number" | "date" | "code" | "party" | "boolean";
type DocFieldDef = { key: string; label: string; aliases: string[]; type: DocFieldType; since: 1 | 2 };
type DocCatalog = { kind: DocKind; fields: DocFieldDef[]; items?: { key: string; label: string; fields: DocFieldDef[] } };
export const DOC_CATALOG: Record<DocKind, DocCatalog>;
export const DOC_CATALOG_VERSION = 2;
```

- **Test đồng bộ:** key phần đầu chứng từ (trừ `uncertainties`) và key trong `items` của danh mục phải bằng đúng key của schema Zod tương ứng, kể cả thứ tự.
- **`withCustomFields(schema, custom: CustomFieldDef[])`** trả về schema có thêm `custom: z.object({...})`. Kiểu `text` → nStr, `number` → nNum, `date` → nDate, mô tả gồm nhãn và nhãn thường gặp. Không có trường bổ sung thì trả nguyên schema.
- **Nhãn và nhãn thường gặp trong danh mục** được đưa vào prompt (thay `fieldHints` từ skill khi skill không ghi đè). Chúng cũng là đầu vào cho script eval đọc Excel.

### 4.2 Trường thêm mới (v2)

| Loại | Trường thêm |
|---|---|
| INVOICE | `incotermPlace`, `originStatement` ("Made in China"); trong `items[]`: `partNo` (Part No/Model) |
| BILL_OF_LADING | `placeOfIssue`, `dateOfIssue` |
| AIR_WAYBILL | `flightNo`, `flightDate`, `placeOfIssue` |
| ARRIVAL_NOTICE | `masterBillNo` (`billNo` v1 giữ nguyên, nhãn "Vận đơn (HB/L)"), `transportMode`, `flightNo`, `portOfLoading`, `packages`, `packageUnit`, `grossWeightKg`, `warehouseCode`, `warehouseName`, `note` |
| CERT_OF_ORIGIN | `departureDate`, `transportName` (tàu/chuyến bay), `portOfLoading`, `portOfDischarge`, `packagesDescription`, `quantityOrWeight`, `certified` (boolean: có chữ ký + con dấu) |
| FREIGHT_INVOICE | `billRef` (số B/L/AWB ghi trên hóa đơn) |

Các trường v1 giữ nguyên key. Danh sách đầy đủ từng loại được viết trong `catalog/*.ts`, có test snapshot số lượng và key.

## 5. Cấu hình theo tài khoản

### 5.1 Skill

- **`SkillField.key` là key trong danh mục** (ví dụ `warehouseCode`), hoặc `custom.<key>` với trường bổ sung riêng.
  - Bỏ `schemaKeyFor` và bảng `OVERRIDES`.
  - Migration dữ liệu: đổi key của 12 skill mẫu và mọi bản sao theo bảng đối chiếu; key nào không khớp thì chuyển thành trường bổ sung riêng.
- **Thêm trường bổ sung riêng:** kiểu `text | number | date`, key theo `^[a-z][a-zA-Z0-9]*$`, tối đa 20 trường cho mỗi skill.
  - Resolver trả thêm `customFields: DocFieldDef[]`.
  - `processDocument` gọi `schemaFromCatalog(DOC_CATALOG[kind], { custom })`.
  - `skillVersionId` vẫn nằm trong khóa idempotency, nên đổi trường sẽ đọc lại.
- **Kết quả trường bổ sung** lưu trong `extractions.raw.custom` và gộp vào `shipment.custom[docKind][key]` (kiểu `Sourced<string>`).
- **Bỏ `SkillKind` MAPPING:** xóa SK-MAP-IDA/EDA khỏi seed và mock. Migration xóa bản sao trong các org; dữ liệu này không có giá trị runtime.

### 5.2 Mặc định khai báo (mới)

- **Bảng `declaration_profiles`:** `org_id`, `direction NK|XK`, `values jsonb` (map mã chỉ tiêu → giá trị), `overrides jsonb` (mục 6.3), `updated_at`, `updated_by`. Có RLS theo org, unique `(org_id, direction)`.
- **Giá trị được đặt:** MA_LH, CQHQ, PTVC, KHO, PT_TT, KHAI_TG, NGUOI_NT, PL_CN, HD_PL, GIA_PL. Danh sách được phép là `PROFILE_FIELD_CODES` trong contracts; giá trị kiểm theo catalog Phụ lục II như `canEditField`.
- **Tạo hồ sơ:** điền sẵn loại hình và chi cục từ mặc định.
- **Quyền:** Quản trị và Chủ sở hữu sửa được; vai trò khác chỉ xem.

## 6. Quy tắc ánh xạ

### 6.1 Kiểu

```ts
// packages/core/src/modules/declaration/domain/mapping/types.ts (mở rộng FieldMapping hiện có)
type SourceOption = { id: string; label: string; read: (i: MappingInput) => MappedValue | null }; // null = nguồn không có giá trị
type FieldMapping = { …hiện có…; options?: { sources: SourceOption[]; allowFixed: boolean } };
type FieldOverride = { sources: string[] } | { fixed: string };            // sources = id theo thứ tự ưu tiên
type Provenance = { rule: string; via: "default" | "source" | "fixed" | "profile"; sourceId?: string };
```

- **`evaluateMapping(m, override, input)`:**
  - không có ghi đè → `m.from(input)` (giữ đúng y);
  - `fixed` → giá trị cố định, source `"DEFAULT"`, ghi chú "Giá trị cố định theo cấu hình doanh nghiệp";
  - `sources` → nguồn đầu tiên trong danh sách có giá trị; hết nguồn thì quay về `m.from`.
- **Kết quả mang `provenance`,** lưu vào `StoredField.provenance` (cột `fields` là jsonb, không cần migration).
- **`MappingInput` thêm `profile`** (mặc định khai báo của chiều NK/XK) và `documents` (dữ liệu từng chứng từ theo loại, để nguồn đọc trực tiếp trường như `ARRIVAL_NOTICE.warehouseCode`).

### 6.2 Quy tắc bổ sung sau khi tương đương

| Chỉ tiêu | Nguồn |
|---|---|
| KHO | `document ARRIVAL_NOTICE.warehouseCode` + `warehouseName` → `profile KHO` |
| NGAY_DEN | `shipment /transport/arrivalDate` (AN.eta) → `document AIR_WAYBILL.flightDate` (hàng air) |
| SO_VD | HB/L (AN/B-L/AWB house) → MB/L khi không có house |
| EDA NGAY_DI | `document BILL_OF_LADING.dateOfIssue` / `CERT_OF_ORIGIN.departureDate` (sửa lỗi lấy nhầm ETA) |
| MA_LH, CQHQ, PTVC, PT_TT, KHAI_TG, NGUOI_NT | Như hiện tại → `profile` khi chứng từ không có |

### 6.3 Ghi đè của tài khoản

- **Lưu trong `declaration_profiles.overrides`:** map mã chỉ tiêu → `FieldOverride`.
- **Kiểm khi lưu** (`validateOverrides`):
  - mã phải tồn tại và có `options`;
  - mọi id nguồn phải nằm trong `options.sources`;
  - `fixed` chỉ được dùng khi `allowFixed`, và giá trị phải đúng định dạng catalog như `canEditField`;
  - mã thuộc `DERIVED_DECLARATION_FIELD_CODES` không có `options`, nên luôn bị từ chối (`FORBIDDEN`).

## 7. Gộp hồ sơ

- **Thêm vào `Shipment`:**
  - `transport.houseBillNo`, `transport.flightNo`, `transport.departureDate`, `transport.placeOfIssue`;
  - `transport.warehouse` { code, name };
  - `invoice.incotermPlace`;
  - `items[].partNo`;
  - `origin.criteria[]` (hs6, criterion);
  - `custom`.
- **Thêm nguồn vào `SHIPMENT_FIELDS` cho:** HAWB/MAWB, ngày, nơi phát hành, kho, chuyến bay. Giá trị lệch giữa các chứng từ vẫn đánh dấu CONFLICT theo ADR 0003.
- **Không đổi tên key v1.** `AIR_WAYBILL.airportOfDeparture`/`airportOfDestination` gộp vào cùng `transport.portOfLoading`/`portOfDischarge` của Shipment (như cảng B/L).

## 8. Giao diện

- **Màn Đọc chứng từ:** thêm chế độ xem "Theo chứng từ". Mỗi chứng từ một bảng STT – Tên trường – Trị giá – Trạng thái, thứ tự theo danh mục, kèm trường bổ sung. Chế độ xem theo nhóm trường hiện tại giữ nguyên.
- **Nút "Xuất Excel"** (cả mock và http):
  - mỗi chứng từ một sheet, tên sheet theo tên file;
  - cột STT | TÊN TRƯỜNG | TRỊ GIÁ, đúng định dạng file mẫu;
  - route `GET /api/dossiers/:id/export.xlsx`, sinh bằng `exceljs` phía server.
- **Cài đặt → tab mới "Khai báo":**
  - (a) form Mặc định khai báo cho NK/XK;
  - (b) bảng chỉ tiêu: mã, số Phụ lục II, nguồn mặc định, ghi đè. Nút "Đổi nguồn" chỉ hiện khi quy tắc cho phép; chỉ tiêu bị khóa có nhãn "Khóa – tính từ trị giá".
- **Màn Skill:**
  - bỏ tab Ánh xạ;
  - bảng trường chia hai nhóm "Trường chuẩn" (không xóa được, chỉ sửa nhãn thường gặp và bật/tắt hiển thị) và "Trường bổ sung" (thêm, sửa, xóa).
- **Màn Review tờ khai:** tooltip/popover nguồn của từng chỉ tiêu (provenance).
- **Mock:** cập nhật `mocks/seed/skills.ts`, `mocks/api/*` cùng chữ ký; tăng `DB_VERSION`.

## 9. Eval với lô thật

- **`scripts/eval/excel-to-expected.ts`:**
  - đọc Excel dạng STT | Tên trường | Trị giá;
  - đối chiếu "Tên trường" với `label`/`aliases` trong danh mục để ra `{ kind, key, value }`;
  - dòng không khớp được thì in cảnh báo; có thể ánh xạ tay bằng file `mapping.json` trong thư mục lô.
- **Chạy:** `pnpm eval --live --lot <thư mục>` → chạy classify + extract → so từng trường.
  - So sánh có chuẩn hóa: hoa/thường, khoảng trắng/xuống dòng, số theo locale, ngày nhiều định dạng.
  - Riêng trường địa chỉ so theo tỷ lệ token ≥ 0.85.
- **Báo cáo:** % khớp theo lô, chứng từ, trường; danh sách trường lệch kèm giá trị kỳ vọng và giá trị thực tế.
- **Sau khi trích xuất, dựng tờ khai** bằng `buildDeclaration` và báo danh sách chỉ tiêu bắt buộc còn trống.
- **Dữ liệu:** `evals/private/<lô>/` (gitignore). `lo mẫu/` hiện có chuyển vào đây. `evals/golden/` giữ bộ ẩn danh cho CI offline.

## 10. Kiểm thử

- **contracts:** `schemaFromCatalog` sinh đúng kiểu; chế độ `read` parse được fixture v1; key danh mục không trùng; alias không rỗng.
- **core/extraction:** schema có `custom` đi qua `zodOutputFormat` (giống probe 10 schema đã làm); `processDocument` truyền trường bổ sung; gộp `custom` và các trường mới; CONFLICT cho chuyến bay lệch (O3141 so với O30141).
- **core/declaration:** test tương đương rules ↔ mappings cũ; KHO/NGAY_DEN/NGAY_DI mới; ghi đè (allowedSources, allowFixed, chỉ tiêu bị khóa → FORBIDDEN); provenance.
- **core/identity hoặc declaration:** use case mặc định khai báo — quyền, kiểm giá trị theo catalog, org khác bị chặn. Repo test trên Postgres (RLS).
- **web:** logic thuần của form Mặc định khai báo và bảng ghi đè; e2e "cấu hình mặc định → tạo hồ sơ điền sẵn → dựng tờ khai có KHO từ AN"; e2e xuất Excel.
- **eval:** 2 lô mẫu ≥ 95% (chạy tay với `--live`, có tốn tiền AI); kết quả ghi vào PR.

## 11. Thứ tự triển khai

1. **Danh mục + `schemaFromCatalog`** (thay schema viết tay, giữ key v1) và test tương thích.
2. **Trường v2** vào danh mục; tăng `EXTRACTION_SCHEMA_VERSION`; gộp trường mới vào Shipment.
3. **Quy tắc dạng dữ liệu** tương đương mapping cũ, rồi xóa mapping cũ; thêm quy tắc mới (mục 6.2) và provenance.
4. **Mặc định khai báo + ghi đè:** bảng, use case, route, tab Cài đặt.
5. **Skill:** key theo danh mục, trường bổ sung, bỏ MAPPING (migration + UI + mock).
6. **Màn "Theo chứng từ" + Xuất Excel.**
7. **Eval với lô thật**, tinh chỉnh alias/describe đến ≥ 95%.

Mỗi bước giữ được `pnpm typecheck && pnpm lint && pnpm test` xanh.
