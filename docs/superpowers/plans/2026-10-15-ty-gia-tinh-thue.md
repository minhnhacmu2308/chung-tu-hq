# Tỷ giá tính thuế tự động theo tuần – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tối thứ Năm, tự chụp tỷ giá mua chuyển khoản của Vietcombank làm tỷ giá tính thuế cho tuần sau. Đội vận hành xem và sửa tay trong khu Quản trị. Tờ khai hiện nguồn tỷ giá, và bị chặn truyền khi tỷ giá đã sang tuần mới.

**Architecture:**
- Tỷ giá là dữ liệu nền tảng (không theo org). Đọc/ghi qua module `admin` (role `kb_platform`, ADR 0006 – được phép đọc/ghi xuyên module).
- Bảng `exchange_rates` mang nghĩa ngày bắt đầu hiệu lực (thứ Hai); hàm tra "gần nhất ≤ ngày khai" của module declaration giữ nguyên.
- Job worker `exchange-rate-weekly` chạy theo lịch, có cửa sổ thử lại.
- Màn Quản trị → "Tỷ giá tính thuế".

**Tech Stack:** TypeScript, Zod, Drizzle/Postgres, BullMQ (job scheduler), Next.js route handlers, React Query, `@kb/ui`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-ty-gia-tinh-thue-design.md`

## Global Constraints

- Tỷ giá = chuỗi thập phân (Decimal), không `number` khi lưu/tính (bất biến 3). XML Vietcombank `"26,123.45"` → `"26123.45"`.
- Ngày nghiệp vụ `YYYY-MM-DD` theo giờ VN (`Asia/Ho_Chi_Minh`); tuần = thứ Hai → Chủ nhật.
- Domain không gọi `Date.now()` (nhận `now` qua tham số).
- Dữ liệu ngoài (XML Vietcombank, form) parse/kiểm trước khi dùng (bất biến 9).
- Job tự động KHÔNG ghi đè bản ghi `source = MANUAL`.
- Màn Quản trị: thao tác ghi dùng `ReasonDialog` + `useAdminMutation`, quyền `PLATFORM`, có nhật ký (`audit`).
- Giao diện chỉ `@kb/ui`; kiểm trình duyệt sáng/tối, 1366/390.

## Review Focus

1. **Tối thứ Năm là ngày lễ / Vietcombank chưa cập nhật** → dùng đúng bảng hiện có (của ngày làm việc gần nhất), ghi `snapshot_at` theo giờ của bảng. Test ở Task 1 (parser giữ `boardAt`) + Task 3.
2. **Job chạy lại trong cùng tuần** (retry, khởi động lại worker) → không nhân đôi, không ghi đè `MANUAL`. Test ở Task 3.
3. **XML trả HTML/hỏng/thiếu USD** → coi là lỗi, không ghi một phần. Test ở Task 1 + Task 3.
4. **Tờ khai duyệt tuần này, truyền tuần sau** → chặn truyền với thông báo rõ. Ngày giáp ranh tính theo giờ VN (Chủ nhật 23:30 VN vẫn là tuần cũ). Test ở Task 4.
5. **Ngoại tệ không có trên bảng Vietcombank** (vd TWD) → không tự sinh; nhập tay được; thiếu thì giữ cảnh báo hiện có. Test ở Task 3 + Task 5.

---

### Task 1: Domain thuần – tuần tỷ giá + đọc XML Vietcombank

**Files:**
- Create: `packages/core/src/modules/admin/domain/exchange-rate.ts`, `packages/core/src/modules/admin/domain/__tests__/exchange-rate.test.ts`
- Create: `packages/core/src/modules/admin/domain/__fixtures__/vcb-2026-10-15.xml` (mẫu thật đã gọi 2026-10-15 – cắt gọn 6 dòng: AUD, CNY, DKK(Buy "-"), EUR, USD, KRW)
- Create: `packages/contracts/src/dto/exchange-rate.ts` (+ export)

**Interfaces – Produces:**

```ts
// admin/domain/exchange-rate.ts
export const vnDateOf: (d: Date) => string;                  // YYYY-MM-DD theo giờ VN
export function weekStart(isoDate: string): string;           // thứ Hai của tuần chứa ngày đó
export function nextMonday(now: Date): string;                // thứ Hai sau thời điểm now (giờ VN)
export function sameRateWeek(a: string, b: string): boolean;  // cùng tuần thứ Hai–Chủ nhật
export type VcbBoard = { boardAt: Date; rates: { currency: string; transfer: string }[] };
export function parseVcbXml(xml: string): VcbBoard;           // ném VcbParseError khi không phải ExrateList / thiếu USD / số sai
export class VcbParseError extends Error {}

// contracts/dto/exchange-rate.ts
export const ExchangeRateSourceSchema = z.enum(["VCB", "MANUAL", "SEED"]);
export const ExchangeRateSchema = z.object({ currency: z.string().length(3), effectiveFrom: IsoDateSchema, rate: DecimalStringSchema, source: ExchangeRateSourceSchema, snapshotAt: IsoDateTimeSchema.nullable(), updatedByName: z.string().nullable(), note: z.string().nullable() });
export const ExchangeRateFetchSchema = z.object({ id: z.string(), ranAt: IsoDateTimeSchema, effectiveFrom: IsoDateSchema, status: z.enum(["OK", "FAILED"]), count: z.number().int(), boardAt: IsoDateTimeSchema.nullable(), error: z.string().nullable() });
export const ExchangeRatesViewSchema = z.object({ weeks: z.array(z.object({ effectiveFrom: IsoDateSchema, rates: z.array(ExchangeRateSchema) })), lastFetch: ExchangeRateFetchSchema.nullable(), nextRunAt: IsoDateTimeSchema });
export const UpsertExchangeRateInputSchema = AdminReasonSchema.extend({ currency: z.string().regex(/^[A-Z]{3}$/), effectiveFrom: IsoDateSchema.refine(isMonday, "Ngày hiệu lực phải là thứ Hai"), rate: DecimalStringSchema.refine((v) => Number(v) > 0, "Tỷ giá > 0") });
```

- [ ] **Step 1: Write failing tests**:
  - `weekStart("2026-10-15")` (thứ Năm) → `"2026-10-12"`; `weekStart("2026-10-18")` (CN) → `"2026-10-12"`.
  - `nextMonday(new Date("2026-10-15T16:30:00Z"))` (23:30 VN thứ Năm) → `"2026-10-19"`.
  - `nextMonday(new Date("2026-10-18T17:30:00Z"))` (00:30 VN thứ Hai 19/10) → `"2026-10-26"`.
  - `sameRateWeek("2026-10-18","2026-10-19") === false`, `sameRateWeek("2026-10-13","2026-10-18") === true`.
  - `parseVcbXml(fixture)`:
    - `boardAt` = 2026-10-15 08:47:51 giờ VN;
    - USD transfer dạng chuỗi không dấu phẩy;
    - DKK (Buy "-") vẫn lấy Transfer;
    - dòng Transfer "-" bị bỏ.
  - HTML `<html>…` → `VcbParseError`; XML không có USD → `VcbParseError`; `Transfer="abc"` → `VcbParseError`.
  - `UpsertExchangeRateInputSchema` từ chối `effectiveFrom` không phải thứ Hai, `rate: "0"`, `currency: "usd"`.
- [ ] **Step 2: Run** `cd packages/core && npx vitest run src/modules/admin/domain/__tests__/exchange-rate.test.ts` → FAIL.
- [ ] **Step 3: Implement**. Parser dùng regex trên thuộc tính (`<Exrate CurrencyCode="…" … Transfer="…"/>`), không thêm thư viện XML. `DateTime` dạng `M/D/YYYY h:mm:ss AM` là giờ VN.
- [ ] **Step 4: Run** → PASS.

### Task 2: DB – cột nguồn cho `exchange_rates`, bảng `exchange_rate_fetches`; repo admin

**Files:**
- Modify: `packages/core/src/db/schema/declaration.ts` (exchange_rates: `snapshot_at timestamptz null`, `updated_by text null`, `note text null`; `source` giá trị `VCB|MANUAL|SEED`, mặc định `SEED` cho dữ liệu cũ)
- Create: bảng `exchange_rate_fetches` cùng file (id, ran_at, effective_from date, status, count int, board_at timestamptz null, error text null). Không theo org: `enableRLS()` + chỉ policy SELECT cho `kb_app` = false (app không cần đọc); `kb_platform` BYPASSRLS.
- Migration `packages/core/drizzle/0012_exchange_rate_source.sql` (+ journal). Cập nhật dữ liệu cũ: `UPDATE exchange_rates SET source='SEED' WHERE source='MANUAL' AND updated_by IS NULL`.
- Modify: `packages/core/src/modules/admin/application/ports.ts` (repo `exchangeRates`: `list(fromEffective)`, `upsertAuto(rows)` bỏ qua MANUAL, `upsertManual(row)`, `fetches.insert/latest`), `admin/infrastructure/drizzle-uow.ts`, fake in-memory trong `admin/application/__tests__` (theo mẫu fake hiện có)
- Test: `packages/core/src/modules/admin/infrastructure/exchange-rates.int.test.ts`

- [ ] **Step 1: Write failing int test**:
  - `upsertAuto` 2 tiền tệ → đọc lại;
  - `upsertManual` USD cùng tuần → `upsertAuto` lần 2 không đổi USD (MANUAL) nhưng cập nhật EUR;
  - `kb_app` không ghi được `exchange_rates`;
  - `fetches.latest()` trả lần mới nhất.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** + `db:generate` → đổi tên file → đọc SQL. **Step 4: Run** → PASS; `pnpm db:migrate`.

### Task 3: Use case admin – chụp tỷ giá tuần, xem, sửa tay, "Cần chú ý"

**Files:**
- Create: `packages/core/src/modules/admin/application/exchange-rates.ts`, `admin/application/__tests__/exchange-rates.test.ts`
- Modify: `admin/application/ports.ts` (port `VcbRateSource { fetchBoard(): Promise<string> }`), `admin/domain/attention.ts` (+ input `lastRateFetch`), `admin/application/overview.ts` (truyền vào), `admin/index.ts` (export)

**Interfaces – Produces:**

```ts
/** Job: lấy bảng VCB → ghi tỷ giá hiệu lực từ thứ Hai kế tiếp (source VCB), không đụng MANUAL; ghi exchange_rate_fetches OK. Lỗi → ném (BullMQ thử lại). */
export async function captureWeeklyRates(deps: RateDeps): Promise<Result<{ effectiveFrom: string; count: number; boardAt: string }>>;
/** Gọi từ worker khi hết lượt thử: ghi fetches FAILED + lỗi (hiện ở "Cần chú ý"). */
export async function recordRateFetchFailure(deps: RateDeps, error: string): Promise<void>;
export async function listExchangeRates(deps: AdminDeps, actor: StaffActor, opts?: { weeks?: number }): Promise<Result<ExchangeRatesView>>; // quyền VIEW; 8 tuần gần nhất
export async function upsertExchangeRate(deps: AdminDeps, actor: StaffActor, input: UpsertExchangeRateInput): Promise<Result<ExchangeRate>>; // quyền PLATFORM; audit "exchange_rate.upsert" kèm lý do
export type RateDeps = { uow: AdminUow; vcb: VcbRateSource; clock: Clock; idGen: IdGen };
```

`buildAttention` thêm mục:
- `RATE_FETCH` mức danger khi lần lấy gần nhất FAILED, hoặc chưa có tỷ giá USD cho tuần hiện tại;
- tiêu đề "Chưa có tỷ giá tính thuế tuần dd/mm", chi tiết lỗi.

- [ ] **Step 1: Write failing tests** (fake uow + fake vcb, clock = 2026-10-15T16:30Z):
  1. capture → USD/EUR… ghi `effectiveFrom 2026-10-19`, `source VCB`, `snapshotAt` = boardAt; fetches OK count.
  2. Có MANUAL USD 2026-10-19 → capture không đổi USD.
  3. Chạy 2 lần → không nhân đôi.
  4. VCB trả HTML → `captureWeeklyRates` ném `VcbParseError`, không ghi tỷ giá nào.
  5. `recordRateFetchFailure` → attention có `RATE_FETCH` danger.
  6. `upsertExchangeRate`:
     - SUPPORT → FORBIDDEN, PLATFORM → ok;
     - ghi MANUAL + audit có lý do;
     - TWD (không có trên VCB) nhập được.
  7. `listExchangeRates` nhóm theo tuần, mới nhất trước; `nextRunAt` = thứ Năm kế tiếp 16:30Z.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.

### Task 4: Declaration – nguồn tỷ giá trên tờ khai + chặn truyền khi sang tuần

**Files:**
- Modify:
  - `packages/core/src/modules/declaration/application/ports.ts` (`exchangeRates.latest` trả thêm `source`, `snapshotAt`, `updatedBy`);
  - `infrastructure/drizzle-uow.ts`; in-memory uow;
  - `application/declaration.ts` (`getDeclarationView` thêm `exchangeRateInfo`);
  - `packages/contracts/src/api/declaration.ts` (`DeclarationViewSchema.exchangeRateInfo: { currency, rate, effectiveFrom, source, snapshotAt } | null`).
- Modify:
  - `packages/core/src/modules/integration/application/submit-declaration.ts`: chặn `RATE_WEEK_CHANGED` khi `!sameRateWeek(snap.exchangeRateDate, vnDate(now))`. Mã lỗi thêm vào `DomainErrorCode`. Snapshot đã có `exchangeRateDate`? → nếu chưa, thêm vào `getDeclarationSnapshot`.
  - `apps/web` thông báo lỗi tương ứng ở bước truyền.
- Tests:
  - `declaration-use-cases.test.ts`: view có `exchangeRateInfo` nguồn SEED/VCB.
  - `integration` submit test:
    - tờ khai `exchangeRateDate 2026-10-16`, now `2026-10-19T02:00Z` → `RATE_WEEK_CHANGED`;
    - now `2026-10-18T16:30Z` (CN 23:30 VN) → không chặn.

- [ ] Steps: RED → implement → GREEN như các task trên; chạy `npx vitest run src/modules/declaration src/modules/integration`.

### Task 5: Worker + web (khu Quản trị, màn Review)

**Files:**
- Create:
  - `apps/worker/src/jobs/exchange-rate.ts`;
  - `apps/worker/src/index.ts`: Worker `exchange-rate-weekly` (concurrency 1), lịch `upsertJobScheduler("exchange-rate-weekly", { pattern: "30 16 * * 4" }, { opts: { attempts: 16, backoff: { type: "fixed", delay: 30*60_000 } } })`; hết lượt → `recordRateFetchFailure`.
- Create: `packages/core/src/modules/admin/infrastructure/vcb-rate-source.ts` (`HttpVcbRateSource`, URL hằng số, timeout 20s) + `createRateDeps(platformUrl)` export từ `admin/infrastructure/index.ts`; worker container dựng bằng `platformDbUrl(env)`.
- Create: `apps/web/src/app/api/admin/exchange-rates/route.ts` (GET list, PUT upsert – `requireStaff()` + Zod).
- Modify: `apps/web/src/api/admin.ts`, `api/http/admin.ts`, `mocks/admin/*` (seed 2 tuần + `ops.ts` upsert có `actor(db,"PLATFORM")` + `log`, test trong `ops.test.ts`).
- Create: `apps/web/src/features/admin/exchange-rates/exchange-rates-page.tsx`:
  - thẻ trạng thái lần lấy gần nhất + lần chạy tới;
  - bảng tuần × tiền tệ (DataTable, cột nguồn dùng `Badge`);
  - nút "Thêm / sửa tỷ giá" → `ReasonDialog` có Select tiền tệ, DatePicker thứ Hai, ô tỷ giá.
- Modify: menu khu Quản trị (mục "Tỷ giá tính thuế").
- Modify: `apps/web/src/features/dossier-detail/steps/review-step.tsx`: dòng nguồn tỷ giá (R9) dưới tổng trị giá.
- e2e `apps/web/e2e/admin-exchange-rates.spec.ts`:
  - bao (qua 2FA) thêm tỷ giá TWD tuần này kèm lý do → bảng hiện "Nhập tay";
  - API GET trả TWD;
  - SUPPORT không thấy nút.

- [ ] Steps:
  1. RED (`ops.test.ts`).
  2. Implement.
  3. GREEN.
  4. Kiểm trình duyệt sáng/tối 1366/390 trang mới.
  5. e2e.

### Task 6: Tài liệu + kiểm toàn bộ

- `docs/BACKEND-TODO.md` D2 → xong (ghi cách hoạt động + cửa sổ thử lại + tỷ giá chéo nhập tay); `docs/PRODUCT.md` (khu Quản trị); `apps/web/CLAUDE.md` (route admin/exchange-rates).
- `pnpm typecheck && pnpm lint && pnpm test` xanh; e2e `admin-*`, `agent-declaration`, `customs-and-list`.
