# Thiết kế backend KhaiBáo AI

> Ngày: 2026-10-13 · Trạng thái: chờ duyệt · Thay thế mock trong `apps/web/src/mocks` bằng backend thật.
> Nguồn: `docs/ARCHITECTURE.md`, `docs/adr/0001–0005`, `docs/PRODUCT.md`, đặc tả FPT và văn bản chỉ tiêu trong `business/`.

## 1. Mục tiêu và phạm vi

**Mục tiêu.** Dựng toàn bộ backend để giao diện hiện có chạy trên dữ liệu thật, AI thật, hàng đợi thật, mà **không sửa màn hình**: chỉ thay thân hàm trong `apps/web/src/api/*.ts` (đúng cam kết trong `apps/web/CLAUDE.md`).

**Trong phạm vi.**
- `packages/contracts`: Zod schema dùng chung FE/BE.
- `packages/core`: 8 module `identity, dossier, extraction, validation, skill, declaration, billing, integration` theo 3 tầng domain/application/infrastructure.
- PostgreSQL + Drizzle + RLS, Redis + BullMQ, object storage S3 (MinIO dev / R2 prod), Docker Compose.
- `apps/web`: route handler REST mỏng, session cookie, SSE tiến trình; `src/api/*.ts` gọi HTTP.
- `apps/worker`: consumer BullMQ mỏng.
- Adapter giả cho mọi hệ thống ngoài (AI, FPT, hscodepro, tỷ giá, email) và adapter thật cho AI (Claude) + khung adapter FPT theo đặc tả.
- Seed dữ liệu demo tương đương dữ liệu mock hiện tại để demo và PM không bị gián đoạn.

**Ngoài phạm vi (không làm lần này).**
- Khai bổ sung sau thông quan (AMA/AMC), hủy tờ khai, tách vận đơn, khai định danh: chỉ khai báo port, không hiện thực.
- Đại lý khai hộ nhiều doanh nghiệp (ADR 0004).
- Thanh toán gói trực tuyến; chỉ có bảng gói, hạn mức và usage.
- Biểu thuế đầy đủ: chỉ catalog HS tối thiểu để chạy luồng; nhập biểu thuế thật là việc dữ liệu, làm sau khi có nguồn.

**Thành công khi.** Trên máy dev chạy `pnpm dev`, đăng ký doanh nghiệp theo MST, tạo hồ sơ, upload PDF thật, worker đọc bằng Claude, màn OCR hiện trường + luật đối chiếu, chạy agent ra tờ khai IDA/EDA đúng chỉ tiêu Phụ lục II, phê duyệt, truyền qua adapter FPT giả và thấy phân luồng + nhật ký thông điệp. `pnpm typecheck && pnpm lint && pnpm test` xanh; có test cô lập org cho mọi use case.

## 2. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Chạy production bằng Docker Compose trên VPS (web, worker, postgres, redis, minio→R2) | ADR 0001; worker BullMQ chạy dài, không giới hạn thời gian job |
| D2 | FE gọi backend qua **route handler REST** `apps/web/src/app/api/**`; `src/api/*.ts` giữ nguyên chữ ký, thân là `fetch` | Màn hình và TanStack Query giữ nguyên; gọi song song, polling, SSE tự nhiên; mở được cho khách Enterprise |
| D3 | Đăng nhập tự viết trong `identity`: email + mật khẩu (Argon2id), bảng `sessions`, cookie HttpOnly, xác thực email, đặt lại mật khẩu, giới hạn tần suất | Khớp luồng đăng ký theo MST của ADR 0004, không phụ thuộc hãng |
| D4 | Cổng Hải quan = **API FPT.VNACCS** theo đặc tả trong `business/13-API-FPT-dac-ta`. Tài khoản VNACCS (USER_ID, PASSWORD, TERMINAL_ID, TERMINAL_ACCESS_KEY) của **từng doanh nghiệp**, mã hóa trong DB | Đặc tả FPT nhận tài khoản VNACCS, không nhận chữ ký từ client → ký số do phía FPT/VNACCS xử lý theo chứng thư đã đăng ký |
| D5 | Ánh xạ tờ khai viết theo **số chỉ tiêu Phụ lục II** (1.x nhập, 2.x xuất) rồi adapter FPT chuyển sang `objVN_IDA/EDA...` | Đối chiếu được với văn bản pháp lý; đổi thông tư chỉ sửa catalog; đổi nhà cung cấp API chỉ sửa adapter |
| D6 | AI đọc chứng từ: gửi PDF/ảnh trực tiếp cho Claude (document block) với structured output theo Zod; không tự OCR | Rẻ hơn và ít mã hơn so với pdf.js + OCR riêng; port `AiProvider` cho phép đổi sau |
| D7 | Giữ chế độ mock của FE bằng cờ `NEXT_PUBLIC_DATA_SOURCE=mock` | Bản demo trên Vercel và PM vẫn chạy không cần backend |
| D8 | Mọi hệ thống ngoài có adapter giả; dev/test không bao giờ gọi FPT thật | ADR 0005 |

## 3. Kiến trúc tổng thể

```
apps/web (Next.js 16)                       apps/worker (BullMQ)
  app/api/**  route handler mỏng              jobs/*.ts  handler mỏng
  src/api/*.ts  fetch → /api/**               ───────────────┐
  container.ts  composition root              container.ts    │
        │                                           │          │
        ▼                                           ▼          │
packages/core  ──── modules/<m>/index.ts (public API) ─────────┘
  shared/      Result, DomainError, OrgId, Decimal, Clock, IdGen
  db/          Drizzle schema (1 file / module), client, migrate, RLS
  modules/     identity · dossier · extraction · validation · skill · declaration · billing · integration
packages/contracts  Zod: DTO cho API, schema trích xuất, catalog chỉ tiêu, payload FPT

Hạ tầng (docker-compose.yml): postgres:16 · redis:7 · minio · (mailpit cho email dev)
```

Chiều phụ thuộc giữ đúng `.dependency-cruiser.cjs`. Bổ sung một rule: `modules/<m>/infrastructure/` chỉ được import `db/schema/<m>.ts` và `db/schema/shared.ts` (module không đọc bảng của module khác).

### 3.1 Shared kernel (`packages/core/src/shared`)

- `Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`, helper `ok()`, `err()`.
- `DomainError = { code: DomainErrorCode; message?: string; details?: unknown }`. `DomainErrorCode` là union cố định (vd `NOT_FOUND`, `FORBIDDEN`, `DOSSIER_LOCKED`, `QUOTA_EXCEEDED`, `BLOCKER_FAILED`, `HS_UNCONFIRMED`, `INVALID_STATE`, `EMAIL_TAKEN`, `TAX_CODE_EXISTS`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `RATE_LIMITED`).
- Branded id: `OrgId`, `UserId`, `DossierId`, … (`string & { __brand }`). Mọi repo nhận `orgId` là tham số đầu tiên.
- `Ctx = { orgId: OrgId; userId: UserId; role: Role }` truyền vào mọi use case; `requireRole(ctx, ...roles)` trả `err({code:"FORBIDDEN"})`.
- `Clock { now(): Date }`, `IdGen { next(prefix): string }` (ULID với tiền tố `dos_`, `doc_`… giống id mock).
- `Decimal` = `decimal.js`; DTO ra ngoài luôn là chuỗi `DecimalString`.
- `Money`/`Qty` helpers: `toDecimal(string)`, `fmtDecimal(d, scale)`.

### 3.2 Cơ sở dữ liệu

PostgreSQL 16, Drizzle ORM + driver `postgres`. Schema trong `packages/core/src/db/schema/<module>.ts`, migration SQL trong `packages/core/drizzle/`. Mọi bảng nghiệp vụ có `org_id uuid not null` + index `(org_id, …)` + policy RLS.

**RLS.** Ứng dụng kết nối bằng role `kb_app` (không bypass RLS). Mỗi use case chạy trong `withOrg(orgId, tx => …)`: `BEGIN; SET LOCAL app.org_id = '<uuid>'; …; COMMIT`. Policy mẫu: `USING (org_id = current_setting('app.org_id')::uuid)`. Bảng toàn cục (`users`, `organizations`, `plans`, `catalogs`) có policy riêng theo nhu cầu. Migration tạo role và policy; test Testcontainers kiểm tra RLS chặn org khác thật.

**Bảng theo module** (cột chính; mọi bảng có `id`, `org_id` trừ khi ghi khác, `created_at`, `updated_at`):

| Module | Bảng | Ghi chú |
|---|---|---|
| identity | `users` (không org_id: email unique, password_hash, name, email_verified_at), `organizations` (tax_code unique, name, address, phone, suspect_threshold, plan_code), `memberships` (user_id, org_id, role, status ACTIVE/INVITED/DISABLED, invited_by), `sessions` (user_id, org_id, token_hash, expires_at, ip, ua), `auth_tokens` (user_id, kind VERIFY_EMAIL/RESET_PASSWORD/INVITE, token_hash, expires_at, used_at), `join_requests` (org_id, user_id, status), `digital_certificates` (subject, issuer, serial, valid_to, is_default), `org_secrets` (kind VNACCS/HSCODEPRO…, ciphertext, key_version) | |
| dossier | `dossiers` (code, direction, type_code, partner, customs_office_code, customs_office_name, skill_set_id, status, step, due_date, owner_id, note, invoice_value numeric, currency, incoterm, transport_mode, bill_no, suspect_fields int, declaration_no, channel), `documents` (dossier_id, kind, file_name, size_bytes, pages, status, error, storage_key, sha256, uploaded_by), `document_pages` (document_id, page_no, kind_detected, is_duplicate, storage_key_preview), `notifications` (user_id, title, body, href, read_at) | `dossiers.code` sinh `HS-NK-YYMM-NNN` theo org |
| extraction | `extractions` (document_id, skill_version_id, prompt_version, model, schema_version, raw jsonb, usage_event_id, status), `shipments` (dossier_id, version, data jsonb, schema_version), `extracted_fields` (document_id, dossier_id, group, key, label, value, original_value, status, region jsonb, note, confirmed_by, confirmed_at), `field_audit` (dossier_id, field_id, old_value, new_value, user_id, source, at) **append-only, không có UPDATE/DELETE policy** | `extracted_fields` là hình chiếu của `shipments.data` cho UI; `shipments.data` là nguồn cho validation và declaration |
| validation | `validations` (dossier_id, shipment_version, rule_code, title, detail, result, severity, document_kinds text[], fields text[]) | Ghi đè theo `(dossier_id, shipment_version)` |
| skill | `skills` (code, name, kind, doc_kind, supplier, language, enabled, is_template, current_version), `skill_versions` (skill_id, version, fields jsonb, prompt_notes), `skill_samples` (skill_id, document_id?, storage_key, file_name, size, status PENDING/LABELED, expected jsonb), `skill_evaluations` (skill_id, version, accuracy, per_field jsonb, sample_count, ran_at) | Org mới được sao chép từ skill mẫu `is_template` (org_id của template = org hệ thống) |
| declaration | `line_items` (dossier_id, line_no, description, quantity, unit, unit_price, amount, origin, invoice_hs_code, hs_suggested, hs_confidence, hs_confirmed, hs_confirmed_by, import_duty_rate, vat_rate, policy_note), `hs_suggestions` (line_item_id, code, description, confidence, rates jsonb, source), `declarations` (dossier_id, kind IDA/EDA, version, status, fields jsonb (chỉ tiêu→{value, source, suspect}), exchange_rate, exchange_rate_date, customs_value_vnd, value_adjustments jsonb, est_import_duty_vnd, est_vat_vnd, approved_by, approved_at), `agent_runs` (dossier_id, mode, status, tasks jsonb, log jsonb, started_at, finished_at) | |
| integration | `customs_outbox` (dossier_id, declaration_id, operation, idempotency_key unique, payload jsonb, status PENDING/SENT/FAILED, attempts, next_attempt_at), `customs_messages` (dossier_id, operation, direction OUT/IN, result, summary, payload_masked jsonb, external_ref, at) **append-only**, `customs_results` (dossier_id, declaration_no, channel, channel_note, clearance_status, customs_tax_vnd, raw jsonb, updated_at), `integration_status` (kind, status, last_checked_at, detail) | |
| billing | `plans` (không org_id: code, name, dossiers_per_month, pages_per_dossier, price), `usage_events` (dossier_id?, kind AI_EXTRACT/AI_CLASSIFY/HS_LOOKUP/CUSTOMS_SEND, provider, model, input_tokens, output_tokens, cost_vnd numeric, meta jsonb, at), `exchange_rates` (không org_id: currency, date, rate numeric, source) | |
| hệ thống | `job_progress` (dossier_id, job_id, kind, progress, message, status), `catalog_*` (không org_id: `catalog_customs_offices`, `catalog_countries`, `catalog_units`, `catalog_ports`, `catalog_hs` tối thiểu) | Catalog nạp từ `DANH MUC CHUAN VNACCS` + file seed |

Tiền và trị giá: `numeric(24,6)`; mã định danh `text`; ngày nghiệp vụ `date`; thời điểm `timestamptz`.

### 3.3 Hàng đợi và tiến trình

BullMQ trên Redis. Queue và job:

| Queue | Payload (Zod) | Việc | Idempotency |
|---|---|---|---|
| `extract-document` | `{orgId, dossierId, documentId, idempotencyKey}` | Phân loại trang → trích xuất → chuẩn hóa → gộp vào shipment → chạy luật → cập nhật trạng thái | `(documentId, sha256, PIPELINE_VERSION)`; đã có `extractions` khớp → bỏ qua |
| `run-agent` | `{orgId, dossierId, agentRunId, mode}` | Gợi ý HS cho từng dòng → ánh xạ → dựng tờ khai → (số hóa chứng từ) | `agentRunId`; task đã DONE không chạy lại |
| `customs-send` | `{orgId, outboxId}` | Đọc outbox, gọi gateway, ghi `customs_messages`, chuyển trạng thái | `idempotency_key` của outbox; trước khi gửi lại thông điệp từng timeout phải `queryStatus` |
| `customs-poll` | `{orgId, dossierId}` (lặp) | Hỏi kết quả (IEX/TRANGTHAI) cho tờ khai đang chờ | Job lặp theo dossier, dừng khi CLEARED/REJECTED |
| `skill-evaluate` | `{orgId, skillId, version}` | Chạy trích xuất trên mẫu đã gắn nhãn, so với expected, ghi `skill_evaluations` | `(skillId, version, sampleSetHash)` |

Giới hạn đồng thời theo org: BullMQ group key = `orgId` (dùng `limiter` + `jobId` tiền tố org; nếu không đủ, worker tự đếm job đang chạy theo org trong Redis).

Lỗi tạm thời (429, 5xx, timeout) → throw để retry backoff (5 lần, 10s×2ⁿ). Lỗi dữ liệu (PDF hỏng, có mật khẩu, quá trang) → ghi `documents.status = ERROR` + `error`, không retry.

**Tiến trình realtime.** Worker ghi `job_progress` và publish Redis channel `org:{orgId}:dossier:{dossierId}` (sự kiện `document.status`, `fields.updated`, `agent.task`, `customs.message`). Route `GET /api/dossiers/:id/events` là SSE: đăng ký channel, đẩy sự kiện; FE hook `useDossierEvents` gọi `queryClient.invalidateQueries`. Polling hiện tại của FE giữ làm dự phòng (giãn lên 5s khi SSE đang kết nối).

### 3.4 Lưu file

Port `ObjectStorage { put, getStream, presignGet, delete, list }`. Khóa: `orgs/{orgId}/dossiers/{dossierId}/{documentId}/{sha256}.pdf`; mẫu skill: `orgs/{orgId}/skills/{skillId}/samples/{id}`. Upload: FE gửi `multipart/form-data` tới `POST /api/dossiers/:id/documents` (giới hạn theo gói: trang/hồ sơ, dung lượng/file), web stream thẳng lên storage, tính sha256, đếm trang bằng `pdf-lib`, ghi `documents`, đẩy job. Xem PDF: `GET /api/documents/:id/file` trả redirect sang presigned URL (TTL 10 phút).

### 3.5 Bảo mật

- Session: cookie `kb_session` HttpOnly, Secure, SameSite=Lax, 30 ngày trượt; `token_hash = sha256(token)`.
- Mật khẩu: Argon2id (`@node-rs/argon2`), tối thiểu 8 ký tự.
- Giới hạn tần suất: đăng nhập 10 lần/15 phút theo email+IP, đăng ký 5/giờ/IP (Redis).
- Bí mật của org (`org_secrets`): AES-256-GCM envelope với `APP_MASTER_KEY` (env), `key_version` để xoay khóa; không bao giờ trả về API, chỉ trả `configured: true/false` và 4 ký tự cuối.
- Che dữ liệu nhạy cảm trong `customs_messages.payload_masked`: PASSWORD, TERMINAL_ACCESS_KEY, MST che giữa.
- Mọi route: `requireSession()` → `Ctx`; input `parse` bằng schema `@kb/contracts`; lỗi Zod → 400 `{code:"VALIDATION", issues}`; `DomainError` → HTTP theo bảng (`NOT_FOUND`→404, `FORBIDDEN`→403, `RATE_LIMITED`→429, còn lại 409/422).

## 4. Module

Mỗi module: `domain/` (kiểu + hàm thuần, test unit), `application/` (use case + `ports.ts`), `infrastructure/` (Drizzle repo, adapter), `index.ts`. Dưới đây là use case và port chính. Tên tiếng Anh theo `docs/CONVENTIONS.md`.

### 4.1 identity

**Use case:** `register` (email, mật khẩu, tên → user + token xác thực), `verifyEmail`, `login`, `logout`, `getSession`, `lookupTaxCode` (port `TaxRegistryLookup`, giả trả tên/địa chỉ theo MST), `createOrganization` (MST mới → org + OWNER + gói TRIAL + sao chép skill mẫu), `requestJoin` (MST đã có → `join_requests`, thông báo Owner), `approveJoin`, `inviteMember` (ADMIN+; token INVITE, email), `acceptInvite`, `changeMemberRole`, `setMemberDisabled`, `updateOrganization`, `updateSuspectThreshold`, `requestPasswordReset`, `resetPassword`, `listCertificates/addCertificate/removeCertificate/setDefaultCertificate`, `setOrgSecret/getOrgSecretStatus`.

**Port:** `UserRepo`, `OrgRepo`, `MembershipRepo`, `SessionRepo`, `AuthTokenRepo`, `CertificateRepo`, `SecretStore` (mã hóa), `Mailer` (`ConsoleMailer` dev → Mailpit, `SmtpMailer` prod), `PasswordHasher`, `RateLimiter`, `TaxRegistryLookup`.

**Quy tắc:** email unique toàn hệ thống; MST unique; không xóa thành viên, chỉ DISABLED; OWNER không tự hạ vai trò khi là OWNER duy nhất; mọi use case ngoài đăng ký/đăng nhập yêu cầu `email_verified_at`.

### 4.2 dossier

**Use case:** `createDossier` (kiểm hạn mức gói qua `billing.checkQuota`; sinh `code`; gợi ý danh sách chứng từ theo loại hình), `listDossiers` (lọc direction/status/step), `getDossier`, `updateDossier` (note, step), `cancelDossier`, `uploadDocuments` (ghi `documents`, đẩy `extract-document`), `changeDocumentKind` (đổi loại → chạy lại trích xuất), `deleteDocument` (xóa storage + fields; shipment gộp lại), `retryDocument`, `listDocuments`, `getDocumentFileUrl`, `moveToStep` (kiểm điều kiện: upload→ocr cần ≥1 DONE; ocr→agent cần `finishReading`; review→submit cần APPROVED), `listNotifications`, `markNotificationsRead`, `reportProgress`.

**Port:** `DossierRepo`, `DocumentRepo`, `NotificationRepo`, `ObjectStorage`, `JobQueue`, `ProgressPublisher`, `billing` qua index.

**Trạng thái** `DossierStatus` giữ đúng FE: DRAFT → PROCESSING (có job đang chạy) → NEEDS_REVIEW → APPROVED → SUBMITTED → CLEARED | CANCELLED. `step` tách khỏi `status` như FE.

### 4.3 extraction

**Domain:** `DocType` enum = `DocKind` của FE; schema trích xuất mỗi loại trong `@kb/contracts/extraction/*` (`required + nullable`, `.describe()` nhãn thường gặp); `normalize.ts` (số theo locale EU/US/VN, ngày về `YYYY-MM-DD`, mã nước ISO-2, đơn vị về mã VNACCS, tên công ty); `merge.ts` (`FileExtraction[] → Shipment` kèm `sources[{docId, page, region, raw}]` cho từng trường); `field-status.ts` tính `FieldStatus` theo ADR 0003 (CROSS_CHECKED/SINGLE_SOURCE/CONFLICT/INVALID_FORMAT/MODEL_UNSURE/USER_CONFIRMED) có ngưỡng theo `suspect_threshold` của org; `project-fields.ts` sinh `extracted_fields` (nhóm GENERAL/PARTIES/COMMERCIAL/TRANSPORT/ITEMS) từ shipment.

**Pipeline `processDocument`** (use case, chạy trong worker):
1. Tải file; nếu `documents.kind` do người dùng đặt → bỏ qua phân loại. Ngược lại gọi `AiProvider.classifyPages(file)` → `[{pages:[1,2], kind, isDuplicateCopy}]`; trang `Duplicate/Triplicate` và trang điều khoản in sẵn bỏ.
2. Với mỗi chứng từ phát hiện: chọn skill (theo `docKind` + nhà cung cấp nếu khớp alias), lấy `skill_versions.fields` làm danh sách trường cần đọc, gọi `AiProvider.extract(file, pages, schema, skillHints)` với structured output. Hóa đơn điện tử XML → parser thuần, không gọi AI.
3. Ghi `extractions` + `usage_events` (token, chi phí theo bảng giá model, VND theo tỷ giá cấu hình).
4. `merge` toàn bộ extraction của dossier → `shipments` version mới → `project-fields` (giữ giá trị người dùng đã USER_CONFIRMED) → `validation.runRules` → cập nhật `dossiers.suspect_fields`, `status`.

**Use case khác:** `listFields`, `updateFieldValue` (ghi `field_audit`, cập nhật shipment, chạy lại luật), `confirmField`, `revertField`, `finishReading` (chốt dữ liệu, cho phép còn trường nghi ngờ).

**Port:** `AiProvider { classifyPages, extract }` với adapter `ClaudeAiProvider` (`@anthropic-ai/sdk`, model mặc định `claude-sonnet-5-5`, structured output qua tool JSON schema sinh từ Zod, `PROMPT_VERSION`) và `FakeAiProvider` (trả kết quả từ fixture theo sha256 hoặc sinh từ tên file giống mock hiện tại), `ExtractionRepo`, `ShipmentRepo`, `FieldRepo`, `FieldAuditRepo`.

### 4.4 validation

Luật là hàm thuần `(shipment, ctx) → Validation[]` trong `domain/rules/`, đăng ký ở `rules/index.ts`. Bộ luật ban đầu (mã theo mock hiện có để UI quen):

| Mã | Mức | Kiểm |
|---|---|---|
| `R-AMOUNT-SUM` | BLOCKER | Tổng invoice = Σ dòng hàng (sai số 0,01) |
| `R-WEIGHT-PL-BL` | BLOCKER | Gross weight Packing List ≈ B/L (0,5% hoặc 0,1 kg) |
| `R-QTY-PL-INV` | BLOCKER | Số lượng/kiện PL = Invoice |
| `R-INVOICE-REF` | WARNING | Số invoice xuất hiện trên PL/CO/Contract khớp |
| `R-INCOTERM-FREIGHT` | BLOCKER | EXW/FCA/FAS/FOB phải có hóa đơn cước / Arrival Notice để cộng trị giá (PRODUCT §7.3) |
| `R-ORIGIN-CO` | WARNING | Xuất xứ C/O khớp invoice; REX hợp lệ nếu EVFTA |
| `R-BUYER-MST` | INFO | Người mua trên invoice là org (so tên chuẩn hóa; nhắc tờ khai dùng tên theo MST) |
| `R-POD-TRANSSHIP` | WARNING | Cảng dỡ trên B/L là cảng nước ngoài → dùng điểm đến cuối tại VN |
| `R-HS-6` | INFO | HS trên invoice nước ngoài chỉ tham khảo 6 số |
| `R-DATE-ORDER` | WARNING | Ngày invoice ≤ ngày B/L ≤ ngày hàng đến |
| `R-LAW-MO-CU` | BLOCKER | Hàng chương 84/85 phải có "MO" hoặc "CU" ở ô văn bản pháp quy thứ nhất (CV 2061/TCHQ-GSQL) |
| `R-SHARED-CONTAINER` | WARNING | Hàng chung container: phương thức vận chuyển "2" và ghi số tờ khai liên quan vào Phần ghi chú (CV 6376) |
| `R-WAREHOUSE-CODE` | WARNING | Mã địa điểm lưu kho đuôi "OZZ" không dùng cho tờ khai nhập (CV 4613) |

Mỗi luật ≥ 4 test (PASS, FAIL/WARN, SKIPPED, biên). Use case `runRules(dossierId)` ghi `validations`; `listChecks`.

### 4.5 skill

**Use case:** `listSkills`, `getSkill`, `setSkillEnabled`, `updateSkillField/addSkillField/removeSkillField` (tạo `skill_versions` mới, tăng `version`), `listSamples`, `uploadSamples` (PENDING), `labelSample` (expected do người duyệt; từ `field_audit` của một hồ sơ thật nếu chọn "lấy từ hồ sơ"), `confirmPendingSamples`, `evaluateSkill` (đẩy job `skill-evaluate`), `getEvaluation`, `cloneTemplatesForOrg` (gọi từ identity khi tạo org).

**Domain:** `accuracy.ts` so sánh expected vs actual theo kiểu trường (chuỗi chuẩn hóa, số sai số, ngày, party theo tên chuẩn hóa) → độ chính xác từng trường và tổng; `MIN_SAMPLES_FOR_ACCURACY = 5`.

### 4.6 declaration

**Domain:**
- `catalog/declaration-fields.ts`: **catalog chỉ tiêu** sinh từ Phụ lục II (TT39, sửa đổi TT121/2025). Mỗi phần tử: `{ no: "1.26", form: "01", section: "GENERAL|PARTIES|TRANSPORT|VALUE|ITEMS|TAX", label, type, maxLen, required, codeTable?: "A038"|…, fptField: "VD_BL1", legalNote }`. Phạm vi đầu: toàn bộ chỉ tiêu mà hệ thống điền được từ chứng từ/hồ sơ/tài khoản (khoảng 60 của Mẫu 01, 50 của Mẫu 02); chỉ tiêu còn lại có trong catalog, đánh dấu `manual`.
- `mapping/ida/*.ts`, `mapping/eda/*.ts`: `FieldMapping[]` theo skill `mapping-declaration-fields`: `{ no, source: ValueSource, from(shipment, dossier, org), transform?, required, validate? }`. Nguồn hiển thị đúng nhãn FE (`INVOICE / BILL_OF_LADING / … / ACCOUNT / DEFAULT / SYSTEM`).
- `catalogs/`: đơn vị tính, nước, phương thức thanh toán (`TK_IVP`), điều kiện giao hàng, phương thức vận chuyển (`MTC` 1–6,9), cơ quan hải quan (A038), loại hình (ICB/ECB) nạp từ `DANH MUC CHUAN VNACCS` + seed.
- `valuation.ts` (Decimal): trị giá tính thuế = trị giá hóa đơn ± khoản điều chỉnh; EXW/FCA/FAS/FOB cộng cước + bảo hiểm + phí nước ngoài; sinh `value_adjustments` với nguồn; phân bổ theo trị giá dòng.
- `tax.ts` (Decimal): thuế NK = trị giá tính thuế × thuế suất (MFN hoặc FTA nếu C/O hợp lệ và người dùng chọn), VAT = (trị giá + thuế NK) × VAT; quy đổi theo `exchange_rates` ngày tờ khai.
- `guards.ts`: `canApprove(declaration, validations, lineItems)` và `canSubmit(...)` → chặn khi BLOCKER FAIL, HS chưa xác nhận, chưa APPROVED.

**Use case:** `startAgentRun` (tạo `agent_runs`, đẩy job), `getAgentRun`, `runAgent` (worker: task HS_LOOKUP qua `HsClassifier` → MAPPING → BUILD_DECLARATION → DIGITIZE), `listLineItems`, `listHsCatalog`, `confirmHs/unconfirmHs` (ghi `field_audit`), `getDeclarationView`, `approveDeclaration` (APPROVER/OWNER; nguyên tắc 4 mắt: người duyệt ≠ người tạo hồ sơ, cấu hình được), `moveToReview`, `updateDeclarationField` (sửa chỉ tiêu thủ công, ghi audit, đánh dấu nguồn USER).

**Port:** `HsClassifier` (`HscodeproClassifier` khung HTTP theo `HSCODEPRO_URL`; `FakeHsClassifier` dùng `catalog_hs` + so khớp từ khóa, độ tin cậy giả có hạt giống), `ExchangeRateProvider` (`DbExchangeRates` đọc bảng do admin nhập; `FakeExchangeRates` cố định), `LineItemRepo`, `DeclarationRepo`, `AgentRunRepo`.

### 4.7 integration

**Port `CustomsGateway`** (anti-corruption; nghiệp vụ không thấy DTO FPT):

```ts
interface CustomsGateway {
  preDeclare(orgId, msg: { kind: "IDA"|"EDA"; declaration: DeclarationPayload }, key): Promise<{ externalId: string; declarationNo?: string; errors?: GatewayError[] }>;
  declare(orgId, msg: { kind: "IDC"|"EDC"; externalId }, key): Promise<{ accepted: boolean; errors? }>;
  attachDocuments(orgId, msg: { kind: "HYS"; externalId; files }, key): Promise<{ receiptNo?: string }>;
  sendSupplementaryDoc(orgId, msg: V5Doc, key): Promise<{ receiptNo?: string }>;   // V5Bill/V5Invoice/V5Co…
  queryStatus(orgId, externalId): Promise<{ declarationNo?; channel?: 1|2|3; status: "T"|"A"|"C"|"R"|…; cleared: boolean; customsTax?; directives?: string[] }>;
}
```

- `FptVnaccsGateway`: dựng `objVN_IDA/VN_IDA_HANG/VN_IDA_VANDON/VN_IDA_KTG` và `objVN_EDA/EDA_HANG/EDA_CON` từ `DeclarationPayload` theo đúng kiểu/độ dài trong đặc tả; định dạng ngày `dd/MM/yyyy` như `format.json`; HTTP client đọc `FPT_API_BASE_URL`, thông tin VNACCS từ `org_secrets`. **Endpoint, phương thức xác thực và mã lỗi chưa có trong đặc tả** → adapter để phần HTTP ở một file `fpt-http.ts` có interface rõ, kèm test hợp đồng bằng payload mẫu; cần xác nhận với FPT trước khi bật production.
- `FakeCustomsGateway`: mô phỏng giống `mocks/customs-sim.ts` (số tờ khai 12 số, phân luồng theo hash, HYS thỉnh thoảng lỗi để test "Gửi lại", trạng thái tiến dần qua các lần `queryStatus`).
- Máy trạng thái tờ khai (ADR 0005) trong `domain/state-machine.ts`: `DRAFT → APPROVED → PRE_DECLARED → DECLARED → DOCS_SENT → CLEARED | INSPECTION | REJECTED`, lỗi gửi → `SEND_FAILED` giữ bước.
- **Outbox:** `submitDeclaration(dossierId, certificateId)` kiểm `canSubmit`, trong một transaction ghi `declarations.status`, tạo `customs_outbox` cho IDA/EDA và đẩy job. Job `customs-send` xử lý tuần tự IDA→IDC→HYS theo kết quả; mỗi bước ghi `customs_messages` OUT và IN; `resendOperation` tạo outbox mới cùng `idempotency_key` + hậu tố lần thử sau khi `queryStatus`.
- `listIntegrations/testIntegration`: ping từng adapter, ghi `integration_status`.

### 4.8 billing

`checkQuota(orgId, kind: DOSSIER|PAGES, amount)`, `recordUsage(event)`, `getUsageSummary(orgId, month)` (hồ sơ, trang, chi phí AI VND), `getPlan`. Bảng giá model trong `domain/pricing.ts` (USD/1M token; đổi VND theo `AI_USD_VND_RATE` env, ghi vào event).

## 5. API (route handler)

Tiền tố `/api`. JSON; lỗi `{ code, message, issues? }`. Mọi route trừ `auth/*` cần session. Danh sách khớp 1-1 với hàm trong `apps/web/src/api/*.ts`:

| Nhóm | Route |
|---|---|
| auth | `POST auth/register`, `POST auth/verify-email`, `POST auth/login`, `POST auth/logout`, `GET auth/session`, `GET auth/lookup-tax-code?taxCode=`, `POST auth/organizations` (tạo org / xin gia nhập), `POST auth/password/forgot`, `POST auth/password/reset`, `POST auth/invites/accept` |
| org | `GET/PATCH org`, `PATCH org/suspect-threshold`, `GET org/members`, `POST org/members/invite`, `PATCH org/members/:id/role`, `PATCH org/members/:id/disabled`, `GET org/join-requests`, `POST org/join-requests/:id/approve`, `GET org/integrations`, `POST org/integrations/:id/test`, `PUT org/integrations/:id/secret`, `GET/POST org/certificates`, `DELETE org/certificates/:id`, `POST org/certificates/:id/default`, `GET org/usage` |
| dossiers | `GET/POST dossiers`, `GET/PATCH dossiers/:id`, `POST dossiers/:id/cancel`, `GET dossiers/:id/documents`, `POST dossiers/:id/documents` (multipart), `PATCH documents/:id/kind`, `DELETE documents/:id`, `POST documents/:id/retry`, `GET documents/:id/file`, `GET dossiers/:id/events` (SSE) |
| ocr | `GET dossiers/:id/fields`, `GET dossiers/:id/checks`, `PATCH fields/:id` `{value}`, `POST fields/:id/confirm`, `POST fields/:id/revert`, `POST dossiers/:id/finish-reading` |
| agent/declaration | `GET dossiers/:id/agent-run`, `POST dossiers/:id/agent-run` `{mode}`, `GET dossiers/:id/line-items`, `GET hs-catalog?q=`, `POST line-items/:id/hs/confirm`, `DELETE line-items/:id/hs/confirm`, `GET dossiers/:id/declaration`, `PATCH dossiers/:id/declaration/fields/:no`, `POST dossiers/:id/declaration/approve`, `POST dossiers/:id/move-to-review` |
| customs | `GET dossiers/:id/submission`, `POST dossiers/:id/submission` `{certificateId}`, `POST dossiers/:id/submission/resend` `{operation}`, `GET customs/declarations` |
| skills | `GET skills?kind=`, `GET skills/:id`, `PATCH skills/:id/enabled`, `PATCH/POST/DELETE skills/:id/fields[/:key]`, `GET/POST skills/:id/samples`, `POST skills/:id/samples/confirm`, `POST skills/:id/evaluate`, `GET skills/:id/evaluation` |
| notifications | `GET notifications`, `POST notifications/read-all` |
| dashboard | `GET dashboard` (KPI tổng hợp cho màn Tổng quan) |

`apps/web/src/lib/http.ts`: `apiGet/apiPost/apiPatch/apiDelete/apiUpload` ném `ApiError(code, message)` (lớp đã có trong `mock-request.ts`, chuyển sang `lib/api-error.ts`). `src/api/<x>.ts` = `pick(mockImpl, httpImpl)` theo `NEXT_PUBLIC_DATA_SOURCE`; thân mock chuyển sang `src/mocks/api/<x>.ts` không sửa logic.

Kiểu dữ liệu: `src/mocks/types.ts` chuyển thành `packages/contracts/src/dto/*.ts` (Zod + `z.infer`), `types.ts` chỉ còn `export * from "@kb/contracts/dto"` để màn hình không đổi import.

## 6. Cấu trúc dự án và lệnh

```
docker-compose.yml           postgres · redis · minio · mailpit
.env.example                 DATABASE_URL, REDIS_URL, S3_*, APP_MASTER_KEY, ANTHROPIC_API_KEY?, AI_PROVIDER=fake|claude,
                             CUSTOMS_GATEWAY=fake|fpt, FPT_API_BASE_URL?, HS_CLASSIFIER=fake|hscodepro, MAIL=console|smtp
packages/contracts/          src/{dto,extraction,declaration,fpt}/
packages/core/               src/{shared,db,modules}/ · drizzle/ · scripts/{migrate,seed}.ts
apps/web/src/app/api/**      route handler
apps/web/src/container.ts    composition root (singleton qua globalThis trong dev)
apps/worker/src/{index,container,jobs/*}.ts
evals/golden/<lot>/{*.pdf, expected.json}   (giai đoạn 6)
```

Lệnh gốc: `pnpm dev` (compose up -d + migrate + web + worker qua `concurrently`), `pnpm db:migrate`, `pnpm db:seed` (org demo AN PHÁT, thành viên, hồ sơ, skill mẫu, catalog), `pnpm db:reset`, `pnpm eval [--live]`. CI thêm service Docker cho Testcontainers.

## 7. Kiểm thử

| Tầng | Cách |
|---|---|
| domain | Vitest, không mock: normalize, merge, field-status, từng luật, mapping từng chỉ tiêu (shipment mẫu), valuation/tax (Decimal, so chuỗi), state machine, guards, catalog FPT (độ dài/kiểu) |
| use case | Fake repo in-memory; mỗi use case ≥ 1 test org khác bị từ chối; mỗi `DomainErrorCode` có test |
| repo + RLS | Testcontainers Postgres: migration chạy sạch; truy vấn org A không thấy org B kể cả khi bỏ `where` (RLS) |
| route | Vitest gọi handler trực tiếp với request giả: 401 không session, 400 Zod, map lỗi |
| job | Handler với fake queue; idempotency: chạy 2 lần không tạo bản ghi trùng |
| hợp đồng FPT | Payload sinh ra so với `business/format.json` (khóa, kiểu, định dạng ngày) |
| E2E | Playwright 3 luồng (upload→review, review→tờ khai, cấu hình skill) với `AI_PROVIDER=fake`, chạy trên bản build production |
| eval | `pnpm eval` offline dùng fixture; `--live` gọi Claude |

## 8. Giai đoạn thực thi

Mỗi giai đoạn kết thúc với `typecheck/lint/test` xanh và FE chạy được phần tương ứng trên API thật.

| GĐ | Nội dung | Kết quả thấy được |
|---|---|---|
| 0 | contracts; shared kernel; db + migrate + RLS + seed khung; compose; container; worker khung; test infra; `src/api` tách mock/http + cờ nguồn dữ liệu | `pnpm dev` lên đủ dịch vụ; FE chạy mock như cũ |
| 1 | identity + org/settings + certificates + secrets + mailer | Đăng ký theo MST, đăng nhập thật, quản lý thành viên |
| 2 | dossier, extraction (Claude + fake), validation, SSE, billing usage | Upload PDF thật, worker đọc, màn OCR và đối chiếu chạy thật |
| 3 | skill | Cấu hình skill, mẫu, đánh giá lại |
| 4 | declaration: catalog chỉ tiêu, mapping IDA/EDA, HS, trị giá/thuế, agent run, phê duyệt | Màn Agent và Review tờ khai chạy thật |
| 5 | integration FPT: payload, outbox, state machine, fake gateway, poll, nhật ký | Màn Khai báo Hải quan chạy với adapter giả |
| 6 | dashboard, notifications, eval harness + golden set, tài liệu (ARCHITECTURE/README/HUONG-DAN-PM cập nhật) | Tổng quan có số thật; CI chạy eval offline |

## 9. Rủi ro và giả định

- **FPT**: đặc tả không ghi endpoint/xác thực/mã lỗi HTTP. Giả định REST JSON; phần HTTP cô lập trong một file, bật bằng env. Cần tài khoản test của FPT để nghiệm thu giai đoạn 5 với dữ liệu thật.
- **Biểu thuế và danh mục đầy đủ** (HS 8 số, thuế suất MFN/FTA, mã địa điểm lưu kho, cảng): chưa có nguồn trong repo. Hệ thống chạy với catalog tối thiểu, đánh dấu trường "cần duyệt" khi thiếu mã; nhập dữ liệu thật là việc riêng.
- **Chi phí AI**: mỗi chứng từ 1 lần phân loại + 1 lần trích xuất; mục tiêu PRODUCT §9. Đo bằng `usage_events`, điều chỉnh sau khi có số thật.
- **Ký số**: giả định FPT ký bằng chứng thư đã đăng ký với tài khoản VNACCS của doanh nghiệp. Nếu FPT yêu cầu ký phía client, cần ADR mới (ngoài phạm vi).
- **Turbopack/webpack**: web vẫn dùng `--webpack`; `@kb/core` import vào route handler qua alias `@kb/core/modules/*` (tsconfig paths) và `transpilePackages`.
