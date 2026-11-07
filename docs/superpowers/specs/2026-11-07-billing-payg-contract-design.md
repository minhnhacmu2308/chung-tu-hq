# Gói dịch vụ: Theo lượt (PAYG) + Hợp đồng năm (CONTRACT)

Ngày: 2026-11-07 · Trạng thái: PO đã chốt · ADR: `docs/adr/0011-billing-payg-and-annual-contract.md`

## 1. Vì sao đổi

Gói cũ tính theo **số hồ sơ/tháng** (TRIAL/BASIC/PRO/ENTERPRISE), trừ hạn mức lúc **tạo hồ sơ**. Khách trả tiền cho việc **khai được tờ khai**, không phải cho việc tạo hồ sơ. Ngoài ra code hiện tại còn mấy chỗ sai:
- giá trên UI lệch seed;
- "dùng thử 14 ngày" chưa làm;
- `org_contracts.ends_on` không chặn gì;
- doanh thu trong báo cáo admin lấy theo giá gói hiện tại.

Giá vốn đo được: AI ~870 đ/chứng từ, ~2.200 đ/hồ sơ. HSCodePro và FPT tính theo đơn giá env, hiện là 0.

## 2. Quyết định của PO

| # | Quyết định |
|---|---|
| D1 | Có 2 loại gói. **CONTRACT** (Hợp đồng năm, bán theo liên hệ, khai không giới hạn trong hạn). **PAYG** (Theo lượt, mặc định 25.000 đ/lượt). |
| D2 | **1 lượt = 1 tờ khai (nhánh/branch) được Hải quan chấp nhận IDC.** Lô tách 3 tờ thì 3 lượt. Không trừ lượt khi: đọc chứng từ, IDA/IDC bị từ chối, hủy hồ sơ, khai sửa (IDA01/IDC01 cùng số tờ khai), HYS, IDB, tra cứu. |
| D3 | PAYG **trả trước qua PayOS**. Khách mua lượt, PayOS webhook báo đã trả thì cộng lượt. Admin vẫn **nạp/điều chỉnh tay** được (chuyển khoản ngoài, tặng, hoàn). |
| D4 | Doanh nghiệp **tự đăng ký** vào PAYG, **tặng 3 lượt**. |
| D5 | CONTRACT hết hạn: cảnh báo trước 30 ngày. Hết hạn còn **7 ngày ân hạn**. Sau đó **khóa truyền tờ khai mới (IDA lần đầu)**. Khách vẫn đăng nhập, xem, đọc chứng từ, sửa hồ sơ được. |
| D6 | Doanh nghiệp đang có: ENTERPRISE chuyển CONTRACT (không có ngày hết hạn, admin nhập sau). TRIAL/BASIC/PRO chuyển PAYG, kèm 3 lượt tặng. |
| D7 | Bỏ hạn mức **số hồ sơ/tháng**. Giữ **số trang/hồ sơ** để chống lạm dụng chi phí AI. Trần chi phí AI/ngày (`AI_DAILY_COST_CAP_VND`) giữ nguyên. |

## 3. Mô hình dữ liệu (migration `0034_billing_payg_contract.sql`)

### 3.1 `plans`: sửa
- Thêm `kind text not null` với check `in ('PAYG','CONTRACT')`.
- Thêm `price_per_declaration_vnd money not null default 0`: đơn giá một lượt. Chỉ PAYG dùng; CONTRACT bằng 0.
- Bỏ cột `dossiers_per_month` (không còn hạn mức hồ sơ). Giữ `pages_per_dossier` và `price_vnd`. Với CONTRACT, `price_vnd` là giá niêm yết tham khảo, 0 = "Liên hệ".
- Dữ liệu mới:

  | code | name | kind | pages_per_dossier | price_per_declaration_vnd |
  |---|---|---|---|---|
  | `PAYG` | Theo lượt | PAYG | 40 | 25000 |
  | `CONTRACT` | Hợp đồng năm | CONTRACT | 100 | 0 |

- Chuyển org theo D6, rồi xóa 4 dòng plan cũ.
- `PlanCodeSchema = z.enum(["PAYG","CONTRACT"])`. Thêm `PlanKindSchema`. Mọi chỗ dùng mã cũ phải sửa: seed, demo org (PAYG + 50 lượt tặng), system skill org (CONTRACT), audience thông báo/email, mock, test.

### 3.2 `org_contracts`: sửa
- Thêm `starts_on date` và `value_vnd money not null default 0` (giá trị hợp đồng, dùng cho báo cáo doanh thu).
- Tình trạng hợp đồng tính bằng hàm thuần ở domain `billing/domain/contract.ts`, theo ngày giờ VN:
  - `ACTIVE`: `ends_on` null hoặc hôm nay ≤ `ends_on`.
    - `EXPIRING`: còn ≤ 30 ngày. Vẫn ACTIVE, chỉ hiện cảnh báo.
  - `GRACE`: `ends_on` < hôm nay ≤ `ends_on` + 7.
  - `EXPIRED`: quá `ends_on` + 7. Khóa IDA lần đầu.

### 3.3 `credit_ledger`: mới, sổ lượt append-only
| cột | ghi chú |
|---|---|
| `id` text PK | Dùng luôn làm khóa chống trùng (như `usage_events`), ví dụ `charge:<orgId>:<declarationNo>`, `payos:<orderCode>`, `grant:signup:<orgId>`, `grant:migrate:<orgId>` |
| `org_id` | FK, có RLS org |
| `delta` int | Lượt cộng/trừ. Trừ = âm |
| `reason` | `PURCHASE` (PayOS), `MANUAL_TOPUP`, `GRANT` (tặng), `CHARGE` (trừ khi IDC được chấp nhận), `CONTRACT_USE` (org CONTRACT khai, delta 0, chỉ để đếm), `REFUND`, `ADJUST` |
| `amount_vnd` money | Tiền tương ứng. PURCHASE = số tiền thu. CHARGE = delta × đơn giá lúc trừ, dùng làm doanh thu ghi nhận. GRANT/CONTRACT_USE = 0 |
| `unit_price_vnd` money | Đơn giá lúc ghi |
| `dossier_id`, `branch` int, `declaration_no` | Có khi CHARGE / CONTRACT_USE |
| `payment_id` | Có khi PURCHASE |
| `note` | Lý do của admin. Bắt buộc với MANUAL_TOPUP/ADJUST/REFUND |
| `created_by` | user id hoặc staff id. `system` khi tự động |
| `at` timestamptz | |

- **Số dư = `sum(delta)` theo org.** Không có cột số dư, nên không lệch.
- Index `(org_id, at)`.
- Ghi theo kiểu `insert … on conflict (id) do nothing`.

### 3.4 `payments`: mới
- `id` text PK, `org_id` (FK, RLS), `provider` (`PAYOS`), `order_code bigint unique not null`, `credits int`, `amount_vnd money`.
- `status`: `PENDING` | `PAID` | `CANCELLED` | `EXPIRED`.
- `checkout_url`, `payment_link_id`, `created_by`, `created_at`, `paid_at`.
- `raw jsonb`: dữ liệu webhook / tra cứu. Không chứa bí mật.
- Webhook không có ngữ cảnh org, nên tìm theo `order_code` trong `uow.system`. Cộng lượt trong `asOrg`, cùng transaction với việc chuyển PAID, khóa trùng `payos:<orderCode>`.

## 4. Quy tắc nghiệp vụ

### 4.1 Trừ lượt (D2)
- Điểm móc: `integration/application/process-outbox.ts`, nhánh **IDC thành công** (`!failed && op === "IDC"`, accepted, có luồng). Ghi cho từng `(dossierId, branch)` qua port mới `DeclarationBilling.onDeclared({ orgId, dossierId, branch, declarationNo, op })`. Port nằm trong `shared/` như `ServiceUsageMeter`; billing hiện thực, composition root nối.
  - Org PAYG: ghi `CHARGE`, delta −1, `amount_vnd` = đơn giá plan.
  - Org CONTRACT: ghi `CONTRACT_USE`, delta 0.
  - Khóa `charge:<orgId>:<declarationNo>`. IDC01 / khai lại cùng số không trừ lần 2. EDA/EDC (tờ khai xuất) áp dụng y hệt: IDC ↔ EDC.
- Ghi kiểu "cố gắng hết sức" như `meterSafely`: tờ khai đã được Hải quan chấp nhận thì không được làm hỏng luồng; lỗi chỉ log `[billing]`. Ngoài ra có job đối soát hằng ngày (4.5) để bù.
- Số dư có thể âm trong ca hiếm (2 lô gửi song song). Chấp nhận được; lần gửi sau sẽ bị chặn.

### 4.2 Chặn trước khi gửi
Chạy khi gửi **IDA/EDA lần đầu của một nhánh**, tức nhánh chưa có số tờ khai. Kiểm tra ở use case gửi, không chỉ ở UI.
- Use case `checkDeclarationAllowance(orgId, sheetsToStart)` trả `{ ok } | { ok:false, code, ... }`:
  - **PAYG:** `available = balance − reserved`, với `reserved` = số nhánh của org đã có số tờ khai (đã IDA) nhưng chưa trừ lượt và chưa bị hủy/từ chối. Cần `available ≥ sheetsToStart`. Nếu thiếu thì lỗi `INSUFFICIENT_CREDITS` (HTTP 402), kèm `{ needed, available }`.
  - **CONTRACT:** `EXPIRED` thì lỗi `CONTRACT_EXPIRED` (402). `GRACE` vẫn cho gửi.
- Áp dụng cho: gửi lần đầu, "khai tất cả" (declare-all), gửi lại một nhánh chưa có số. Không áp dụng cho IDC, IDA01, HYS, IDB, tra cứu, gọi về.

### 4.3 Bỏ hạn mức hồ sơ
- `createDossier` thôi kiểm tra `DOSSIER`. Upload vẫn kiểm tra `PAGES`.
- Bỏ khỏi code: `withinDossierQuota`, `quota_bonus`, `quota_bonus_month`, `trial_ends_at`, admin "nới hạn mức" và "gia hạn dùng thử", các attention QUOTA / PLAN_EXPIRING kiểu cũ.
- Migration drop các cột và endpoint này.

### 4.4 Thanh toán PayOS
- Env:
  - `PAYMENT_PROVIDER: fake | payos`, mặc định `fake`.
  - `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`: bắt buộc khi `payos`, kiểm tra bằng `need(...)` như SMTP.
  - Không bao giờ gửi các khóa này xuống trình duyệt, không log, không ghi vào `raw`.
- Port `PaymentGateway`:
  - `createLink({ orderCode, amount, description, returnUrl, cancelUrl, items })` trả `{ checkoutUrl, paymentLinkId }`.
  - `getStatus(orderCode)` trả `{ status: PENDING|PAID|CANCELLED|EXPIRED, amount }`.
  - `verifyWebhook(body)` trả `{ orderCode, amount, success } | null`.
- Hiện thực `PayosGateway`:
  - Base `https://api-merchant.payos.vn`. Tạo link: `POST /v2/payment-requests`. Tra cứu: `GET /v2/payment-requests/{orderCode}`. Header `x-client-id`, `x-api-key`.
  - Chữ ký tạo link: HMAC-SHA256(checksumKey) của `amount=…&cancelUrl=…&description=…&orderCode=…&returnUrl=…` (sắp xếp theo alphabet).
  - Chữ ký webhook: HMAC-SHA256 của `data`, sắp key theo alphabet, nối `k=v&…`. Giá trị null/undefined thành chuỗi rỗng. So sánh bằng `timingSafeEqual`.
  - `description` ≤ 25 ký tự, dạng `KB<orderCode>` (giới hạn của PayOS).
  - Test bằng fetch giả và vector chữ ký tự tính.
- `FakePaymentGateway` (dev/mock/test): `checkoutUrl` = `${APP_URL}/settings?tab=plan&payment=<id>&fake=1`. Có route dev `POST /api/dev/payments/[id]/simulate-paid`, chỉ chạy khi `PAYMENT_PROVIDER=fake`, để giả lập "đã trả".
- Use case:
  - `startCreditPurchase(ctx, { credits })`:
    - Chỉ OWNER/ADMIN, chỉ org PAYG. `credits` từ 1 đến 1000.
    - `amount = credits × đơn giá`. `orderCode` = số nguyên dương duy nhất (≤ 2^53, ví dụ `Number(Date.now() % 1e12) * 1000 + random(0..999)`, trùng thì thử lại).
    - Ghi `payments` PENDING, gọi `createLink`, lưu url.
    - `returnUrl`/`cancelUrl` = `${APP_URL}/settings?tab=plan&payment=<id>`.
  - `applyPaymentWebhook(body)`: verify, tìm payment, so `amount`. Lệch thì không cộng lượt, log và ghi `raw`. Đúng thì chuyển PAID và ghi ledger PURCHASE (delta = credits). Idempotent.
  - `syncPayment(ctx, paymentId)`: trang return gọi `getStatus` rồi áp dụng giống webhook. Dùng khi webhook đến chậm. Chỉ tra cứu khi PENDING.
- Route:
  - `POST /api/org/billing/checkout`
  - `GET /api/org/billing`: plan, số dư, khả dụng, hợp đồng, sổ lượt 50 dòng gần nhất, thanh toán gần đây
  - `POST /api/org/billing/payments/[id]/sync`
  - `POST /api/billing/payos/webhook`: public. Thêm vào `PUBLIC_PREFIXES` nếu proxy chặn. Luôn trả 200 `{ success: true }` khi chữ ký đúng (PayOS yêu cầu); sai chữ ký thì 400.

### 4.5 Đối soát
Job worker `billing-reconcile`, chạy hằng ngày và chạy được bằng tay:
- Nhánh đã IDC thành công (có `customs_results` stage ≥ DECLARED) mà chưa có dòng ledger thì ghi bù. Cùng khóa nên không trùng.
- Payment PENDING quá 15 phút thì `getStatus` một lần; quá 24 giờ thì EXPIRED.

### 4.6 Đăng ký và admin tạo org
- `register` (doanh nghiệp mới): `planCode: "PAYG"`, ghi GRANT 3 lượt, khóa `grant:signup:<orgId>`, trong cùng transaction.
- Admin `createOrg`: chọn PAYG (tùy chọn tặng N lượt) hoặc CONTRACT (số HĐ, bắt đầu, kết thúc, giá trị).

## 5. API và DTO (contracts)

- `OrganizationSchema.plan` = `{ code, name, kind, pagesPerDossier, pricePerDeclarationVnd }`.
- `OrganizationSchema.billing` = `{ balance, reserved, available, contract: { contractNo, startsOn, endsOn, status, daysLeft } | null, declarationsThisMonth }`.
  - Bỏ `dossiersPerMonth`, `bonusThisMonth`, `renewsAt`.
  - `usage` giữ `dossiersThisMonth`, `pagesThisMonth`. Bỏ các cột chi phí AI/HS/Customs khỏi DTO của khách: đó là giá vốn nội bộ, khách PAYG không nên thấy. Admin vẫn xem.
- `BillingOverviewSchema` (GET /api/org/billing), `CreditLedgerEntrySchema`, `PaymentSchema`, `StartPurchaseInputSchema { credits }`, `StartPurchaseResultSchema { paymentId, checkoutUrl }`.
- Admin:
  - `AdminPlan` = `{ code, name, kind, pagesPerDossier, priceVnd, pricePerDeclarationVnd, orgCount }`. `UpdatePlanInput` tương ứng.
  - `POST /api/admin/orgs/[id]/plan { planCode }`: đổi loại.
  - `PUT /api/admin/orgs/[id]/contract { contractNo, startsOn, endsOn, valueVnd, note }`.
  - `POST /api/admin/orgs/[id]/credits { delta, reason: MANUAL_TOPUP|GRANT|REFUND|ADJUST, note, reason text bắt buộc }`.
  - `GET /api/admin/orgs/[id]/credits`: sổ lượt.
  - Mọi lệnh ghi đều audit: `ORG_PLAN_CHANGED`, `ORG_CONTRACT_UPDATED`, `ORG_CREDITS_ADJUSTED`.
  - Bỏ `/quota`, `/trial`.
- Lỗi mới trong `shared/errors.ts`: `INSUFFICIENT_CREDITS`, `CONTRACT_EXPIRED`, cả hai map 402. Thêm text vi/en/zh vào `reason-codes.messages.ts`.

## 6. Giao diện

### 6.1 Khách: Cài đặt → tab "Gói & sử dụng" (viết lại `plan-tab.tsx`)
**PAYG:**
- Thẻ số dư: "Còn **N** lượt", phụ "đang giữ R lượt cho tờ khai đã có số, chưa khai chính thức". Đơn giá "25.000 đ/lượt · 1 lượt = 1 tờ khai được Hải quan chấp nhận".
- Nút **Mua lượt** (OWNER/ADMIN) mở dialog:
  - Chọn nhanh 10 / 50 / 100 lượt hoặc nhập số.
  - Hiện tổng tiền `formatNumber`.
  - Nút "Thanh toán qua PayOS" chuyển sang `checkoutUrl`.
- Khi quay lại (`?payment=<id>`): gọi sync. PAID thì toast thành công và xóa query. PENDING thì hiện "Đang chờ xác nhận thanh toán", tự hỏi lại vài lần. CANCELLED thì báo đã hủy.
- Bảng **Lịch sử lượt** (DataTable): thời gian, loại (badge), số lượt ±, tờ khai (link hồ sơ), số tiền, ghi chú.
- Bảng **Thanh toán** gần đây: mã đơn, số lượt, tiền, trạng thái.

**CONTRACT:**
- Thẻ hợp đồng: số HĐ, hiệu lực từ–đến, trạng thái (Badge: Đang hiệu lực / Sắp hết hạn còn n ngày / Ân hạn / Hết hạn).
- Số tờ khai đã khai tháng này.
- Dòng "Liên hệ gia hạn".

**Chung:**
- Số trang tối đa/hồ sơ.
- Khối giới thiệu 2 loại gói: Theo lượt và Hợp đồng năm ("Liên hệ" mở mailto/zalo theo cấu hình hiện có, hoặc toast như cũ).

### 6.2 Bước Truyền tờ khai (`submit-step.tsx`)
- Cạnh nút **Ký số và gửi** khi gửi lần đầu:
  - PAYG: dòng "Lô này dùng **N lượt** khi Hải quan chấp nhận khai chính thức · còn X lượt khả dụng".
  - Không đủ lượt: `Alert` tone danger, nút **Mua lượt** (link `/settings?tab=plan`), khóa nút gửi.
  - CONTRACT: GRACE hiện cảnh báo, EXPIRED hiện alert danger và khóa nút.
- Lỗi server `INSUFFICIENT_CREDITS` / `CONTRACT_EXPIRED` hiện cùng alert đó.

### 6.3 Dashboard và Tạo hồ sơ
- Bỏ cảnh báo "hết n/n hồ sơ" và việc khóa nút tạo hồ sơ theo hạn mức.
- Dashboard: PAYG còn ≤ 3 lượt thì hiện nhắc mua; CONTRACT EXPIRING/GRACE/EXPIRED thì hiện nhắc.

### 6.4 Admin
- **Gói** (`plan-list-page.tsx`): 2 thẻ.
  - PAYG sửa: tên, trang/hồ sơ, đơn giá/lượt.
  - CONTRACT sửa: tên, trang/hồ sơ, giá niêm yết (0 = Liên hệ).
- **Chi tiết doanh nghiệp → tab Gói:**
  - Loại gói và nút đổi.
  - PAYG: số dư, nút **Điều chỉnh lượt** (delta ±, lý do, ghi chú), bảng sổ lượt, thanh toán.
  - CONTRACT: form hợp đồng (số, bắt đầu, kết thúc, giá trị, ghi chú) và trạng thái.
  - Bỏ "Nới hạn mức", "Gia hạn dùng thử".
- **Tạo doanh nghiệp:** chọn loại gói, kèm trường tương ứng.
- **Danh sách doanh nghiệp:** cột Gói (loại), cột "Số dư / Hạn HĐ". Lọc "trial" đổi thành lọc theo loại gói.
- **Sử dụng & chi phí:** mỗi org thêm:
  - Số tờ khai đã tính trong tháng.
  - Doanh thu ghi nhận: PAYG = tổng `amount_vnd` của CHARGE trong tháng; CONTRACT = `value_vnd/12` nếu hợp đồng phủ tháng đó.
  - Tiền thu PayOS trong tháng (PURCHASE).
  - Lãi gộp = doanh thu ghi nhận − giá vốn.
  - Bỏ việc lấy `price_vnd` hiện tại làm doanh thu.
- **Cần chú ý:** `LOW_CREDITS` (PAYG ≤ 3 và có khai trong 30 ngày), `CONTRACT_EXPIRING` (≤ 30 ngày), `CONTRACT_EXPIRED` (GRACE/EXPIRED), `CONTRACT_NO_END` (CONTRACT chưa có ngày kết thúc).

## 7. Mock backend (web)
`apps/web/src/mocks` phải làm theo đúng quy tắc trên, theo quy ước dự án: plan PAYG/CONTRACT, ledger, payment fake (checkout trả về `/settings?tab=plan&payment=…&fake=1`, sync thành PAID), chặn gửi khi thiếu lượt.

## 8. Test bắt buộc
- **Domain:**
  - `contractStatus` (biên 30 ngày / 7 ngày theo giờ VN)
  - `available = balance − reserved`
  - chữ ký PayOS (tạo link và webhook, đúng/sai, null thành rỗng)
- **Use case:**
  - IDC được chấp nhận thì CHARGE một lần, chạy lại không trùng; IDC01 cùng số không trừ lại
  - CONTRACT ghi CONTRACT_USE
  - IDA lần đầu thiếu lượt thì `INSUFFICIENT_CREDITS`; hợp đồng EXPIRED thì `CONTRACT_EXPIRED`; GRACE thì vẫn qua
  - declare-all đếm đúng số nhánh
  - webhook: sai chữ ký, lệch tiền, trùng lần 2, PAID cộng đúng
  - `startCreditPurchase`: quyền, biên 1–1000, không phải PAYG
  - register tặng 3 lượt
  - đối soát ghi bù
- **Integration (DB thật):** migration 0034 chuyển org đúng D6; RLS của `credit_ledger`/`payments` (org A không thấy org B).
- **Web:** plan-tab PAYG/CONTRACT, dialog mua lượt, return sync, submit-step thiếu lượt khóa nút, admin điều chỉnh lượt / form hợp đồng. Có a11y.

## 9. Tài liệu phải cập nhật
- `docs/adr/0011-billing-payg-and-annual-contract.md` (mới).
- `docs/PRODUCT.md` §8.
- `docs/QUY-TRINH-NGHIEP-VU.md` §11 và §12 (bảng gói, quy tắc lượt, PayOS, đối soát, admin).
- `docs/ARCHITECTURE.md` (bảng module billing).
- `.env.example` (khóa PayOS để trống).
- `docs/DEPLOY.md`: không commit (theo quy ước). Hướng dẫn bật PayOS ghi vào QUY-TRINH hoặc một doc riêng có commit.
- `apps/web/CLAUDE.md`: danh sách route.
