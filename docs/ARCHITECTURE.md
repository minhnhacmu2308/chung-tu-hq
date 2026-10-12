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
| `billing` | Gói, hạn mức, usage (token, chi phí) theo org |
| `integration` | Adapter: Customs Hub, hscodepro, tra cứu HĐĐT, nhà cung cấp AI, object storage |

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

PostgreSQL + Drizzle. Bảng chính: `organizations, users, memberships, dossiers, documents, document_pages, extractions, shipments, field_audit, validations, skills, skill_versions, skill_examples, declarations, usage_events, job_progress`.

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

CI chặn merge nếu fail: `typecheck · lint · depcruise · test · build`.

## 6. Quyết định kiến trúc (ADR)

Xem `docs/adr/`. Muốn đổi một quyết định → viết ADR mới, không sửa ngầm.
