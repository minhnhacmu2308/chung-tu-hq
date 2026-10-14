# Backend giai đoạn 1 – Identity, Tài khoản & tích hợp · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đăng ký doanh nghiệp theo MST, đăng nhập thật bằng cookie session, quản lý thành viên/vai trò, chứng thư số, kết nối hệ thống, thông báo; màn Đăng nhập/Đăng ký/Tài khoản & tích hợp chạy trên API thật khi `NEXT_PUBLIC_DATA_SOURCE=http`.

**Architecture:** Module `identity` trong `packages/core` theo 3 tầng; use case nhận `deps` gồm một **Unit of Work** (`uow.system / uow.asUser / uow.asOrg`) bọc `withSystem/withUser/withCtx` để RLS luôn đúng; test use case dùng `InMemoryIdentityUow`. Web có `requireSession()` đọc cookie → `Ctx`, wrapper `route()` map `DomainError` → HTTP, `proxy.ts` chặn trang chưa đăng nhập (chỉ khi nguồn dữ liệu `http`). FE thêm `src/api/http/{session,settings}.ts` và `pick()`.

**Tech Stack:** như giai đoạn 0 + `@node-rs/argon2`, `nodemailer` 10 (SMTP → Mailpit), `ioredis` (rate limit), `node:crypto` (AES-256-GCM, sha256), Next 16 `proxy.ts`, Playwright (smoke qua MCP trên bản build).

**Spec:** `docs/superpowers/specs/2026-10-13-backend-design.md` §3.2 (bảng identity), §3.5 bảo mật, §4.1 identity, §4.7 (integration status), §4.8 billing tối thiểu, §5 API nhóm auth/org/notifications. Ghi chú việc chưa rõ: `docs/BACKEND-TODO.md` (T3, T6, N1, N2, N5).

## Global Constraints

- Như giai đoạn 0 (strict TS, `.js` trong import nội bộ core/contracts, Zod ở biên, `orgId` bắt buộc, không commit khi chưa được yêu cầu).
- Mọi truy vấn identity qua `uow`; không `createDb` ngoài container; không import `drizzle-orm` trong `application/`.
- `Member.id` = `users.id` (FE so `meId === session.user.id`). Mật khẩu ≥ 8 ký tự, Argon2id. Email lưu lowercase.
- Cookie `kb_session`: HttpOnly, SameSite=Lax, Secure khi `APP_URL` https, 30 ngày trượt. Token 32 byte random base64url; DB lưu `sha256(token)`.
- Không trả về `password_hash`, token, bí mật qua API. Thông điệp lỗi tiếng Việt, `code` cố định.
- Rate limit: login 10 lần/15 phút theo `email+ip`; register 5/giờ/ip; forgot-password 3/giờ/email. Dev/test dùng `InMemoryRateLimiter`.

## Review Focus

1. Đăng nhập sai mật khẩu và email không tồn tại phải trả **cùng** `INVALID_CREDENTIALS` (không lộ email có tồn tại) → test Task 4.
2. Thành viên `DISABLED` hoặc `INVITED` đăng nhập: bị từ chối (`MEMBERSHIP_DISABLED` / `MEMBERSHIP_PENDING`), session không được tạo → Task 4.
3. Token mời/đặt lại mật khẩu dùng lần hai hoặc hết hạn → `TOKEN_INVALID`; dùng một lần ghi `used_at` → Task 4.
4. OWNER không thể bị khóa, không thể bị đổi vai trò, không thể mời với vai trò OWNER; người dùng không tự khóa mình → Task 5.
5. Route với cookie sai/hết hạn trả 401 JSON `{code:"UNAUTHENTICATED"}`; `proxy.ts` chuyển hướng trang `/dossiers` về `/login?next=` khi không có cookie và nguồn `http` → Task 8.

---

## Bản đồ file

```
packages/contracts/src/api/identity.ts (+ .test.ts)           input/output Zod cho nhóm auth/org/notifications
packages/core/src/db/schema/identity.ts                        + sessions, auth_tokens, join_requests, digital_certificates, org_secrets, notifications
packages/core/src/db/schema/integration.ts                     integration_status
packages/core/drizzle/0001_identity.sql
packages/core/src/modules/identity/
  domain/{email,tax-code,password,token,role-rules,session-policy}.ts (+ tests)
  application/ports.ts                                         IdentityUow, repos, Mailer, PasswordHasher, RateLimiter, SecretStore, TaxRegistryLookup
  application/test/in-memory-uow.ts                            fake cho test use case
  application/{register,login,logout,get-session,lookup-tax-code,verify-email,request-password-reset,reset-password,
               list-members,invite-member,accept-invite,change-member-role,set-member-disabled,
               get-organization,update-organization,update-suspect-threshold,
               list-certificates,add-certificate,remove-certificate,set-default-certificate,
               list-notifications,mark-all-notifications-read,list-join-requests,approve-join-request}.ts (+ tests)
  infrastructure/{drizzle-uow,argon2-hasher,redis-rate-limiter,in-memory-rate-limiter,aes-secret-store,mailer,fake-tax-registry,index}.ts (+ drizzle-uow.int.test.ts)
  index.ts
packages/core/src/modules/integration/{application/{ports,list-integrations,test-integration}.ts, infrastructure/{drizzle-status-repo,index}.ts, index.ts}
packages/core/src/modules/billing/{application/{ports,get-plan-usage}.ts, infrastructure/{drizzle-plan-repo,index}.ts, index.ts}
apps/web/src/lib/server/{route,auth,cookies}.ts (+ route.test.ts)
apps/web/src/proxy.ts (+ proxy.test.ts)
apps/web/src/app/api/{auth/*,org/*,notifications/*,dev/reset-demo}/route.ts
apps/web/src/container.ts                                      + identity/integration/billing deps
apps/web/src/api/http/{session,settings}.ts; apps/web/src/api/{session,settings}.ts (pick)
apps/web/src/features/auth/register-page.tsx (gửi password), features/shell/app-shell.tsx (logout gọi API)
```

---

### Task 1: Contract API cho identity

**Files:**
- Create: `packages/contracts/src/api/identity.ts`, `packages/contracts/src/api/identity.test.ts`, `packages/contracts/src/api/index.ts`
- Modify: `packages/contracts/src/index.ts` (`export * from "./api/index.js"`)

**Interfaces (Produces):**
```ts
EmailSchema = z.email().transform(s => s.trim().toLowerCase())
TaxCodeSchema = z.string().transform(s => s.replace(/\D/g, "")).refine(s => s.length === 10 || s.length === 13, "MST gồm 10 hoặc 13 chữ số")
PasswordSchema = z.string().min(8, "Mật khẩu ít nhất 8 ký tự").max(128)
LoginInputSchema { email: EmailSchema; password: z.string().min(1) }
RegisterInputSchema { email; name: z.string().trim().min(2); password: PasswordSchema; taxCode: TaxCodeSchema; joinExisting: z.boolean() }
RegisterResultSchema { ok: true; mode: "CREATED_ORG" | "JOIN_REQUESTED" }
CompanyLookupSchema = discriminatedUnion("found", [{found:false}, {found:true, existing:boolean, name, address}])
SessionSchema { user: MemberSchema; org: OrganizationSchema }
VerifyEmailInputSchema { token: z.string().min(16) }
ForgotPasswordInputSchema { email }
ResetPasswordInputSchema { token; password: PasswordSchema }
AcceptInviteInputSchema { token; name: z.string().trim().min(2); password: PasswordSchema }
OrgProfileInputSchema { name: z.string().trim().min(1, "Tên doanh nghiệp không được để trống"); address: z.string().trim(); phone: z.string().trim() }
SuspectThresholdInputSchema { threshold: z.enum(["STRICT","BALANCED","RELAXED"]) }
InviteMemberInputSchema { email; role: RoleSchema.exclude(["OWNER"]) }
ChangeRoleInputSchema { role: RoleSchema.exclude(["OWNER"]) }
SetDisabledInputSchema { disabled: z.boolean() }
AddCertificateInputSchema { issuer: z.string().trim().min(1); serial: z.string().trim().min(1).transform(s => s.toUpperCase()); validTo: IsoDateSchema }
JoinRequestSchema { id; userId; name; email; requestedAt: IsoDateTime }
OkSchema { ok: z.literal(true) }
```
Kiểu `z.infer` cùng tên không hậu tố (`LoginInput`, `RegisterInput`, `Session`, `CompanyLookup`, …).

- [ ] **Step 1: Test (fail trước)** – `identity.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { InviteMemberInputSchema, LoginInputSchema, RegisterInputSchema, TaxCodeSchema } from "./identity.js";

describe("contract identity", () => {
  it("email chuẩn hóa lowercase + trim", () => {
    expect(LoginInputSchema.parse({ email: "  Chau.Le@AnPhat-Demo.vn ", password: "x" }).email).toBe("chau.le@anphat-demo.vn");
  });
  it.each(["0316789012", "0316 789 012", "0316789012-001"])("TaxCode %s → chỉ giữ chữ số, 10 hoặc 13 số", (v) => {
    expect(["0316789012", "0316789012001"]).toContain(TaxCodeSchema.parse(v));
  });
  it("TaxCode 9 số bị từ chối", () => {
    expect(TaxCodeSchema.safeParse("031678901").success).toBe(false);
  });
  it("Register: mật khẩu < 8 ký tự bị từ chối", () => {
    expect(RegisterInputSchema.safeParse({ email: "a@b.vn", name: "An", password: "1234567", taxCode: "0316789012", joinExisting: false }).success).toBe(false);
  });
  it("Invite: không cho vai trò OWNER", () => {
    expect(InviteMemberInputSchema.safeParse({ email: "a@b.vn", role: "OWNER" }).success).toBe(false);
    expect(InviteMemberInputSchema.parse({ email: "a@b.vn", role: "VIEWER" }).role).toBe("VIEWER");
  });
});
```
Run: `pnpm --filter @kb/contracts test` → FAIL (thiếu module).

- [ ] **Step 2: Viết `api/identity.ts`** theo Interfaces trên (import `IsoDateSchema, IsoDateTimeSchema, RoleSchema` từ `../common.js`, `MemberSchema, OrganizationSchema` từ `../dto/index.js`). `api/index.ts`: `export * from "./identity.js";`. Thêm vào `src/index.ts`.
- [ ] **Step 3: Run** `pnpm --filter @kb/contracts test && pnpm --filter @kb/contracts typecheck` → PASS.
- [ ] **Step 4: Sẵn sàng commit** – `feat(contracts): schema API identity`.

---

### Task 2: Schema identity mở rộng + integration_status + migration 0001

**Files:**
- Modify: `packages/core/src/db/schema/identity.ts`, `packages/core/src/db/schema/index.ts`
- Create: `packages/core/src/db/schema/integration.ts`, `packages/core/src/db/identity-schema.int.test.ts`
- Generate: `packages/core/drizzle/0001_identity.sql` + meta

**Interfaces (Produces – bảng):**
- `sessions` (id, user_id → users, org_id text null, token_hash unique, expires_at timestamptz, last_seen_at, ip, user_agent, created_at). RLS: select/delete khi `noContext` OR `user_id = currentUser`; insert khi `noContext`.
- `auth_tokens` (id, user_id, org_id null, kind text VERIFY_EMAIL|RESET_PASSWORD|INVITE, token_hash unique, expires_at, used_at null, created_at). RLS: all khi `noContext` OR `user_id = currentUser` (withCheck same).
- `join_requests` (id, org_id, user_id, status PENDING|APPROVED|REJECTED, decided_by null, decided_at null, timestamps). RLS: select `orgPolicyUsing OR user_id = currentUser OR noContext`; insert `noContext`; update `orgPolicyUsing`.
- `digital_certificates` (id, org_id, subject, issuer, serial, valid_to date, is_default bool, timestamps). RLS org chuẩn (`orgPolicyUsing` all + withCheck). Index `(org_id)`.
- `org_secrets` (id, org_id, kind text, ciphertext text, key_version int, timestamps; unique (org_id, kind)). RLS org chuẩn.
- `notifications` (id, org_id, user_id, title, body, href null, read_at null, created_at). RLS: all `orgPolicyUsing AND user_id = currentUser`; withCheck `orgPolicyUsing`. Index `(org_id, user_id, created_at)`.
- `integration_status` (id, org_id, kind text HSCODEPRO|CUSTOMS_HUB|AI_PROVIDER|EINVOICE, status, detail null, last_checked_at null, timestamps; unique (org_id, kind)). RLS org chuẩn.
- Helper mới trong `shared.ts`: `orgRls(name)` trả `pgPolicy(name, { for: "all", to: appRole, using: orgPolicyUsing, withCheck: orgPolicyUsing })`.

- [ ] **Step 1: Test RLS bảng mới (fail trước)** – `identity-schema.int.test.ts` (dùng `startTestDb`, seed org_a/org_b/usr_a/usr_b như `with-ctx.int.test.ts`):
```ts
it("digital_certificates: org B không thấy chứng thư của org A", …)        // insert bằng admin cert cho org_a; withCtx(org_b) select → []
it("notifications: user chỉ thấy thông báo của chính mình trong org", …)  // 2 notif usr_a/usr_b trong org_a; withCtx(org_a, usr_a) → chỉ của a
it("sessions: withSystem tìm được theo token_hash; withUser chỉ thấy session của mình", …)
it("org_secrets: withCtx(org_a) không đọc được secret org_b", …)
```
Run → FAIL (bảng không tồn tại).

- [ ] **Step 2: Thêm bảng** vào `schema/identity.ts` và `schema/integration.ts` theo Interfaces; export trong `schema/index.ts`. Chạy `pnpm --filter @kb/core db:generate`, đổi tên file thành `0001_identity.sql`, sửa `_journal.json`, đọc SQL kiểm tra 7 bảng mới có `ENABLE ROW LEVEL SECURITY` và policy.
- [ ] **Step 3: Run** `pnpm --filter @kb/core test src/db` → PASS (kể cả test cũ). `pnpm db:migrate` trên DB dev → `✓`.
- [ ] **Step 4: Sẵn sàng commit** – `feat(db): bảng session/token/join_request/certificate/secret/notification/integration_status + RLS`.

---

### Task 3: Domain identity + ports + InMemoryIdentityUow

**Files:**
- Create: `packages/core/src/modules/identity/domain/{email,tax-code,password,token,role-rules,session-policy}.ts` + `__tests__/domain.test.ts`
- Create: `packages/core/src/modules/identity/application/ports.ts`, `application/test/in-memory-uow.ts`

**Interfaces (Produces):**
```ts
// domain
normalizeEmail(s): string                       // trim + lowercase
normalizeTaxCode(s): string | null              // chỉ chữ số; null nếu không phải 10/13
displayNameFromEmail(email): string             // "chau.le" → "Chau Le" (như mock)
PASSWORD_MIN = 8; isPasswordAcceptable(p): boolean
newToken(): { raw: string; hash: string }       // raw = 32 byte base64url (dùng randomBytes inject? → nhận `random: () => Buffer` tham số, mặc định crypto)
hashToken(raw): string                          // sha256 hex
SESSION_TTL_MS = 30 ngày; sessionExpiry(now): Date; shouldExtend(session, now): boolean (còn < 15 ngày)
TOKEN_TTL = { VERIFY_EMAIL: 3 ngày, RESET_PASSWORD: 1 giờ, INVITE: 7 ngày }
canChangeRole(actor: Role, target: {role, isSelf}, next: Role): Result<void>   // OWNER/ADMIN được đổi; không đổi OWNER; không gán OWNER; không tự hạ
canDisable(actor, target: {role, isSelf}): Result<void>                       // không khóa OWNER; không tự khóa; cần ADMIN+
canInvite(actor): Result<void>; canManageOrg(actor): Result<void>; canManageCertificates(actor): Result<void>  // ADMIN+ (OWNER luôn được)

// ports
type UserRow = { id; email; passwordHash; name; emailVerifiedAt: Date | null; createdAt }
type OrgRow = { id; taxCode; name; address; phone; planCode; suspectThreshold; createdAt }
type MembershipRow = { id; orgId; userId; role: Role; status: "ACTIVE"|"INVITED"|"DISABLED"; invitedBy: string|null }
type SessionRow = { id; userId; orgId: string|null; tokenHash; expiresAt: Date; lastSeenAt: Date }
type AuthTokenRow = { id; userId; orgId: string|null; kind; tokenHash; expiresAt: Date; usedAt: Date|null }
type JoinRequestRow = { id; orgId; userId; status; createdAt }
type CertificateRow = { id; orgId; subject; issuer; serial; validTo: string; isDefault }
type NotificationRow = { id; orgId; userId; title; body; href: string|null; readAt: Date|null; createdAt: Date }

interface IdentityRepos {
  users: { findByEmail(email): Promise<UserRow|null>; findById(id): Promise<UserRow|null>; findByIds(ids: string[]): Promise<UserRow[]>; insert(row): Promise<void>; update(id, patch: Partial<Pick<UserRow,"name"|"passwordHash"|"emailVerifiedAt">>): Promise<void> }
  orgs: { findByTaxCode(taxCode): Promise<OrgRow|null>; findById(id): Promise<OrgRow|null>; insert(row): Promise<void>; update(id, patch: Partial<Pick<OrgRow,"name"|"address"|"phone"|"suspectThreshold"|"planCode">>): Promise<void> }
  memberships: { listByOrg(orgId): Promise<MembershipRow[]>; listByUser(userId): Promise<MembershipRow[]>; find(orgId, userId): Promise<MembershipRow|null>; insert(row): Promise<void>; update(id, patch: Partial<Pick<MembershipRow,"role"|"status">>): Promise<void> }
  sessions: { findByTokenHash(h): Promise<SessionRow|null>; insert(row): Promise<void>; touch(id, lastSeenAt, expiresAt): Promise<void>; delete(id): Promise<void>; lastSeenByUsers(userIds): Promise<Record<string, Date>> }
  authTokens: { findValid(kind, hash, now): Promise<AuthTokenRow|null>; insert(row): Promise<void>; markUsed(id, at): Promise<void> }
  joinRequests: { listPending(orgId): Promise<JoinRequestRow[]>; findPendingByUser(userId): Promise<JoinRequestRow[]>; insert(row): Promise<void>; decide(id, status, decidedBy, at): Promise<void> }
  certificates: { list(orgId): Promise<CertificateRow[]>; insert(row): Promise<void>; setDefault(orgId, id): Promise<void>; delete(orgId, id): Promise<void> }
  notifications: { list(orgId, userId): Promise<NotificationRow[]>; insert(row): Promise<void>; markAllRead(orgId, userId, at): Promise<void> }
}
interface IdentityUow {
  system<T>(fn: (r: IdentityRepos) => Promise<T>): Promise<T>;
  asUser<T>(userId: UserId, fn: (r: IdentityRepos) => Promise<T>): Promise<T>;
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: IdentityRepos) => Promise<T>): Promise<T>;
}
interface PasswordHasher { hash(p): Promise<string>; verify(hash, p): Promise<boolean> }
interface RateLimiter { hit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number }> }
interface Mailer { send(msg: { to: string; subject: string; text: string; html?: string }): Promise<void> }
interface SecretStore { encrypt(plain: string): { ciphertext: string; keyVersion: number }; decrypt(ciphertext: string, keyVersion: number): string }
interface TaxRegistryLookup { lookup(taxCode: string): Promise<{ found: false } | { found: true; name: string; address: string }> }
type IdentityDeps = { uow: IdentityUow; hasher: PasswordHasher; rateLimiter: RateLimiter; mailer: Mailer; taxRegistry: TaxRegistryLookup; clock: Clock; idGen: IdGen; appUrl: string; random?: () => Buffer }
```
`InMemoryIdentityUow`: giữ mảng cho từng bảng; `asOrg` lọc theo `orgId` (mô phỏng RLS: `certificates.list(orgB)` khi ctx org_a trả `[]`); `asUser` lọc membership/session theo user; `system` không lọc. Có `seed(data)` để test dựng dữ liệu.

- [ ] **Step 1: Test domain (fail trước)** – `__tests__/domain.test.ts` ≥ 12 ca: normalizeEmail; normalizeTaxCode 10/13/sai; displayNameFromEmail("chau.le@x") → "Chau Le"; token raw ≠ hash, hash ổn định; sessionExpiry = now+30d; shouldExtend đúng/sai; canChangeRole: ADMIN đổi DECLARANT→APPROVER ok; đổi OWNER → FORBIDDEN; gán OWNER → FORBIDDEN; VIEWER đổi người khác → FORBIDDEN; canDisable: tự khóa → FORBIDDEN; khóa OWNER → FORBIDDEN.
- [ ] **Step 2: Run** → FAIL. **Step 3: Viết domain + ports + in-memory uow.** **Step 4: Run** `pnpm --filter @kb/core test src/modules/identity/domain` → PASS; `pnpm lint` → không vi phạm `domain-is-pure` (domain chỉ import `node:crypto`? → **không**: domain không I/O nhưng `crypto.randomBytes` là thuần; depcruise cho phép vì không phải module nội bộ. Giữ `hashToken` dùng `node:crypto` createHash – chấp nhận).
- [ ] **Step 5: Sẵn sàng commit** – `feat(identity): domain, ports, fake uow`.

---

### Task 4: Use case đăng ký / đăng nhập / phiên / mật khẩu

**Files:**
- Create trong `application/`: `register.ts`, `login.ts`, `logout.ts`, `get-session.ts`, `lookup-tax-code.ts`, `verify-email.ts`, `request-password-reset.ts`, `reset-password.ts`, `accept-invite.ts`, `_mail-templates.ts`, `_to-dto.ts` (toMember, toOrganization), `__tests__/auth.test.ts`

**Interfaces (Produces – chữ ký):**
```ts
register(deps, input: RegisterInput, meta: { ip: string }) → Result<{ sessionToken: string; mode: "CREATED_ORG"|"JOIN_REQUESTED" }>
  // EMAIL_TAKEN nếu email đã có; RATE_LIMITED; tra MST qua taxRegistry; joinExisting && org tồn tại → user + join_request + notification cho OWNER/ADMIN + mail, KHÔNG tạo session (trả sessionToken = "" , mode JOIN_REQUESTED);
  // !joinExisting && org chưa có → user + org (planCode TRIAL) + membership OWNER ACTIVE + session (org) + token VERIFY_EMAIL + mail xác thực; org đã có mà !joinExisting → TAX_CODE_EXISTS
login(deps, input: LoginInput, meta: { ip }) → Result<{ sessionToken: string }>
  // RATE_LIMITED; user không có hoặc sai mật khẩu → INVALID_CREDENTIALS (cùng thông điệp); membership ACTIVE đầu tiên → session; không có ACTIVE: INVITED → MEMBERSHIP_PENDING, DISABLED → MEMBERSHIP_DISABLED, không có mà có join_request PENDING → MEMBERSHIP_PENDING, còn lại NO_ORGANIZATION
logout(deps, sessionToken) → Result<void>                       // xóa session nếu có; luôn ok
getSession(deps, sessionToken) → Result<{ ctx: Ctx; session: Session (DTO) }>   // UNAUTHENTICATED nếu không có/hết hạn; gia hạn khi shouldExtend; Member.lastActiveAt từ sessions.lastSeenAt; Organization.plan/usage: plan từ bảng plans (deps.plans.get(code)) – usage tạm 0 (billing GĐ 6), renewsAt = createdAt + 30 ngày
lookupTaxCode(deps, taxCode) → Result<CompanyLookup>            // existing = orgs.findByTaxCode != null; found từ taxRegistry; MST sai định dạng → VALIDATION
verifyEmail(deps, token) → Result<void>                          // TOKEN_INVALID
requestPasswordReset(deps, email, meta) → Result<void>           // luôn ok (không lộ email); gửi mail nếu có user; RATE_LIMITED
resetPassword(deps, { token, password }) → Result<void>          // TOKEN_INVALID; cập nhật hash; markUsed
acceptInvite(deps, { token, name, password }) → Result<{ sessionToken }>  // TOKEN_INVALID; user.name/password set, emailVerifiedAt = now; membership INVITED → ACTIVE; session
```
Thêm `DomainErrorCode`: `MEMBERSHIP_PENDING | MEMBERSHIP_DISABLED | NO_ORGANIZATION | UNAUTHENTICATED` (sửa `shared/errors.ts`). `IdentityDeps` thêm `plans: { get(code): Promise<{ code; name; dossiersPerMonth; pagesPerDossier } | null> }`.

- [ ] **Step 1: Test (fail trước)** – `__tests__/auth.test.ts` với `InMemoryIdentityUow`, `FakeHasher` (hash = "h:"+p), `InMemoryRateLimiter`, `RecordingMailer`, `FakeTaxRegistry`, `fixedClock`, `sequentialIdGen`, `random = () => Buffer.alloc(32, 7)`:
  - register MST mới → mode CREATED_ORG, có org planCode TRIAL, membership OWNER ACTIVE, 1 mail "Xác thực email" tới user, session hợp lệ (getSession ok, role OWNER).
  - register email trùng → EMAIL_TAKEN.
  - register joinExisting với MST đã có → JOIN_REQUESTED, join_request PENDING, notification cho OWNER của org, không session.
  - register !joinExisting với MST đã có → TAX_CODE_EXISTS.
  - login đúng → token; getSession trả user.id, org.taxCode đúng, role.
  - login sai mật khẩu và login email không tồn tại → cùng code INVALID_CREDENTIALS và cùng message.
  - login 11 lần sai liên tiếp → lần 11 RATE_LIMITED.
  - login user DISABLED → MEMBERSHIP_DISABLED; user chỉ có join_request PENDING → MEMBERSHIP_PENDING.
  - getSession token hết hạn (clock + 31 ngày) → UNAUTHENTICATED; token còn 10 ngày → được gia hạn (expiresAt tăng).
  - logout rồi getSession → UNAUTHENTICATED.
  - verifyEmail: token đúng → emailVerifiedAt set; dùng lần 2 → TOKEN_INVALID.
  - requestPasswordReset email lạ → ok, không mail; email có → 1 mail; resetPassword với token → login bằng mật khẩu mới ok, mật khẩu cũ INVALID_CREDENTIALS.
  - acceptInvite (seed membership INVITED + token INVITE) → ACTIVE + session; token hết hạn → TOKEN_INVALID.
  - **org khác**: getSession của user org_b không trả dữ liệu org_a (ctx.orgId = org_b).
- [ ] **Step 2: Run** → FAIL. **Step 3: Viết use case** (mỗi file một hàm, `requireRole` không cần ở nhóm auth). Mail template tiếng Việt trong `_mail-templates.ts` với link `${appUrl}/verify-email?token=`, `/reset-password?token=`, `/accept-invite?token=`.
- [ ] **Step 4: Run** `pnpm --filter @kb/core test src/modules/identity` → PASS. **Step 5: Sẵn sàng commit** – `feat(identity): use case auth`.

---

### Task 5: Use case tổ chức, thành viên, chứng thư, thông báo, yêu cầu tham gia

**Files:** `application/{list-members,invite-member,change-member-role,set-member-disabled,get-organization,update-organization,update-suspect-threshold,list-certificates,add-certificate,remove-certificate,set-default-certificate,list-notifications,mark-all-notifications-read,list-join-requests,approve-join-request}.ts`, `__tests__/org.test.ts`

**Interfaces (Produces):** mọi hàm `(deps, ctx: Ctx, input) → Result<…>`:
```ts
listMembers → Member[]  (ACTIVE/INVITED/DISABLED; lastActiveAt từ sessions)
inviteMember({email, role}) → Member        // ADMIN+; email đã là thành viên org → DUPLICATE (thêm code); user chưa tồn tại → tạo user với passwordHash = hasher.hash(randomToken) & name từ email; membership INVITED; token INVITE 7 ngày; mail
changeMemberRole(userId, role) → Member     // canChangeRole; NOT_FOUND
setMemberDisabled(userId, disabled) → Member // canDisable
getOrganization → Organization (DTO như getSession)
updateOrganization(OrgProfileInput) → Organization   // ADMIN+
updateSuspectThreshold(threshold) → Organization     // ADMIN+
listCertificates → DigitalCertificate[]; addCertificate(input) → DigitalCertificate (subject = org.name; isDefault nếu là cái đầu); removeCertificate(id) (FORBIDDEN nếu isDefault: "Chọn chứng thư mặc định khác trước khi xóa"); setDefaultCertificate(id)  // ADMIN+
listNotifications → Notification[] (mới nhất trước, tối đa 50); markAllNotificationsRead → void
listJoinRequests → JoinRequest[] (ADMIN+); approveJoinRequest(id) → Member  // membership DECLARANT ACTIVE; notification cho người xin; mail
```
Thêm `DomainErrorCode`: `DUPLICATE`.

- [ ] **Step 1: Test (fail trước)** `__tests__/org.test.ts`: listMembers trả 6 người seed đúng status; invite ok + mail + DUPLICATE khi trùng + VIEWER mời → FORBIDDEN; changeRole DECLARANT→APPROVER ok, đổi OWNER → FORBIDDEN; disable OWNER → FORBIDDEN, tự khóa → FORBIDDEN, khóa người khác ok; updateOrganization tên rỗng bị chặn ở contract (không test ở đây) và VIEWER → FORBIDDEN; certificates: add đầu tiên isDefault, remove default → FORBIDDEN, setDefault đổi đúng; notifications: markAllRead; approveJoinRequest → membership ACTIVE + notification; **org khác**: ctx org_b gọi listMembers không thấy thành viên org_a; removeCertificate id của org_a từ ctx org_b → NOT_FOUND.
- [ ] **Step 2–4:** viết, chạy `pnpm --filter @kb/core test src/modules/identity` → PASS. **Step 5: Sẵn sàng commit** – `feat(identity): use case tổ chức/thành viên/chứng thư/thông báo`.

---

### Task 6: Infrastructure identity (Drizzle UoW, Argon2, Redis rate limit, AES, Mailer, FakeTaxRegistry) + module index

**Files:**
- Create: `infrastructure/drizzle-uow.ts`, `infrastructure/drizzle-uow.int.test.ts`, `argon2-hasher.ts`, `redis-rate-limiter.ts`, `in-memory-rate-limiter.ts` (chuyển từ application/test → infrastructure để dùng cả dev), `aes-secret-store.ts` (+ test), `mailer.ts` (ConsoleMailer, SmtpMailer), `fake-tax-registry.ts`, `infrastructure/index.ts`, `modules/identity/index.ts`
- Modify: `packages/core/package.json` (+ `ioredis`, `nodemailer`, `@types/nodemailer`)

**Interfaces (Produces):**
```ts
new DrizzleIdentityUow(db: Db): IdentityUow         // system → withSystem; asUser → withUser; asOrg → withCtx; repos bound to tx
Argon2Hasher: PasswordHasher
new RedisRateLimiter(redis): RateLimiter             // key `rl:${key}`: INCR; nếu = 1 → EXPIRE window; allowed = count <= limit
new InMemoryRateLimiter(clock): RateLimiter
new AesSecretStore(masterKeyBase64, keyVersion = 1): SecretStore   // AES-256-GCM, iv 12 byte, ciphertext = base64(iv|tag|data)
ConsoleMailer: in `[mail] to=… subject=…` + text; SmtpMailer(url): nodemailer createTransport(url)
FakeTaxRegistryLookup: MST đuôi "000" → not found; còn lại → { found, name: `CÔNG TY TNHH MST ${code}`, address: "Địa chỉ theo đăng ký thuế (dữ liệu giả)" }
createIdentityInfrastructure({ db, redis, env, clock }) → IdentityDeps   // chọn mailer theo env.MAIL, rate limiter Redis
index.ts: export * use case + types + createIdentityInfrastructure? → KHÔNG: index chỉ export use case/kiểu + `type IdentityDeps`; infrastructure export qua "./infrastructure/index.ts" (package exports `./modules/*/infrastructure`)
```
Lưu ý `plans` repo: `DrizzleIdentityUow` thêm `plans.get(code)` vào `IdentityRepos`? → Để `IdentityDeps.plans` là object riêng (`DrizzlePlansReader(db)`), không qua uow (bảng không RLS).

- [ ] **Step 1: Test int (fail trước)** `drizzle-uow.int.test.ts`: dùng `startTestDb` + `runSeed`; qua `DrizzleIdentityUow`: `system(r => r.users.findByEmail("chau.le@anphat-demo.vn"))` có; `asOrg(org_anphat, usr_chau, r => r.memberships.listByOrg(...))` → 6; `asOrg(org_khac)` → `certificates.list(org_anphat)` → [] (RLS); `sessions.insert` qua system rồi `findByTokenHash` ok; `asUser(usr_chau)` thấy session của mình, không thấy của usr_ha; `authTokens.findValid` bỏ qua token hết hạn/đã dùng; `notifications.markAllRead` chỉ ảnh hưởng user; `AesSecretStore` encrypt/decrypt round-trip và ciphertext khác nhau mỗi lần; `RedisRateLimiter` – dùng `ioredis-mock`? → không thêm dep: test rate limiter bằng Redis thật từ compose nếu `REDIS_URL` có, else skip (`it.skipIf(!process.env.REDIS_URL)`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Viết infrastructure.** `pnpm install` sau khi thêm dep.
- [ ] **Step 4: Run** `pnpm --filter @kb/core test src/modules/identity && pnpm lint` → PASS (depcruise: infrastructure chỉ import `db/schema/identity.ts` + `shared.ts`; `plans` bảng ở `schema/plans.ts` → cho phép thêm: sửa rule `module-infra-own-schema` `pathNot` thêm `schema/plans\\.ts`).
- [ ] **Step 5: Sẵn sàng commit** – `feat(identity): infrastructure Drizzle/Argon2/Redis/AES/mailer`.

---

### Task 7: Module integration (trạng thái kết nối) và billing (gói) tối thiểu

**Files:**
- Create: `modules/integration/{application/ports.ts, application/list-integrations.ts, application/test-integration.ts, infrastructure/{drizzle-status-repo.ts,index.ts}, index.ts}` + `application/__tests__/integration.test.ts`
- Create: `modules/billing/{application/ports.ts, application/get-plan-usage.ts, infrastructure/{drizzle-plan-repo.ts,index.ts}, index.ts}` + test
- Modify: `.dependency-cruiser.cjs` (`module-infra-own-schema` cho phép `schema/plans.ts` với billing/identity)

**Interfaces (Produces):**
```ts
// integration
type IntegrationProbe = { kind: IntegrationId; probe(): Promise<{ ok: boolean; detail: string }> }
listIntegrations(deps, ctx) → Integration[]      // 4 mục cố định (name/description như mock seed) + status từ repo (mặc định: AI_PROVIDER CONNECTED nếu env fake/claude; CUSTOMS_HUB NOT_CONFIGURED khi chưa có secret VNACCS và gateway fake → "CONNECTED (sandbox giả lập)"; HSCODEPRO fake → CONNECTED "giả lập"; EINVOICE NOT_CONFIGURED)
testIntegration(deps, ctx, kind) → Integration    // ADMIN+; gọi probe tương ứng; CUSTOMS_HUB fake: lỗi nếu chứng thư mặc định < 30 ngày (giống mock, qua port `certificates.default(orgId)` nhận từ identity index); ghi integration_status; NOT_CONFIGURED → err INTEGRATION_NOT_CONFIGURED "Kết nối chưa được cấu hình – liên hệ quản trị KhaiBáo AI để bật"
// billing
getPlanUsage(deps, ctx) → { plan: Organization["plan"]; usage: Organization["usage"] }   // usage = 0 (GĐ 6 thay); renewsAt = đầu tháng sau
```
`identity.getSession/getOrganization` dùng `deps.plans` (billing reader) – giữ ở identity để không vòng phụ thuộc; billing module chỉ export `getPlanUsage` cho route `GET org/usage`.

- [ ] **Step 1: Test** (fail trước): listIntegrations trả 4 mục đúng id; testIntegration với probe giả ok → CONNECTED + lastCheckedAt; probe fail → ERROR + detail; EINVOICE → INTEGRATION_NOT_CONFIGURED; VIEWER → FORBIDDEN; org khác không thấy status.
- [ ] **Step 2–4:** viết, test PASS, lint PASS. **Step 5: Sẵn sàng commit** – `feat(integration,billing): trạng thái kết nối và gói tối thiểu`.

---

### Task 8: Web – session, wrapper route, proxy, route handler auth/org/notifications/dev

**Files:**
- Create: `apps/web/src/lib/server/cookies.ts`, `lib/server/auth.ts`, `lib/server/route.ts` (+ `route.test.ts`), `apps/web/src/proxy.ts` (+ `proxy.test.ts`)
- Create route: `app/api/auth/{register,login,logout,session,lookup-tax-code,verify-email,password/forgot,password/reset,invites/accept}/route.ts`; `app/api/org/route.ts` (GET/PATCH), `org/suspect-threshold`, `org/members` (GET, POST invite), `org/members/[id]/role`, `org/members/[id]/disabled`, `org/join-requests` (GET), `org/join-requests/[id]/approve`, `org/integrations` (GET), `org/integrations/[id]/test`, `org/certificates` (GET/POST), `org/certificates/[id]` (DELETE), `org/certificates/[id]/default`, `org/usage`; `app/api/notifications/route.ts`, `notifications/read-all`; `app/api/dev/reset-demo`
- Modify: `apps/web/src/container.ts` (+ `identity: IdentityDeps`, `integration`, `billing`), `apps/web/next.config.ts` (`serverExternalPackages` + `nodemailer`)

**Interfaces (Produces):**
```ts
// cookies.ts
SESSION_COOKIE = "kb_session"; sessionCookieOptions(secure): { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 30*86400 }
// auth.ts
requireSession(): Promise<{ ctx: Ctx; session: Session }>       // đọc cookies() của Next; không có/hết hạn → throw new HttpError(401, "UNAUTHENTICATED", "Chưa đăng nhập")
// route.ts
class HttpError extends Error { constructor(public status, public code, message) }
route(handler: (req: NextRequest, params: Record<string,string>) => Promise<Response | unknown>): (req, ctx) => Promise<Response>
  // bắt: HttpError → status; ZodError → 400 {code:"VALIDATION", message:"Dữ liệu không hợp lệ", issues}; DomainError (qua fromResult) → bảng mã; lỗi khác → 500 {code:"INTERNAL"} + console.error
fromResult<T>(r: Result<T>): T                                   // ok → value; err → throw DomainErrorHttp
STATUS_BY_CODE: NOT_FOUND 404, FORBIDDEN 403, UNAUTHENTICATED 401, RATE_LIMITED 429, VALIDATION 400, EMAIL_TAKEN/TAX_CODE_EXISTS/DUPLICATE/ALREADY_SUBMITTED 409, INVALID_CREDENTIALS 401, MEMBERSHIP_PENDING/MEMBERSHIP_DISABLED/NO_ORGANIZATION/EMAIL_NOT_VERIFIED 403, TOKEN_INVALID 400, còn lại 422
json(req) → parse body JSON (lỗi → 400 VALIDATION); parseBody(req, schema) → schema.parse(await json(req))
clientIp(req) → x-forwarded-for đầu tiên | "0.0.0.0"
// proxy.ts
export function proxy(req: NextRequest): NextResponse   // nếu NEXT_PUBLIC_DATA_SOURCE !== "http" → next(); đường dẫn /login,/register,/verify-email,/reset-password,/accept-invite,/api/*,/_next/*,/favicon… → next(); không có cookie kb_session → redirect `/login?next=<path>`
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"] }
```
Route mẫu (`app/api/auth/login/route.ts`):
```ts
import { LoginInputSchema } from "@kb/contracts";
import { login } from "@kb/core/modules/identity";
import { NextResponse } from "next/server";
import { getContainer } from "@/container";
import { clientIp, fromResult, parseBody, route } from "@/lib/server/route";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/cookies";

export const POST = route(async (req) => {
  const c = getContainer();
  const input = await parseBody(req, LoginInputSchema);
  const { sessionToken } = fromResult(await login(c.identity, input, { ip: clientIp(req) }));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(c.env.APP_URL.startsWith("https")));
  return res;
});
```
Các route org/* : `const { ctx } = await requireSession();` rồi gọi use case với `c.identity`. `dev/reset-demo`: chỉ khi `env.NODE_ENV !== "production"` → `runSeed(env.DATABASE_ADMIN_URL)` → `{ok:true}`; production → 404.

- [ ] **Step 1: Test (fail trước)** `route.test.ts`: handler ném `HttpError(401)` → JSON `{code:"UNAUTHENTICATED"}` 401; handler trả object → 200 JSON; `parseBody` với body sai → 400 `VALIDATION` có `issues`; `fromResult(err(NOT_FOUND))` → 404; lỗi lạ → 500 `INTERNAL` không lộ message. `proxy.test.ts`: nguồn mock → next; nguồn http + `/dossiers` không cookie → redirect `/login?next=%2Fdossiers`; có cookie → next; `/api/auth/login` không cookie → next.
- [ ] **Step 2: Run** `pnpm --filter @kb/web test` → FAIL. **Step 3: Viết** server helpers, proxy, container wiring (`identity: createIdentityInfrastructure({db, redis, env, clock: systemClock})`, `integration`, `billing`), tất cả route.
- [ ] **Step 4: Run** test web PASS; `pnpm --filter @kb/web typecheck && pnpm lint` PASS. Chạy thật: `pnpm --filter @kb/web build && pnpm --filter @kb/web start` (bản `.next` mặc định mock – các route vẫn hoạt động vì route handler không phụ thuộc cờ): `curl -c /tmp/c.txt -X POST localhost:3100/api/auth/login -H 'content-type: application/json' -d '{"email":"chau.le@anphat-demo.vn","password":"demo1234"}'` → `{ok:true}` + Set-Cookie; `curl -b /tmp/c.txt localhost:3100/api/auth/session` → JSON user/org; `curl localhost:3100/api/org/members` không cookie → 401.
- [ ] **Step 5: Sẵn sàng commit** – `feat(web): route handler auth/org/notifications, session cookie, proxy`.

---

### Task 9: FE nối API thật (session, settings), chỉnh nhỏ màn hình, kiểm tra Playwright

**Files:**
- Create: `apps/web/src/api/http/session.ts`, `apps/web/src/api/http/settings.ts`
- Modify: `apps/web/src/api/session.ts`, `apps/web/src/api/settings.ts` (pick từng hàm), `features/auth/register-page.tsx` (truyền `password`), `features/shell/app-shell.tsx` (Đăng xuất gọi `logout()` rồi push `/login`; "Khôi phục dữ liệu mẫu" gọi `resetMockData()` của nguồn đang dùng), `apps/web/src/mocks/api/session.ts` (`register` nhận thêm `password` để cùng chữ ký; `logout` mock = no-op)
- Modify docs: `apps/web/CLAUDE.md` (mục nguồn dữ liệu: đã có http cho session/settings), `README.md` (đăng nhập thật), `docs/BACKEND-TODO.md` (N2 nếu còn)

**Interfaces (Produces – `api/http/session.ts`):** cùng chữ ký mock: `getSession()` → `apiGet("auth/session", SessionSchema)`; `listNotifications()`; `markAllNotificationsRead()`; `login(email, password)` → `apiPost("auth/login", {email, password})` (ném `ApiError` – LoginPage hiện thông báo chung); `logout()`; `resetMockData()` → `apiPost("dev/reset-demo", {})`; `listMembers()`; `lookupTaxCode(taxCode)` → `apiGet("auth/lookup-tax-code?taxCode=…", CompanyLookupSchema)`; `register(input)` → `apiPost("auth/register", input)`. `settings.ts`: `getOrganization`, `updateOrganization`, `updateSuspectThreshold`, `listMembers`, `inviteMember`, `changeMemberRole`, `setMemberDisabled`, `listIntegrations`, `testIntegration`, `listCertificates`, `setDefaultCertificate`, `addCertificate`, `removeCertificate` → route tương ứng §5 spec. `api/session.ts`:
```ts
import * as mock from "@/mocks/api/session";
import * as http from "./http/session";
import { pick } from "@/lib/data-source";
export const sessionKeys = mock.sessionKeys;           // key giống nhau
export const memberKeys = mock.memberKeys;
export type { CompanyLookup } from "@kb/contracts";
export const getSession = pick(mock.getSession, http.getSession);
… (mỗi hàm một dòng)
```

- [ ] **Step 1:** Viết `http/session.ts`, `http/settings.ts`, selector, chỉnh 3 file FE. `pnpm --filter @kb/web typecheck && pnpm lint && pnpm --filter @kb/web test` → PASS (mock vẫn chạy: test không đổi).
- [ ] **Step 2: Kiểm tra bằng trình duyệt (bắt buộc – có đổi hành vi màn hình):** build `NEXT_PUBLIC_DATA_SOURCE=http NEXT_DIST_DIR=.next-build pnpm build`, `NEXT_DIST_DIR=.next-build pnpm start`; worker không cần. Dùng Playwright MCP: (1) `/dossiers` chưa đăng nhập → chuyển về `/login`; (2) đăng nhập `chau.le@anphat-demo.vn / demo1234` → về `/`, menu trái hiện tên "Lê Minh Châu"; (3) `/settings?tab=members` hiện 6 thành viên, mời `test.user@anphat-demo.vn` vai trò Xem → dòng mới INVITED, Mailpit (`localhost:8025`) nhận mail (nếu `MAIL=smtp`) hoặc log console; (4) tab Chứng thư số: thêm chứng thư → hiện; (5) tab Doanh nghiệp: đổi số điện thoại → lưu → reload giữ; (6) Đăng xuất → về `/login`, gọi `/api/auth/session` → 401; (7) đăng ký MST mới `0101234567` → tạo org, vào `/` thấy tên công ty giả; (8) chụp ảnh sáng/tối desktop + mobile màn Tài khoản (theo quy ước CLAUDE.md). Dọn: dừng server, xóa `.next-build`.
- [ ] **Step 3: Cập nhật tài liệu.** `pnpm typecheck && pnpm lint && pnpm test` → PASS.
- [ ] **Step 4: Sẵn sàng commit** – `feat(web): màn đăng nhập/đăng ký/tài khoản chạy API thật`.

---

## Self-review

- **Spec coverage §4.1:** register ✓ verifyEmail ✓ login ✓ logout ✓ getSession ✓ lookupTaxCode ✓ createOrganization (gộp trong register) ✓ requestJoin (gộp) ✓ approveJoin ✓ inviteMember ✓ acceptInvite ✓ changeMemberRole ✓ setMemberDisabled ✓ updateOrganization ✓ updateSuspectThreshold ✓ password reset ✓ certificates ✓ setOrgSecret/getOrgSecretStatus → **chưa có route** (SecretStore có; endpoint `PUT org/integrations/:id/secret` lùi sang GĐ 5 khi có FE nhập tài khoản VNACCS – ghi BACKEND-TODO). §5 nhóm auth/org/notifications ✓ (`GET org/usage` ✓). §3.5 cookie/Argon2/rate limit/secret ✓.
- **Placeholder:** test và chữ ký đầy đủ; mã implementation của use case/repo được viết lúc thực thi theo chữ ký và test đã nêu (ruling: plan GĐ 1 mô tả bằng chữ ký + test thay vì mã đầy đủ để kịp tiến độ; executor ghi ledger khi lệch).
- **Type consistency:** `IdentityDeps`/`IdentityUow` dùng thống nhất Task 3–8; `Session` DTO = `{user: Member, org: Organization}` khớp mock `getSession`; `Member.id = users.id` khớp `members-tab`.
- **Review Focus → test:** (1)(2)(3) Task 4; (4) Task 5; (5) Task 8.
