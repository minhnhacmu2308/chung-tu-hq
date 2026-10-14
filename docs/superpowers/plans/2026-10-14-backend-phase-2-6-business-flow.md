# Backend giai đoạn 2–6 – API nghiệp vụ trọn luồng · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Plan này gồm 5 giai đoạn nối tiếp; mỗi giai đoạn là một "plan con" (Task 2.x, 3.x, …) kết thúc bằng màn hình tương ứng chạy trên API thật.

**Goal:** Toàn bộ luồng 6 bước chạy trên backend thật: tạo hồ sơ → upload chứng từ → AI đọc + đối chiếu chéo → cấu hình Skill → gợi ý HS + dựng tờ khai IDA/EDA + phê duyệt → truyền FPT.VNACCS (adapter giả cho dev) → tổng quan & mức dùng. Mỗi màn hình giữ nguyên, chỉ thay thân `src/api/*.ts`.

**Architecture:** Giữ mẫu giai đoạn 1: module 3 tầng trong `packages/core`, use case `(deps, ctx, input) → Result`, mỗi module một **Unit of Work** bọc `withCtx` (RLS), test use case bằng UoW in-memory *mô phỏng policy thật*, test luồng `*.int.test.ts` trên Postgres Testcontainers. Việc chạy dài (AI, HS, FPT) đi qua BullMQ: web chỉ ghi DB + đẩy job, worker gọi use case, tiến trình đẩy qua Redis pub/sub → SSE. AI chỉ ở `extraction` (đọc) và port `HsClassifier` (gợi ý); đối chiếu, ánh xạ, thuế, chặn truyền là code thuần có test (ADR 0002).

**Tech Stack:** như GĐ 0–1 + `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (MinIO/R2), `pdf-lib` (đếm trang, tách trang), `@anthropic-ai/sdk` (Claude, PDF document block, structured output qua tool JSON schema từ Zod 4 `z.toJSONSchema`), `decimal.js`, `fast-xml-parser` (HĐĐT XML), BullMQ 6.

**Spec:** `docs/superpowers/specs/2026-10-13-backend-design.md` §3.3 hàng đợi, §3.4 file, §4.2–4.8 module, §5 API. Nguồn nghiệp vụ: `docs/PRODUCT.md` §4, §7; `business/13-API-FPT-dac-ta/*` (object VN_IDA/VN_EDA/HANG/VANDON/KTG/CON, `format.json`); `business/03_CHITIEU_KHAIBAO/*` (Phụ lục II TT38/39/121: chỉ tiêu 1.x/2.x; CV 2061, 3513, 4613, 6376). Việc chưa rõ: `docs/BACKEND-TODO.md`.

## Global Constraints

- Như GĐ 0–1. Thêm: mọi lời gọi AI/HS/FPT ghi `usage_events` (B8); job idempotent theo khóa ghi trong bảng (B9); `PROMPT_VERSION`, `EXTRACTION_SCHEMA_VERSION`, `PIPELINE_VERSION` là hằng có phiên bản (B10).
- Tiền/trị giá: `numeric(24,6)` + `Decimal`; không `number` trong valuation/tax. Số lượng dòng hàng cũng `Decimal`.
- Chứng từ lưu `orgs/{orgId}/dossiers/{dossierId}/{documentId}/{sha256}.{ext}`; giới hạn theo gói: trang/hồ sơ (`plans.pages_per_dossier`), 25 MB/file, 60 trang/file.
- Dữ liệu từ AI parse Zod trước khi dùng; model không được tính tổng/thuế (chỉ chép số).
- Không truyền khi còn BLOCKER FAIL, HS chưa xác nhận, chưa APPROVED (B7) – guard trong `declaration` + test.
- FE: giữ nguyên màn hình; mọi thay đổi FE chỉ trong `src/api/*.ts`, `src/api/http/*.ts`, và tối đa vài dòng ở feature khi mock khác bản thật (ghi rõ trong task).

## Review Focus (toàn plan)

1. Upload file PDF có mật khẩu / không phải PDF / vượt số trang gói → chứng từ `ERROR` kèm lý do tiếng Việt, không retry, hồ sơ không kẹt `PROCESSING` → Task 2.4.
2. Worker chạy lại cùng job (retry sau crash) không tạo trùng `extractions`, `extracted_fields`, `line_items` → Task 2.5.
3. Người dùng sửa trường rồi AI đọc lại (đổi loại chứng từ / retry) → giá trị `USER_CONFIRMED` được giữ, có `field_audit` → Task 2.6.
4. Hồ sơ của org A không thể được org B đọc/upload/duyệt/truyền qua bất kỳ route nào (RLS + test org khác cho mọi use case) → mọi task.
5. Truyền tờ khai bị gọi 2 lần (double click / retry mạng) → chỉ một outbox, lần hai `ALREADY_SUBMITTED` → Task 5.4.

---

## Bản đồ module và bảng (toàn plan)

```
packages/contracts/src/
  dto/*                      (đã có)  + api/{dossier,ocr,skill,declaration,customs}.ts (input/output route)
  extraction/{invoice,packing-list,bill-of-lading,air-waybill,cert-of-origin,sales-contract,arrival-notice,freight-invoice,classify}.ts
  shipment.ts                Shipment (dữ liệu gộp + sources)   – dùng bởi extraction, validation, declaration
  declaration/{catalog-ida,catalog-eda,payload}.ts   catalog chỉ tiêu + DeclarationPayload (chỉ tiêu → giá trị)
  fpt/{ida,eda,common}.ts    Zod của objVN_IDA/VN_IDA_HANG/VANDON/KTG, objVN_EDA/HANG/CON, mã lỗi FPT
packages/core/src/
  db/schema/{dossier,extraction,validation,skill,declaration,integration,billing}.ts   (+ migration 0002…0006)
  modules/dossier      hồ sơ, chứng từ, tiến trình, SSE publisher
  modules/extraction   pipeline đọc: phân loại → trích xuất → chuẩn hóa → gộp → chiếu trường → audit
  modules/validation   luật đối chiếu (thuần)
  modules/skill        cấu hình skill, mẫu, đánh giá
  modules/declaration  HS, catalog chỉ tiêu, ánh xạ, trị giá/thuế, tờ khai, agent run, guard
  modules/integration  + CustomsGateway (fake/FPT), HsClassifier (fake/hscodepro), ExchangeRates, outbox, nhật ký
  modules/billing      usage_events, quota
apps/worker/src/jobs/{extract-document,run-agent,customs-send,customs-poll,skill-evaluate}.ts
apps/web/src/app/api/{dossiers,documents,fields,line-items,hs-catalog,skills,customs,dashboard}/**
apps/web/src/api/http/{dossiers,ocr,declaration,customs,skills}.ts (+ selector pick trong src/api/*.ts)
evals/golden/<lot>/{*.pdf, expected.json}; packages/core/src/modules/extraction/eval/*
```

Thứ tự thực thi: **GĐ 2 → 3 → 4 → 5 → 6**. GĐ 3 (skill) nhỏ, có thể làm song song với GĐ 4 bằng subagent vì không chung bảng.

---

# Giai đoạn 2 – Hồ sơ, upload, AI đọc, đối chiếu chéo

**Kết quả thấy được:** màn Hồ sơ, Tạo hồ sơ, Upload, OCR & kiểm tra chạy thật: upload PDF → worker đọc (Claude hoặc fake) → trường + vị trí + trạng thái ADR 0003 → luật đối chiếu → sửa/xác nhận trường có `field_audit` → "Xác nhận dữ liệu".

## Task 2.1: Contract – schema trích xuất, Shipment, API dossier/ocr

**Files:** `packages/contracts/src/extraction/*.ts`, `shipment.ts`, `api/dossier.ts`, `api/ocr.ts` (+ test)

**Interfaces (Produces):**
```ts
// extraction/<type>.ts – schema model trả về; mọi trường required + nullable; .describe() nhãn thường gặp
PartySchema { name: string|null; address: string|null; taxCode: string|null; country: string|null }
MoneySchema { amount: number|null; currency: string|null }          // number đã quy đổi locale; chuyển Decimal khi chuẩn hóa
InvoiceExtractionSchema { invoiceNo, invoiceDate (YYYY-MM-DD), seller: Party, buyer: Party, incoterm, currency, totalAmount, paymentTerms, poNo,
                          items: { lineNo, description, hsCodeOnInvoice, quantity, unit, unitPrice, amount, origin }[], grossWeightKg, packages, uncertainties: string[] }
PackingListExtractionSchema { invoiceNo, date, packages, packageUnit, grossWeightKg, netWeightKg, volumeCbm, items[], marks, uncertainties }
BillOfLadingExtractionSchema { billNo, masterBillNo, date, shipper, consignee, notifyParty, vessel, voyage, portOfLoading, portOfDischarge, placeOfDelivery,
                               containers: { no, sealNo, size }[], packages, grossWeightKg, freightTerm ("PREPAID"|"COLLECT"|null), uncertainties }
AirWaybillExtractionSchema { awbNo, hawbNo, date, shipper, consignee, flight, airportOfDeparture, airportOfDestination, pieces, grossWeightKg, chargeableWeightKg, uncertainties }
CertOfOriginExtractionSchema { form ("AK"|"D"|"E"|"VK"|"EVFTA_REX"|"OTHER"), coNo, issueDate, exporter, consignee, invoiceNo, invoiceDate, originCountry, items: { description, hs6, criterion }[], rexNo, uncertainties }
SalesContractExtractionSchema { contractNo, date, seller, buyer, incoterm, currency, totalAmount, paymentTerms, uncertainties }
ArrivalNoticeExtractionSchema { billNo, vessel, eta, portOfDischarge, finalDestination, charges: { label, amount, currency }[], uncertainties }
FreightInvoiceExtractionSchema { invoiceNo, date, issuer: Party, taxCode, totalAmount, currency, vatAmount, services: { label, amount }[], uncertainties }
ClassifyResultSchema { documents: { kind: DocKind; pages: number[]; isDuplicateCopy: boolean; supplierHint: string|null }[] }
EXTRACTION_SCHEMA_VERSION = 1; extractionSchemaFor(kind: DocKind): ZodType
// shipment.ts – dữ liệu gộp, mỗi giá trị kèm nguồn
Sourced<T> { value: T; sources: { documentId; kind: DocKind; page: number; region?: Region; raw: string }[]; status: FieldStatus; note?: string }
ShipmentSchema { version: number; parties: { seller: Sourced<Party>; buyer: Sourced<Party> }; invoice: { no, date, incoterm, currency, totalAmount: Sourced<DecimalString>, paymentTerms, poNo };
                 transport: { mode, billNo, masterBillNo, vessel, voyage, portOfLoading, portOfDischarge, finalDestination, arrivalDate, packages, packageUnit, grossWeightKg, netWeightKg, containers[] };
                 origin: { country, coForm, coNo, rexNo, coInvoiceNo }; charges: { freight, insurance, other[] } (từ hóa đơn cước / Arrival Notice);
                 items: { lineNo, description, quantity, unit, unitPrice, amount, origin, hsOnInvoice }[]; documents: { id, kind, pages }[] }
// api/dossier.ts
CreateDossierInputSchema { direction, typeCode (regex ^[A-Z][0-9]{2}$), partner (trim, upper), customsOffice, skillSetId, dueDate: IsoDate, incoterm, transportMode, note? }
DossierFilterSchema { direction?, status?, step? }   // query string
UpdateDossierInputSchema { note?, step? }
// api/ocr.ts
ChangeDocumentKindInputSchema { kind: DocKind }; UpdateFieldValueInputSchema { value: string }
```
- [ ] Test: mỗi schema parse một mẫu hợp lệ; `InvoiceExtractionSchema` từ chối `items[].quantity` kiểu string; `ClassifyResultSchema` từ chối page 0; `CreateDossierInputSchema` upper partner.

## Task 2.2: Schema DB dossier/extraction/validation/billing + migration 0002

**Bảng (org_id + RLS org chuẩn `orgRls`):**
- `dossiers` (id, org_id, code unique(org,code), direction, type_code, partner, customs_office_code, customs_office_name, skill_set_id, status, step, due_date date, owner_id, note, invoice_value numeric, currency, incoterm, transport_mode, bill_no, suspect_fields int, declaration_no, channel, timestamps). Index `(org_id, status)`, `(org_id, updated_at desc)`.
- `documents` (id, org_id, dossier_id, kind, kind_source "AI"|"USER"|"FILENAME", file_name, mime, size_bytes, pages int, status, error, storage_key, sha256, uploaded_by, timestamps). Index `(org_id, dossier_id)`.
- `document_pages` (id, org_id, document_id, page_no, kind_detected, is_duplicate bool, preview_key).
- `extractions` (id, org_id, document_id, kind, skill_version_id, prompt_version, schema_version, pipeline_version, model, raw jsonb, status, error, usage_event_id, created_at; unique `(document_id, sha256_hash_of(kind+prompt+schema+pipeline))` = cột `idempotency_key` unique).
- `shipments` (id, org_id, dossier_id, version int, data jsonb, schema_version, created_at; unique (dossier_id, version)).
- `extracted_fields` (id, org_id, dossier_id, document_id, group, key, label, value, original_value, status, region jsonb, note, confirmed_by, confirmed_at, timestamps; unique (document_id, key)).
- `field_audit` (id, org_id, dossier_id, field_id, document_id, key, old_value, new_value, user_id, source "USER_EDIT"|"USER_CONFIRM"|"USER_REVERT"|"HS_CONFIRM", at) – policy chỉ `insert`+`select`, **không** update/delete.
- `validations` (id, org_id, dossier_id, shipment_version, rule_code, title, detail, result, severity, document_kinds text[], fields text[], created_at; unique (dossier_id, shipment_version, rule_code)).
- `job_progress` (id, org_id, dossier_id, job_kind, job_id, status, progress int, message, updated_at).
- `usage_events` (id, org_id, dossier_id, document_id, kind, provider, model, input_tokens, output_tokens, cost_usd numeric, cost_vnd numeric, meta jsonb, at). Index `(org_id, at)`.
- [ ] Test int RLS: org B không thấy dossiers/documents/fields của A; `field_audit` UPDATE bị từ chối ngay cả đúng org.

## Task 2.3: Module dossier – use case hồ sơ, chứng từ, upload, tiến trình

**Ports:** `DossierUow` (repos: dossiers, documents, pages, progress), `ObjectStorage { put(key, body, mime), getStream(key), presignGet(key, ttlSec), delete(key) }`, `JobQueue`, `ProgressPublisher { publish(orgId, dossierId, event) }`, `QuotaChecker` (từ billing index), `PdfInspector { pageCount(buf): Promise<number>; isEncrypted(buf) }`, `Clock`, `IdGen`.

**Use case (chữ ký khớp `src/mocks/api/dossiers.ts`, `ocr.ts`):**
```ts
listDossiers(deps, ctx, filter) → Dossier[]            // sắp xếp updated_at desc
getDossier(deps, ctx, id) → Dossier                    // NOT_FOUND
createDossier(deps, ctx, input) → Dossier              // DECLARANT+; code = HS-{NK|XK}-{YYMM}-{NNN} (NNN theo org, đếm trong tháng); quota DOSSIER (QUOTA_EXCEEDED); status DRAFT, step upload, ownerId = ctx.userId
updateDossier(deps, ctx, id, patch {note?, step?}) → Dossier   // step chỉ lùi/tiến theo thứ tự hợp lệ; DOSSIER_LOCKED khi SUBMITTED/CLEARED
cancelDossier(deps, ctx, id) → Dossier                 // không hủy khi SUBMITTED/CLEARED
listDocuments(deps, ctx, dossierId) → DossierDocument[]
uploadDocuments(deps, ctx, dossierId, files: { name; mime; bytes: Buffer }[]) → DossierDocument[]
   // DECLARANT+; DOSSIER_LOCKED; mỗi file: mime ∈ pdf/png/jpg/zip; zip → bung (giới hạn 20 entry); sha256; pdf: isEncrypted → FILE_INVALID "PDF có mật khẩu";
   // pageCount > 60 → FILE_TOO_LARGE; quota PAGES (tổng trang hồ sơ ≤ plan.pagesPerDossier) → QUOTA_EXCEEDED; put storage; insert documents (status QUEUED, kind từ tên file như mock classifyByFileName, kind_source FILENAME);
   // dossier.status DRAFT→PROCESSING; enqueue extract-document (jobId = `extract:${documentId}:${sha256}`)
changeDocumentKind(deps, ctx, documentId, kind) → DossierDocument   // kind_source USER; xóa fields của doc; status QUEUED; enqueue lại (jobId có hậu tố kind)
deleteDocument(deps, ctx, documentId) → void           // xóa storage + fields; enqueue "re-merge" (job extract-document với mode "MERGE_ONLY")
retryDocument(deps, ctx, documentId) → void            // chỉ khi ERROR; QUEUED; enqueue
getDocumentFileUrl(deps, ctx, documentId) → { url: string; expiresAt }   // presign 10 phút
reportProgress(deps, orgId, dossierId, p: { jobKind; jobId; status; progress; message }) → void   // worker gọi; ghi job_progress + publish
markDocumentStatus(deps, orgId, documentId, status, error?) → void   // worker gọi
```
- [ ] Test use case (UoW in-memory mô phỏng RLS): tạo hồ sơ sinh mã đúng định dạng và tăng dần; hết quota → QUOTA_EXCEEDED; upload PDF mật khẩu → FILE_INVALID + document ERROR; zip bung 3 file; quota trang; org B không thấy/sửa được; step hợp lệ.
- [ ] Infra: `DrizzleDossierUow`, `S3ObjectStorage` (+ int test với MinIO compose nếu `S3_ENDPOINT` có, else skip), `PdfLibInspector` (test với PDF mẫu trong `evals/fixtures/`), `RedisProgressPublisher`.

## Task 2.4: Route handler dossier/document + upload multipart + SSE

**Routes:** `GET/POST dossiers`, `GET/PATCH dossiers/:id`, `POST dossiers/:id/cancel`, `GET dossiers/:id/documents`, `POST dossiers/:id/documents` (multipart `files[]`, đọc `req.formData()`; giới hạn 25 MB/file), `PATCH documents/:id/kind`, `DELETE documents/:id`, `POST documents/:id/retry`, `GET documents/:id/file` (302 → presigned), `GET dossiers/:id/events` (SSE: subscribe Redis channel `org:{orgId}:dossier:{id}`; heartbeat 20s; đóng khi client ngắt).
- [ ] Test route: upload không phải PDF → 400 `FILE_INVALID`; SSE trả `content-type: text/event-stream` và sự kiện đầu `ready`.
- [ ] Container: `dossier: createDossierInfrastructure({ db, redis, env, queue, storage })`.

## Task 2.5: Module extraction – pipeline đọc + AiProvider (Claude, Fake)

**Domain (thuần, test unit):** `normalize.ts` (số locale EU/US/VN → Decimal string; ngày nhiều định dạng → YYYY-MM-DD; mã nước; đơn vị `PCE/SET/KGM/CTN/PK…`; tên công ty chuẩn hóa), `merge.ts` (`FileExtraction[] → Shipment` theo ưu tiên nguồn: invoice cho thương mại, B/L cho vận tải, PL cho trọng lượng/kiện, C/O cho xuất xứ; ghi `sources`), `field-status.ts` (ADR 0003 + ngưỡng org: STRICT đánh dấu SINGLE_SOURCE), `project-fields.ts` (Shipment → `extracted_fields` theo nhóm GENERAL/PARTIES/COMMERCIAL/TRANSPORT/ITEMS; key như mock: `invoice_no, invoice_date, po_no, seller_name, seller_address, buyer_name, buyer_tax_code, incoterm, currency, total_amount, vessel, port_loading, port_discharge, bill_no, packages, gross_weight, item.N.description/quantity/amount…`; region từ model nếu có, else bbox gần đúng theo trang), `dedupe.ts` (bỏ trang Duplicate/Triplicate, trang điều khoản), `einvoice-xml.ts` (HĐĐT XML → FreightInvoice, không AI).

**Ports:** `AiProvider { classifyPages(file: { bytes; mime; pages }, hints): Promise<{ result: ClassifyResult; usage }>; extract<T>(file, pages, schema: ZodType<T>, prompt: { system; skillHints; examples }): Promise<{ result: T; regions?: Record<string, Region>; usage }> }`, `ExtractionUow` (extractions, shipments, fields, audit, validations – validation ghi qua index của validation module), `UsageRecorder` (billing index), `SkillResolver` (skill index: `resolve(orgId, kind, supplierHint) → { skillVersionId; fields; aliases; examples }`).

**Use case `processDocument(deps, { orgId, dossierId, documentId, mode: "FULL"|"MERGE_ONLY" })`** (worker):
1. Tải file; `kind_source === USER` → bỏ phân loại; else `classifyPages` (1 call) → nếu nhiều chứng từ trong 1 file → tách `document_pages`, tạo thêm `documents` con (kind AI).
2. Idempotency: `extractions.idempotency_key = sha256(documentId|kind|PROMPT_VERSION|EXTRACTION_SCHEMA_VERSION|PIPELINE_VERSION|skillVersionId)`; đã có `status=DONE` → bỏ qua gọi AI.
3. Gọi `extract` theo schema loại (HĐĐT XML → parser); parse Zod; ghi `extractions` + `usage_events`.
4. `merge` toàn bộ extraction DONE của hồ sơ → `shipments` version mới; `project-fields` **giữ** trường `USER_CONFIRMED` cũ (theo `(document_id, key)`), còn lại ghi đè; `validation.runRules`; cập nhật `dossiers.suspect_fields`, `status` (`PROCESSING` → `NEEDS_REVIEW` khi mọi document DONE/ERROR); `reportProgress` từng bước; lỗi dữ liệu → `markDocumentStatus(ERROR, lý do)` không throw; lỗi 429/5xx → throw (retry).

**Use case màn OCR:** `listFields`, `listChecks` (từ validation index), `updateFieldValue` (field_audit USER_EDIT; status USER_CONFIRMED; cập nhật `shipments.data` tại path tương ứng; chạy lại luật; suspect_fields), `confirmField`, `revertField` (về original_value, status MODEL_UNSURE), `finishReading` (NOT_READY nếu còn QUEUED/READING; sinh `line_items` từ shipment.items nếu chưa có → declaration index `seedLineItems`; step ocr, status NEEDS_REVIEW).

**Adapter:** `ClaudeAiProvider` (`@anthropic-ai/sdk`, model từ env, PDF/ảnh base64 document block, `tools:[{input_schema: z.toJSONSchema(schema)}]` + `tool_choice`, system prompt tiếng Việt+Anh: "chép số, không tính; ghi uncertainties"; `PROMPT_VERSION=1`; trả usage tokens; giá theo `pricing.ts`), `FakeAiProvider` (đọc fixture `evals/fixtures/<sha256>.json` nếu có; else sinh dữ liệu từ tên file giống mock `generateFieldsForDocument`), `RecordingAiProvider` (ghi fixture khi `--live`).
- [ ] Test domain: normalize (≥ 15 ca: "1.234,56" EU, "1,234.56" US, "12/10/2026" vs "10/12/2026" theo locale chứng từ, mã nước "KOREA"→KR), merge (2 invoice + 1 B/L → ưu tiên, CONFLICT trọng lượng), field-status theo ngưỡng, project-fields key ổn định, dedupe.
- [ ] Test use case với `FakeAiProvider` + UoW in-memory: chạy 2 lần không trùng; USER_CONFIRMED giữ; ERROR không retry; usage_events ghi; org khác không thấy.
- [ ] Int test: pipeline trên Postgres + MinIO (skip nếu không có S3) với PDF mẫu `evals/golden/hansol-2610/INVOICE.pdf` (tạo bằng pdf-lib trong test nếu chưa có file thật).
- [ ] Worker job `extract-document` + concurrency theo org (BullMQ `limiter` theo `groupKey = orgId` – nếu bản 6 không có group, worker tự đếm `org:{id}:running` trong Redis, tối đa 2).

## Task 2.6: Module validation – bộ luật ban đầu

`Rule { code; title; severity; docKinds; run(shipment, ctx: { org: { taxCode; name } }) → RuleOutcome }` với helper `pass/warn/fail/skipped`, `near(a, b, {abs, rel})`, `nameSimilarity`. Luật và mức theo spec §4.4: `R-AMOUNT-SUM` (BLOCKER), `R-WEIGHT-PL-BL` (BLOCKER), `R-QTY-PL-INV` (BLOCKER), `R-INVOICE-REF` (WARNING), `R-INCOTERM-FREIGHT` (BLOCKER), `R-ORIGIN-CO` (WARNING), `R-BUYER-MST` (INFO), `R-POD-TRANSSHIP` (WARNING), `R-HS-6` (INFO), `R-DATE-ORDER` (WARNING), `R-LAW-MO-CU` (BLOCKER, chương 84/85 cần "MO"/"CU" – kiểm ở GĐ 4 khi có chỉ tiêu; GĐ 2 trả SKIPPED), `R-SHARED-CONTAINER` (WARNING), `R-WAREHOUSE-CODE` (WARNING). `runRules(deps, orgId, dossierId, shipment, version)` ghi `validations`; `listChecks(deps, ctx, dossierId) → CrossCheck[]` (DTO như mock: ruleCode, title, detail, result, severity, documentKinds).
- [ ] Test: mỗi luật ≥ 4 ca (PASS, FAIL/WARN, SKIPPED, biên) với shipment mẫu `test/shipments/hansol.ts` (từ seed OCR dos_021: PL 3.860,50 vs B/L, MST 9 số, buyer EN).

## Task 2.7: FE nối API thật – dossiers, ocr; SSE hook; kiểm tra trình duyệt

- `api/http/dossiers.ts`, `api/http/ocr.ts` (upload bằng `apiUpload` + `FormData`; `listDossierDocuments` = `GET dossiers/:id/documents`), selector `pick`. Thêm hook `features/dossier-detail/hooks/use-dossier-events.ts` (EventSource → `invalidateQueries` cho documents/fields/checks/dossier; chỉ khi `dataSource()==="http"`); màn upload/ocr gọi hook (≤ 5 dòng mỗi màn).
- Mock `uploadDocuments(dossierId, files: {name,size}[])` ↔ http nhận `File[]`: chuẩn hóa chữ ký chung `files: File[]` (mock lấy `name/size` từ File) – sửa `upload-step.tsx` truyền `File[]` (hiện truyền gì? đọc khi làm).
- [ ] Kiểm tra: build `http`, đăng nhập, tạo hồ sơ, upload 3 PDF (fixture), thấy trạng thái chuyển QUEUED→READING→DONE qua SSE, trường hiện ra, sửa 1 trường → audit, bấm "Xác nhận dữ liệu". Chụp sáng/tối desktop+mobile màn OCR.
- [ ] `docs/BACKEND-TODO.md`: ghi gì còn giả (AI fake khi không có key; region bbox gần đúng).

---

# Giai đoạn 3 – Skill AI

**Kết quả:** màn Cấu hình Skill AI chạy thật; skill mẫu hệ thống được sao chép cho org mới; pipeline đọc dùng trường/alias của skill; "Đánh giá lại" chạy job.

## Task 3.1: Schema + migration 0003
`skills` (id, org_id, code unique(org), name, kind, doc_kind, supplier, language, enabled, is_template, template_id, current_version, labeled_samples int, accuracy numeric null, timestamps), `skill_versions` (id, org_id, skill_id, version, fields jsonb (SkillField[]), prompt_notes, created_by, created_at), `skill_samples` (id, org_id, skill_id, document_id null, storage_key, file_name, pages, size_bytes, status PENDING|LABELED, expected jsonb null, labeled_by, labeled_at), `skill_evaluations` (id, org_id, skill_id, version, accuracy numeric, per_field jsonb, samples int, previous_accuracy, finished_at). Org hệ thống `org_system` giữ template (seed từ `apps/web/src/mocks/seed/skills.ts`: SK-INV-GEN, SK-PL-GEN, SK-BL-GEN, SK-AWB-GEN, SK-CO-GEN, SK-SC-GEN, SK-AN-GEN, SK-FRT-GEN, SK-MAP-IDA, SK-MAP-EDA + supplier mẫu).

## Task 3.2: Use case + route + FE
`listSkills(kind?)`, `getSkill(id)`, `setSkillEnabled`, `updateSkillField/addSkillField/removeSkillField` (tạo version mới; FORBIDDEN tắt extract trường required; DUPLICATE key; regex key), `listSamples`, `uploadSamples(files)` (PENDING; storage `orgs/{org}/skills/{id}/samples/`), `labelSample(sampleId, expected)` / `confirmPendingSamples` (đánh LABELED, `labeled_samples++`), `evaluateSkill` (job `skill-evaluate`: với mỗi sample LABELED chạy `AiProvider.extract` → so `expected` bằng `accuracy.ts` → `skill_evaluations`; `MIN_SAMPLES_FOR_ACCURACY=5`), `getEvaluation`, `cloneTemplatesForOrg(orgId)` (gọi từ identity.register qua index), `resolveSkill(orgId, kind, supplierHint)` (ưu tiên SUPPLIER skill khớp alias nhà cung cấp, else DOCUMENT skill, chỉ enabled).
Routes §5 spec; `api/http/skills.ts` (chữ ký như mock gồm `LabeledSample`, `EvaluationResult`); mock `uploadSamples(files:{name,size})` ↔ http `File[]` (như 2.7).
- [ ] Test: version tăng khi sửa trường; tắt extract trường required → FORBIDDEN; clone template tạo đủ skill cho org mới; evaluate với FakeAiProvider trả accuracy theo expected; org khác không thấy.

---

# Giai đoạn 4 – HS, ánh xạ chỉ tiêu, tờ khai IDA/EDA, phê duyệt

**Kết quả:** màn AI Agent và Review tờ khai chạy thật: agent run (HS → ánh xạ → dựng tờ khai → số hóa) với tiến trình thật; xác nhận HS; tờ khai theo chỉ tiêu Phụ lục II; thuế dự kiến; phê duyệt (APPROVER).

## Task 4.1: Catalog chỉ tiêu (dữ liệu) – từ Phụ lục II TT38/39 + TT121/2025
`packages/contracts/src/declaration/catalog-ida.ts` (Mẫu 01: 1.1–1.96) và `catalog-eda.ts` (Mẫu 02: 2.1–2.80): `DeclarationFieldDef { no; form: "01"|"02"; section: "GENERAL"|"PARTIES"|"TRANSPORT"|"VALUE"|"ITEMS"|"TAX"; label; type: "text"|"code"|"date"|"decimal"|"int"; maxLen?; required: "M"|"C"|"O"|"F"; codeTable?: "A014"|"A038"|"A016"|"A202"|"A501"|"A519"|"A520"|"A527"|"A528"|"A546"|"A601"|"A620"|"CURRENCY"|"COUNTRY"|"UNIT"|"PAYMENT"|"INCOTERM"|"TRANSPORT_MODE"|"INVOICE_KIND"|"PRICE_KIND"|"LAW_CODE"; fptField?: string (VN_IDA.TK_xxx | VN_IDA_VANDON.VD_xxx | VN_IDA_KTG.KTG_xxx | VN_IDA_HANG.HAG_xxx); manual?: boolean; legalNote?: string }`. **Cách làm:** dựng bằng subagent từ text đã chuyển (`textutil`) của Phụ lục II và sheet `VN_IDA`/`VN_EDA` của FPT; đối chiếu mã FPT theo tên chỉ tiêu; mục nào không khớp chắc chắn → `fptField` để trống + ghi `legalNote: "cần đối chiếu"`. Thêm `catalogs/` mã: phương thức vận chuyển (1–6,9), phân loại hóa đơn (A/B/D), giá hóa đơn (A–D), phương thức thanh toán (TK_IVP: BIENMAU, DA, CAD, …), điều kiện giao hàng (Incoterm 2020), đơn vị tính thường gặp (PCE, SET, KGM, CTN, PK, MTR, LTR…), nước ISO-2, cơ quan hải quan (A038 – seed ~20 chi cục hay gặp, flag thiếu), tiền tệ.
- [ ] Test: catalog IDA có ≥ 90 phần tử, không trùng `no`; mọi `codeTable` tồn tại; `fptField` (nếu có) thuộc danh sách tên cột trong `fpt/ida.ts`.

## Task 4.2: Schema + migration 0004
`line_items` (id, org_id, dossier_id, line_no, description, quantity numeric, unit, unit_price numeric, amount numeric, origin, invoice_hs_code, hs_suggested, hs_confidence real, hs_confirmed, hs_confirmed_by, hs_confirmed_at, import_duty_rate numeric, vat_rate numeric, policy_note, timestamps; unique (dossier_id, line_no)), `hs_suggestions` (id, org_id, line_item_id, code, description, confidence, rates jsonb, source, created_at), `declarations` (id, org_id, dossier_id, kind IDA|EDA, version, status NOT_CREATED|DRAFT|APPROVED|SUBMITTED, fields jsonb (`Record<no, { value; source: ValueSource; suspect?; note? }>`), exchange_rate numeric, exchange_rate_date date, customs_value_vnd numeric, value_adjustments jsonb, est_import_duty_vnd numeric, est_vat_vnd numeric, approved_by, approved_at, timestamps; unique (dossier_id, version)), `agent_runs` (id, org_id, dossier_id, mode, status, tasks jsonb, log jsonb, started_at, finished_at), `catalog_hs` (không org: code, description, mfn numeric, pref jsonb, vat numeric, policy; seed từ `HS_CATALOG` mock – **D1 BACKEND-TODO**), `exchange_rates` (không org: currency, date, rate numeric, source; seed USD/EUR/JPY/CNY/KRW 1 dòng mỗi ngày gần nhất – **D2**).

## Task 4.3: Domain declaration – HS, ánh xạ, trị giá, thuế, guard
- `mapping/ida/*.ts`, `mapping/eda/*.ts`: `FieldMapping[]` theo skill `mapping-declaration-fields`: `{ no, source, from(ctx: { shipment; dossier; org; items; now }), transform?, required, validate? }`. Phạm vi IDA tối thiểu (từ chứng từ/hồ sơ/tài khoản): 1.4 mã loại hình (dossier.typeCode), 1.6 phương thức vận chuyển (SEA container→2, SEA bulk→3, AIR→1, ROAD→4), 1.7 phân loại cá nhân/tổ chức = 4, 1.8 cơ quan HQ (dossier.customsOfficeCode), 1.11 ngày khai dự kiến (now), 1.12–1.16 người nhập khẩu (org MST/tên/địa chỉ/điện thoại – **không** lấy tên EN trên invoice, PRODUCT §7.4), 1.19–1.22 người xuất khẩu (seller), 1.26 số vận đơn (B/L hoặc AWB), 1.27–1.29 số kiện/đơn vị/trọng lượng (PL ưu tiên, B/L dự phòng), 1.30–1.34 địa điểm lưu kho (mã từ dossier – thiếu → manual), cảng dỡ (POD; nếu POD nước ngoài → finalDestination VN – PRODUCT §7.5), cảng xếp (POL), phương tiện, ngày hàng đến, 1.39–1.43 hóa đơn (A, số, ngày, phương thức thanh toán map TK_IVP, 1.44 điều kiện giá A), 1.45 mã phân loại khai trị giá (6 – trị giá giao dịch), 1.47–1.49 cước/bảo hiểm/khoản điều chỉnh (từ `shipment.charges` khi EXW/FCA/FAS/FOB; CIF → cước đã gồm), 1.52 người nộp thuế = 1, 1.68 ghi chú (số tờ khai chung container nếu có), 1.69 số quản lý nội bộ (dossier.code), 1.74–1.87 dòng hàng (HS 8 số xác nhận, mô tả, xuất xứ, số lượng/đơn vị, đơn giá, trị giá hóa đơn, trị giá tính thuế), 1.80 mã biểu thuế (B01 MFN / B03.. FTA khi có C/O hợp lệ), 1.82–1.84 văn bản pháp quy (MO/CU cho chương 84/85 theo CV 2061). EDA tương tự (2.x) với người xuất khẩu = org.
- `catalog-resolve.ts`: tên → mã (cảng, nước, đơn vị, phương thức thanh toán); thiếu mã → `suspect: true, note: "Không tìm thấy mã cho …"`.
- `valuation.ts` (Decimal): trị giá hóa đơn theo dòng; khoản điều chỉnh (AD: cước, bảo hiểm, phí khác; SB: giảm) phân bổ theo tỷ lệ trị giá dòng; trị giá tính thuế VND = (trị giá dòng + phân bổ) × tỷ giá; tổng.
- `tax.ts` (Decimal): thuế NK = trị giá tính thuế × thuế suất (MFN; FTA nếu `origin.coForm` khớp `pref` và C/O hợp lệ), VAT = (trị giá tính thuế + thuế NK) × VAT; làm tròn VND 0 chữ số (HALF_UP); tổng.
- `guards.ts`: `canMoveToReview` (HS đủ, có declaration), `canApprove` (HS đủ, không BLOCKER FAIL, role APPROVER/OWNER, 4 mắt nếu org bật), `canSubmit` (APPROVED, không BLOCKER, chưa SUBMITTED).
- `hs-rank.ts`: hợp nhất gợi ý classifier + HS 6 số trên invoice (chỉ tham khảo) → `hs_suggested`, `hs_confidence`.
- [ ] Test: mỗi mapping ≥ 1 test với shipment mẫu (từ seed dos_021/023/024: FCA+cước, FOB+Arrival Notice, CIF+EVFTA); valuation/tax so chuỗi (vd dos_021: 20.850 USD + 1.150 cước × 25.400 = … VND); guards; POD nước ngoài → điểm đến VN; MO/CU.

## Task 4.4: Use case declaration + worker `run-agent` + route + FE
`startAgentRun(dossierId, mode)` (NO_ITEMS nếu chưa có line_items; hủy run cũ; agent_runs RUNNING; enqueue `run-agent`), `runAgent` (worker: HS_LOOKUP – `HsClassifier.classify` mỗi dòng (cache `(org, descriptionNormalized)` trong Redis 7 ngày) → hs_suggestions + usage_events; MAPPING – dựng `fields` theo catalog; BUILD_DECLARATION – valuation/tax, exchange rate theo ngày, lưu `declarations` DRAFT; DIGITIZE – xuất JSON số hóa mỗi document vào storage `digitized/`; tiến trình + log qua `reportProgress`; lỗi 1 dòng HS không chặn toàn bộ), `getAgentRun → AgentRunView` (run, logs, finished, current – như mock), `listLineItems` (ẩn gợi ý tới khi HS_LOOKUP DONE), `listHsCatalog(q?)`, `confirmHs(itemId, code)` (INVALID_HS nếu không có trong catalog; cập nhật thuế suất; `field_audit` HS_CONFIRM; dựng lại declaration DRAFT), `unconfirmHs`, `getDeclarationView` (declaration + items + thuế từng dòng + `unconfirmedHs`), `updateDeclarationField(no, value)` (nguồn USER, audit), `approveDeclaration` (guard; status APPROVED; dossier APPROVED/step submit), `moveToReview`.
Routes §5 spec; `api/http/declaration.ts` (view types `AgentRunView`, `DeclarationView`, `DeclarationItemView` chuyển vào contracts `api/declaration.ts`).
- [ ] Test use case: run 2 lần không trùng suggestions; VIEWER approve → FORBIDDEN; approve khi BLOCKER FAIL → BLOCKER_FAILED; HS chưa xác nhận → HS_UNCONFIRMED; org khác → NOT_FOUND.
- [ ] Kiểm tra trình duyệt: chạy agent với fake HS → xác nhận HS → review tờ khai hiện chỉ tiêu + nguồn → phê duyệt bằng tài khoản APPROVER (tuan.pham). Chụp sáng/tối.

---

# Giai đoạn 5 – Truyền FPT.VNACCS (IDA/IDC/EDA/EDC/HYS/IEX)

**Kết quả:** màn Khai báo Hải quan chạy thật với `FakeCustomsGateway` (mô phỏng số tờ khai, phân luồng, thông quan); adapter FPT dựng đúng payload theo đặc tả, phần HTTP cô lập chờ endpoint (T1).

## Task 5.1: Contract FPT + schema + migration 0005
`packages/contracts/src/fpt/ida.ts`: Zod cho `objVN_IDA` (TK_xxx theo sheet VN_IDA v1.2: kiểu Text(n)/Decimal/Date dd/MM/yyyy/Long), `objVN_IDA_HANG[]`, `objVN_IDA_VANDON`, `objVN_IDA_KTG`; `eda.ts`: `objVN_EDA`, `objVN_EDA_HANG[]`, `objVN_EDA_CON`; `common.ts`: `FptEnvelope { MA_DV; TEN_DV; TK_MAHQ; USER_ID; … }`, `FptErrorItem { errorCode; indexCode; nameCode; errorContent; proposedSolution; rowPosition }`, trạng thái `VN_IDA_TRANGTHAI` (TK_LUONG 0–3, TK_TRANGTHAI T/A/C/TE/A01/E/R, TK_THONGQUAN 0/1). Bảng: `customs_outbox` (id, org_id, dossier_id, declaration_id, operation, idempotency_key unique, payload jsonb, status PENDING|SENT|FAILED, attempts, last_error, next_attempt_at, timestamps), `customs_messages` (append-only: id, org_id, dossier_id, operation, direction, result, summary, payload_masked jsonb, external_ref, at), `customs_results` (id, org_id, dossier_id unique, external_id, declaration_no, channel, channel_note, clearance_status, customs_tax_vnd, raw jsonb, updated_at), `org_secrets` dùng cho tài khoản VNACCS (kind `VNACCS`: `{USER_ID,PASSWORD,TERMINAL_ID,TERMINAL_ACCESS_KEY}`).
- [ ] Test: `objVN_IDA` parse được `business/format.json` (phần EDA) sau khi đổi key; từ chối `tK_GW` chuỗi; ngày sai định dạng.

## Task 5.2: Domain integration – payload builder + state machine + masking
`declaration-to-fpt.ts`: `DeclarationPayload` (chỉ tiêu → giá trị) → `objVN_IDA…` dùng `fptField` của catalog; cắt độ dài theo đặc tả (cảnh báo khi cắt), ngày → dd/MM/yyyy, số → number/decimal đúng kiểu, dòng hàng → HAG_B25 "01".."99"; EDA tương tự + container → `coN_C01..C50`. `state-machine.ts`: `DRAFT → APPROVED → PRE_DECLARED(IDA/EDA ok) → DECLARED(IDC/EDC ok) → DOCS_SENT(HYS) → CLEARED|INSPECTION|REJECTED`, lỗi gửi → `SEND_FAILED` giữ bước; `next(state, event)`. `mask.ts`: che PASSWORD, TERMINAL_ACCESS_KEY, MST giữa, số điện thoại.
- [ ] Test: payload dos_021 có `TK_IMC = MST org`, `VD_BL1 = HPSEL2610078`, `HAG_CMD` 8 số không dấu chấm, `KTG_FR3` cước, độ dài `TK_EPN ≤ 70`; state machine mọi cạnh hợp lệ/không hợp lệ; mask không để lộ PASSWORD.

## Task 5.3: Port + adapter
`CustomsGateway` (spec §4.7): `preDeclare`, `declare`, `attachDocuments`, `sendSupplementaryDoc`, `queryStatus`. `FptVnaccsGateway` (dựng payload + `FptHttpClient` interface `{ post(op, body) }` – hiện thực `FptHttpClientStub` ném `GATEWAY_ERROR "Chưa có endpoint FPT (BACKEND-TODO T1)"`; thật sẽ thay 1 file). `FakeCustomsGateway`: số tờ khai 12 số (`107…` nhập / `307…` xuất) theo hash, phân luồng theo hash (60/30/10), HYS thỉnh thoảng lỗi lần đầu (`hash%7==0`) để thử "Gửi lại", `queryStatus` tiến dần: WAITING → INSPECTING (luồng vàng/đỏ) → CLEARED sau N lần hỏi; thuế HQ tính = thuế dự kiến ± 0. `HsClassifier`: `FakeHsClassifier` (catalog_hs + so khớp từ khóa, confidence giả theo hash), `HscodeproClassifier` (HTTP theo `HSCODEPRO_URL`, body `{description, origin}` – **T2**). `ExchangeRateProvider`: `DbExchangeRates` + fallback `FakeExchangeRates` (25.400 USD).
- [ ] Test: Fake gateway deterministic theo id; adapter FPT gọi `FptHttpClient` với body đúng schema (mock client ghi lại).

## Task 5.4: Use case truyền + worker `customs-send`/`customs-poll` + route + FE
`submitDeclaration(dossierId, certificateId)` (guard `canSubmit`; `INTEGRATION_NOT_CONFIGURED` nếu gateway thật mà chưa có secret VNACCS; **transaction**: declarations SUBMITTED, dossier SUBMITTED, insert outbox IDA/EDA với `idempotency_key = ${dossierId}:${op}:${declarationVersion}` → trùng = `ALREADY_SUBMITTED`; enqueue), `customs-send` (đọc outbox PENDING theo id; ghi message OUT (masked); gọi gateway; ghi message IN; cập nhật `customs_results`; state machine; bước kế tiếp tự tạo outbox (IDA ok → IDC → HYS) ; lỗi tạm → attempts++ & throw; lỗi FPT có `errorList` → SEND_FAILED + message ERROR có nội dung + `proposedSolution`), `customs-poll` (job lặp 30s/dossier tới CLEARED/REJECTED; ghi IEX IN khi đổi trạng thái), `resendOperation(dossierId, op)` (luôn `queryStatus` trước → ghi IEX; nếu Hải quan đã ghi nhận → không gửi, trả thông báo; else outbox mới `…:retry${n}`), `getSubmission → SubmissionView` (declarationStatus, hsUnconfirmed, started, inProgress, pipeline[op,label,status,at,summary], messages, result – như mock), `listCustomsDeclarations → CustomsRow[]`, `listCertificates`.
Routes §5; `api/http/customs.ts`; view types vào contracts `api/customs.ts`.
- [ ] Test use case: submit 2 lần → ALREADY_SUBMITTED, 1 outbox; chưa APPROVED → NOT_APPROVED; BLOCKER FAIL → BLOCKER_FAILED; send job chạy 2 lần cùng outbox → 1 message OUT; resend khi đã ghi nhận → không gửi; org khác → NOT_FOUND. Int test luồng với FakeCustomsGateway trên Postgres: IDA→IDC→HYS→IEX → CLEARED, nhật ký đủ.
- [ ] Kiểm tra trình duyệt: truyền hồ sơ đã duyệt → pipeline chạy, nhật ký, phân luồng; "Gửi lại" HYS; màn Khai báo Hải quan liệt kê. Chụp sáng/tối.

---

# Giai đoạn 6 – Tổng quan, thông báo, mức dùng, eval

## Task 6.1: Billing usage thật + quota
`usage.thisMonth(orgId, now)` = count dossiers created_at trong tháng + sum pages + sum cost_vnd từ `usage_events`; `checkQuota` dùng số này; `recordUsage` được extraction/declaration/integration gọi qua index. Route `GET org/usage` đã có → số thật. Plan-tab hiển thị đúng.
## Task 6.2: Dashboard
`GET dashboard` → `{ kpi: { openNk, openXk, dueSoon, overdue, suspectRate, submittedThisMonth }, needAction: Dossier[] (sắp theo dueDate), recentResults: CustomsRow[] }`; dashboard-page.tsx hiện gọi `listDossiers` + `getSession` tự tính → giữ nguyên màn (không cần route mới ở GĐ này; route để Enterprise API) – quyết định khi làm.
## Task 6.3: Thông báo sự kiện
Tạo notification khi: đọc xong hồ sơ (cho owner), agent xong, tờ khai được duyệt (cho người tạo), có phân luồng/thông quan (cho owner + approver), chứng thư sắp hết hạn (job hằng ngày `cert-expiry`, thêm vào `QUEUE_NAMES`).
## Task 6.4: Eval harness
`evals/golden/<lot>/` + `packages/core/src/modules/extraction/eval/{run,diff}.ts`; script gốc `pnpm eval [--live] [--tag]`, `pnpm eval:diff before after`; offline dùng fixture do `RecordingAiProvider` ghi; CI chạy offline. Độ chính xác theo trường so `expected.json`.
## Task 6.5: Tài liệu + rà soát
Cập nhật `docs/ARCHITECTURE.md` (bảng thật, UoW, SSE), `docs/PRODUCT.md` §12 trả lời phần đã chốt, `README`, `BACKEND-TODO.md`; `pnpm typecheck && lint && test && eval` xanh; Playwright 3 luồng E2E trong `apps/web/e2e/` chạy với `AI_PROVIDER=fake`.

---

# Giai đoạn 7 (ngoài phạm vi plan này) – Back-office vận hành
Màn `/admin` (mock đã có: tổ chức, gói, mức dùng, tích hợp, skill mẫu, nhân sự, nhật ký, thông báo hệ thống) cần module `ops` với vai trò nhân sự nội bộ (`staff` tách khỏi `memberships`), route `/api/admin/**`, RLS bypass có kiểm soát (role `kb_ops`). Viết plan riêng sau khi GĐ 2–6 xong.

---

## Ước lượng và thứ tự

| GĐ | Khối lượng (task) | Phụ thuộc | Ghi chú |
|---|---|---|---|
| 2 | 7 task, lớn nhất (pipeline AI, SSE, upload) | GĐ 1 | Cần `ANTHROPIC_API_KEY` để thử AI thật; không có → fake |
| 3 | 2 task | 2.2 (storage), 2.5 (AiProvider) | Có thể song song với GĐ 4 |
| 4 | 4 task; 4.1 là dữ liệu từ văn bản (subagent) | GĐ 2 | Biểu thuế thật chưa có (D1) |
| 5 | 4 task | GĐ 4 | Endpoint FPT chưa có (T1) → fake |
| 6 | 5 task | GĐ 2–5 | |

## Self-review
- Spec §4.2–4.8 và §5: mọi nhóm route có task tương ứng (dossiers/documents/ocr → GĐ 2; skills → 3; agent/declaration/hs → 4; customs → 5; dashboard/usage/notifications → 6). `PUT org/integrations/:id/secret` (tài khoản VNACCS) → Task 5.4 (route + FE nhập tài khoản ở tab Kết nối hệ thống).
- Review Focus 1–5 đã gắn task. Mỗi task có test org khác.
- Chỗ chưa rõ: xem `docs/BACKEND-TODO.md` T1–T6, D1–D4, N1–N5.
