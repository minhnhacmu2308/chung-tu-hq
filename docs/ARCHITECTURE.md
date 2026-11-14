# Kiến trúc KhaiBáo AI

## 1. Tổng thể: Modular Monolith, một ngôn ngữ (TypeScript)

```
apps/web        Next.js – UI + API (route handlers / server actions). MỎNG: parse input → gọi use case → trả kết quả
apps/worker     BullMQ consumer – chạy job xử lý chứng từ. MỎNG: nhận job → gọi use case
packages/core   TOÀN BỘ nghiệp vụ, chia theo module
packages/contracts  Zod schema dùng chung FE/BE: shipment, extraction, DTO của API
packages/ui         Design system @kb/ui: token, component, theme theo doanh nghiệp/người dùng (docs/DESIGN-SYSTEM.md)
packages/config     tsconfig, eslint dùng chung
```

Một repo, một DB, triển khai bằng Docker Compose (web, worker, postgres, redis). Chỉ tách service khi có số đo chứng minh cần (vd worker OCR Python riêng).

## 2. Backend: module theo nghiệp vụ, mỗi module 3 tầng

### Module

| Module | Trách nhiệm |
|---|---|
| `identity` | Doanh nghiệp (org = 1 MST), user, membership, vai trò, đăng ký/mời thành viên – xem ADR 0004 |
| `dossier` | Hồ sơ khai báo, chứng từ (file, trang), trạng thái luồng 6 bước |
| `extraction` | Pipeline đọc chứng từ: tách trang, text layer, XML HĐĐT, phân loại, gọi AI, chuẩn hóa |
| `validation` | Luật đối chiếu chéo → PASS/WARN/FAIL/SKIPPED |
| `skill` | Cấu hình skill (trường, alias, ví dụ đã duyệt, phiên bản), đánh giá độ chính xác |
| `declaration` | Ánh xạ shipment → tờ khai IDA/EDA, gợi ý HS, thuế dự kiến, chặn truyền khi còn BLOCKER |
| `billing` | Gói PAYG (theo lượt) / CONTRACT (hợp đồng năm), sổ lượt append-only (số dư = tổng delta), chặn khai tạm khi thiếu lượt / hợp đồng hết hạn, ghi lượt khi IDC/EDC được chấp nhận (cổng `DeclarationBilling` ở `shared/`), mua lượt qua PayOS (`PaymentGateway`: PayOS / giả lập), đối soát hằng ngày, usage (token, chi phí) theo org – ADR 0011 |
| `catalog` | Danh mục hàng hóa dùng chung (ADR 0015): mặt hàng chuẩn có mã nối, bộ mã theo bộ phận (bí danh), quy đổi đơn vị, ghép mã bằng code thuần + hàng chờ duyệt, import/xuất Excel (ghép cột đủ trường, cột Mã nối), gộp mặt hàng (`merged_into_id`), bộ nguồn gốc (`code_sets.is_source` – quyết định ĐVT gốc + thông tin mặt hàng; đổi gốc mặt hàng bằng `domain/rebase.ts`, đổi bộ nguồn gốc `application/source.ts`). Đủ 3 tầng như module khác; cổng ra ngoài là `CatalogPort` (`application/catalog-port.ts`: `resolveItem/resolveMany`, `recordDeclared`, `proposeFromLesson`, `describeItems`, `codeInSet`…) cho `declaration`, `extraction` (in hóa đơn phát hành), `teaching` – gọi **ngoài** transaction của module gọi |
| `integration` | Adapter: Customs Hub, hscodepro, tra cứu HĐĐT, nhà cung cấp AI, object storage |
| `admin` | Khu Quản trị hệ thống của đội vận hành (`/admin`): đọc xuyên doanh nghiệp bằng role `kb_platform`, chỉ số liệu tổng hợp, mọi thao tác ghi `admin_audit` (ADR 0006) |

### Tầng trong mỗi module

```
packages/core/src/modules/<module>/
  domain/          Kiểu dữ liệu + hàm thuần. KHÔNG I/O, không DB, không HTTP, không Date.now() ngầm
  application/     Use case (command/query): kiểm quyền, transaction, gọi domain, gọi port
    ports.ts       Interface cho thứ bên ngoài (repo, AI, storage, queue, clock)
  infrastructure/  Hiện thực port: Drizzle repo, Anthropic client, ObjectStorage (S3 API: MinIO dev / R2 prod), BullMQ...
  index.ts         PUBLIC API của module – nơi DUY NHẤT module khác/apps được import
```

Chiều phụ thuộc (được kiểm tra tự động bằng dependency-cruiser):

```
apps/*  ──►  module/index.ts  ──►  application  ──►  domain
                                     ▲
                       infrastructure ┘ (implements ports)
```

- `domain` không import gì ngoài `domain` cùng module và `@kb/contracts`.
- Module A chỉ dùng module B qua `modules/B/index.ts`. Không đọc bảng DB của module khác.
- `apps/*` không import `infrastructure` trực tiếp, trừ file composition root (`apps/*/src/container.ts`).

### Luồng xử lý một hồ sơ

```
[web] upload ─► dossier.uploadDocuments ─► lưu object storage + DB ─► queue "extract-dossier"
[worker] extraction.processDossier
   tách trang → bỏ trùng → HĐĐT: XML | có text: text | scan: ảnh
   → phân loại trang → trích xuất theo skill (AiProvider port) → chuẩn hóa → lưu + usage_events
   ─► validation.runRules ─► dossier.status = REVIEW
[web] người duyệt sửa trường → field_audit (append-only) → declaration.build → duyệt → integration.customsHub.submit
```

Tiến trình realtime: worker ghi `job_progress` → web đẩy SSE cho UI.

### Biên HTTP, log và vận hành

- Route handler bọc bằng `route()` (`apps/web/src/lib/server/route.ts`): parse Zod → use case → map `DomainError.code` → HTTP. Mọi phản hồi có `x-request-id`; lỗi 500 trả `requestId`, chi tiết chỉ nằm trong log. Request ghi (POST/PUT/PATCH/DELETE) có `Origin` khác host → 403 `CSRF` (lớp hai sau cookie `SameSite=Lax`). Header bảo mật đặt ở `next.config.ts`.
- Log: `createLogger` trong `@kb/core/shared` – JSON một dòng (`t, level, name, msg, …fields`), tự che khóa có tên nhạy cảm, logger con mang `jobId/orgId/dossierId`. Không dùng `console.*` trong web (route) và worker. Mức ghi qua `LOG_LEVEL`.
- Cấu hình: `loadEnv()` (Zod) chạy lúc khởi động web (`instrumentation.ts`, khi `NEXT_PUBLIC_DATA_SOURCE=http`) và worker – thiếu biến thì dừng ngay.
- Worker: payload job parse bằng `parsePayload` → sai hình dạng là `UnrecoverableError` (không retry); job hết số lần thử → `onFinalFailure` đánh dấu bản ghi liên quan (chứng từ ERROR, outbox FAILED, agent run ERROR, tờ khai mẫu FAILED); tắt êm tối đa 30 s. Chi tiết `apps/worker/CLAUDE.md`.
- Quan sát (ADR 0012, `docs/OBSERVABILITY.md`): chỉ số Prometheus `khaibao_*` qua `@kb/core/observability` (`prom-client`, registry một bản/tiến trình, nhãn `service`, route dạng mẫu – không id/orgId). Đo ở `route()` (HTTP), `FptRestClient.post()` (FPT), sự kiện Worker + `Queue.getJobCounts()` lúc scrape (job, hàng đợi), adapter Claude + `DrizzleUsageRecorder` (AI, chi phí), `processOutbox()` (thông điệp Hải quan, tờ khai được chấp nhận). Xuất ở web `GET /api/metrics` và worker `:METRICS_PORT/metrics`, chặn bằng `Authorization: Bearer METRICS_TOKEN` (không đặt → tắt). Prometheus/Loki/Grafana dùng chung với hscodepro trên VPS; file scrape, luật cảnh báo, dashboard, exporter Postgres/Redis ở `ops/observability/`. Domain không import module này.
- Việc còn lại theo ưu tiên: `docs/BACKEND-TODO.md` mục "Rà soát kiến trúc backend".

### AI chỉ dùng để ĐỌC

| Việc | Ai làm |
|---|---|
| Đọc chứng từ → JSON theo schema | AI (qua `AiProvider` port) |
| Gợi ý HS | hscodepro / AI, **luôn cần người xác nhận** |
| Đối chiếu, ánh xạ tờ khai, tính thuế, quyết định chặn | **Code thuần, deterministic, có unit test** |

## 3. Frontend: Next.js App Router, tổ chức theo feature

```
apps/web/src/
  app/                    CHỈ routing, layout, page mỏng. Route group: (auth), (app)
  features/<feature>/     dossier-list, dossier-upload, ocr-review, agent-progress, declaration-review, skill-config, account
    components/           Component của feature
    hooks/                useXxx (TanStack Query, SSE)
    actions.ts            Server actions (mutation) – gọi use case qua module index
    queries.ts            Hàm đọc dữ liệu phía server cho Server Components
  components/common/      PdfViewer, FieldWithSource, StatusBadge, EmptyState...
  lib/                    format (vi-VN), sse client, cn()
```

| Chủ đề | Quy ước |
|---|---|
| Đọc dữ liệu | Server Components gọi `queries.ts` |
| Ghi dữ liệu | Server Actions trong `actions.ts`, input validate bằng Zod từ `@kb/contracts` |
| Dữ liệu cần cập nhật liên tục | TanStack Query (polling) hoặc SSE hook |
| Form | react-hook-form + zodResolver, dùng chung schema với backend |
| State | Server state (RSC/TanStack) · URL state (tab, filter, trang) qua search params · local state `useState`. Không Redux |
| Định dạng | Chỉ qua `lib/format`: số/tiền `vi-VN`, ngày hiển thị `dd/MM/yyyy`, lưu ISO |
| Mỗi màn bất đồng bộ | Bắt buộc có trạng thái loading / empty / error |

Màn quan trọng nhất là **ocr-review**: PDF bên trái (pdf.js, tô bbox), trường bên phải, mỗi trường hiện nguồn + trạng thái đối chiếu, sửa trực tiếp, phím tắt chuyển trường nghi ngờ tiếp theo.

## 4. Dữ liệu

PostgreSQL + Drizzle, migration trong `packages/core/drizzle/` (0000 nền → 0005 customs). Bảng theo module (`db/schema/<module>.ts`):

| Module | Bảng |
|---|---|
| identity | `organizations, users, memberships, sessions, auth_tokens, join_requests, digital_certificates, org_secrets, notifications` (đăng ký ghi tặng lượt vào `credit_ledger` cùng transaction qua hàm của billing do container truyền vào – identity không import bảng billing) |
| dossier | `dossiers, documents, document_pages, job_progress` |
| extraction | `extractions, shipments, extracted_fields` |
| (dùng chung) | `field_audit` (append-only, định nghĩa ở `db/schema/shared.ts` như `org_audit` là nhật ký xuyên module): extraction, declaration, catalog, integration ghi qua repo `fieldAudit` trong uow của chính mình (`src/db/field-audit.ts`) |
| validation | `validations` |
| skill | `skills` (+ `is_template` ở org `org_system`), `skill_versions, skill_samples, skill_evaluations` |
| declaration | `line_items` (cột nối danh mục: `catalog_item_id, catalog_alias_id, unit_factor, item_code`), `hs_suggestions, declarations, agent_runs`; bảng chung `catalog_hs, exchange_rates`; `product_catalog` (cũ, chỉ đọc – xóa sau một bản phát hành) |
| catalog | `catalog_settings` (chế độ SHARED / PER_DEPARTMENT + bộ đếm mã nối), `catalog_items, code_sets, code_set_owners, item_aliases, item_unit_conversions, catalog_match_queue` (hàng chờ ghép), `catalog_imports` (lần nhập + dòng lưu tạm cho job nền); migration `0037`–`0041` (`0040`: `code_sets.is_source` + unique một phần `code_sets_org_source_uq`, `catalog_match_queue.factor` / `item_fields`, chuyển dữ liệu đặt bộ nguồn gốc; `0041`: `catalog_items.qty2_unit` + `qty2_factor numeric(24,9)` – ĐVT số lượng 2 + tỷ lệ, `CatalogPort.describeItems` trả `qty2` để declaration tính Số lượng (2) bằng `itemQuantity2` khi áp kế hoạch danh mục; kết quả lưu ở `line_items.quantity2/quantity2_unit/quantity2_factor` – migration `0042` của declaration – truyền đọc giá trị đã lưu). Đổi ĐVT gốc mặt hàng chia lại `line_items.unit_factor` CÙNG transaction qua repo `lineFactors` (`src/db/catalog-line-factors.ts`, như `field-audit.ts` – chỗ duy nhất catalog chạm bảng declaration, chỉ cột `unit_factor`). Sửa danh mục dùng lại `field_audit` (append-only): `dossier_id` = id mặt hàng, `source` = `CATALOG_EDIT`; số tờ khai cuối (`last_declaration_no`) ghi khi Hải quan cấp số tờ khai nhánh (`CatalogPort.recordDeclarationNo`, integration gọi sau commit, theo dòng đã gửi `customs_results.raw.sentLineIds` → `raw.sent` → dự phòng vị trí dòng; tự bù khi crash / khai sửa đổi dòng: `raw.catalogNo = { no, lines }` đặt bằng `results.markCatalogNo` – UPDATE jsonb riêng, có điều kiện số tờ khai – sau khi danh mục thành công, poll/outbox đối soát khi khác số hoặc khác tập dòng đã gửi; ngày: đăng ký Hải quan → `raw.numberAt` → thông điệp khai tạm → `updated_at` trước lần xử lý; không migration) |
| integration | `integration_status, customs_outbox, customs_messages` (append-only), `customs_results`, `container_lists` (danh sách container khai trước, mỗi lần khai một `attempt`), `kvgs_sheets` (bảng kê qua khu vực giám sát; một bản `SENDING` mỗi hồ sơ+nhánh – chỉ mục duy nhất từng phần) |
| billing | `usage_events`; `credit_ledger` (sổ lượt append-only – kb_app chỉ select/insert dòng của org), `payments` (đơn PayOS; đọc không ngữ cảnh để webhook tìm theo `order_code`), `org_contracts` (hợp đồng năm – khu Quản trị ghi, khách chỉ đọc của mình); bảng chung `plans` (`kind` PAYG/CONTRACT, `price_per_declaration_vnd`) |

Cách truy cập: mỗi module có **Unit of Work** (`uow.asOrg(ctx, repos => …)`) bọc một transaction và `set_config('app.org_id')` để Row-Level Security lọc; app kết nối bằng role `kb_app` (chịu RLS), migration/seed bằng admin. Module khác chỉ đọc dữ liệu của nhau qua port + adapter nối ở composition root (`apps/web/src/container.ts`, `apps/worker/src/container.ts`), không import bảng của nhau (depcruise chặn).

**Transaction không gọi ra ngoài:** callback của `uow.*` chỉ dùng repos `r` của chính nó. Port sang module khác (`deps.quota`, `deps.users`, `deps.plans`, `deps.usage`, `orgAudit`…), storage, HTTP/AI gọi **trước hoặc sau** transaction – các port này lấy kết nối pool khác; transaction đang giữ khóa dòng mà chờ kết nối pool thì khi nhiều request song song (pool 10) cả web treo (sự cố 28/10/2026: `getSession` UPDATE `sessions` rồi gọi `plans`/`usage` trong transaction). Ghi dòng "nóng" (phiên, bộ đếm) trong transaction ngắn riêng và hạn chế tần suất.

**`field_audit` cùng uow với lệnh sửa (bất biến 6):** dòng audit ghi bằng `r.fieldAudit.append(ctx, at, entries)` TRONG callback `uow.asOrg` đã sửa dữ liệu – commit cùng nhau, lỗi ném ra rollback cả hai (tiến trình chết giữa chừng không còn mất riêng dòng audit). `userId` lấy từ ctx, `at` từ `deps.clock`. Không còn port writer audit sang module extraction (đó là gọi ra ngoài transaction). Catalog gom mục audit trong callback rồi ghi trước commit qua `asOrgAudited` (`catalog/application/common.ts`); lịch sử mặt hàng đọc qua cùng repo.

Việc nền: BullMQ (`extract-document`, `run-agent`, `customs-send`, `customs-poll`, `kvgs-poll` (hỏi kết quả khai danh sách container – V5ContainerRes, 30 giây × tối đa 40; bảng kê KVGS là một lời gọi đồng bộ `POST /api/KVGS` trong `customs-send`, không poll), `skill-sample-read`, `skill-evaluate`, `catalog-import` (nhập danh mục > 500 dòng: ghép các dòng đã lưu tạm theo lô, idempotent theo lần nhập), `cert-expiry` hằng ngày, `billing-reconcile` hằng ngày – đối soát lượt/thanh toán PayOS). Tiến trình đẩy qua Redis pub/sub → SSE `GET /api/dossiers/:id/events`. Truyền Hải quan theo outbox (ADR 0005): mỗi nghiệp vụ một dòng `customs_outbox` với `idempotency_key`, thông điệp đi/đến ghi `customs_messages` (đã che bí mật), trạng thái ở `customs_results` theo máy trạng thái `domain/state-machine.ts`. Outbox `CONT_LIST` / `KVGS` (qua khu vực giám sát, ADR 0014) xử lý bởi `customs-send` nhánh riêng như HYS: ghi `container_lists` / `kvgs_sheets`, không đụng `customs_results`, không khóa nghiệp vụ tờ khai; hết lượt thử → bản ghi REJECTED (`E-SEND`).

- Multi-tenant theo ADR 0004: mỗi doanh nghiệp (1 MST) là một organization; người dùng là nhân viên, đăng nhập bằng email, vai trò `OWNER / ADMIN / DECLARANT / APPROVER / VIEWER`.
- Mọi bảng nghiệp vụ có `org_id`; bật Row-Level Security làm lớp bảo vệ thứ hai.
- JSON lớn (extraction, shipment, declaration) lưu `jsonb`, có `schema_version`.
- `field_audit` append-only: giá trị gốc, giá trị mới, người sửa, nguồn, bbox. Đây là dữ liệu nhãn để đo độ chính xác.

## 5. Kiểm thử

| Mức | Công cụ | Bắt buộc cho |
|---|---|---|
| Unit | Vitest | Mọi hàm `domain`, mọi luật validation, mọi quy tắc ánh xạ tờ khai |
| Integration | Vitest + Testcontainers (Postgres) | Use case có DB, kiểm tra cô lập org |
| Extraction eval | Golden set (`evals/`) | Mọi thay đổi prompt, schema trích xuất, model |
| E2E | Playwright | 3 luồng: upload→review, review→tờ khai, cấu hình skill |

Lệnh: `pnpm test` (unit + integration, cần Docker cho Testcontainers), `pnpm eval` (golden set `evals/golden`, offline bằng fixture/fake; `--live` gọi AI thật và ghi fixture), `pnpm test:e2e` (Playwright, chạy trên bản build http với `AI_PROVIDER=fake`, xem `apps/web/e2e/`).

CI chặn merge nếu fail: `typecheck · lint · depcruise · test · build`.

## 6. Quyết định kiến trúc (ADR)

Xem `docs/adr/`. Muốn đổi một quyết định → viết ADR mới, không sửa ngầm.
