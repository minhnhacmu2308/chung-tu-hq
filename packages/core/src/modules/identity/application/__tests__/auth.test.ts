import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock, type Clock } from "../../../../shared/clock.js";
import { sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap, errCode } from "../../../../shared/result.js";
import { acceptInvite } from "../accept-invite.js";
import { getSession } from "../get-session.js";
import { login } from "../login.js";
import { logout } from "../logout.js";
import { lookupTaxCode } from "../lookup-tax-code.js";
import type { IdentityDeps } from "../ports.js";
import { register } from "../register.js";
import { requestPasswordReset } from "../request-password-reset.js";
import { resetPassword } from "../reset-password.js";
import { provisionStaffAccount, resendVerificationEmail } from "../staff-account.js";
import { FakeHasher, FakeTaxRegistry, InMemoryRateLimiter, RecordingMailer } from "../test/fakes.js";
import { InMemoryIdentityUow } from "../test/in-memory-uow.js";
import { verifyEmail } from "../verify-email.js";

const T0 = "2026-10-13T00:00:00.000Z";
const day = (n: number) => new Date(new Date(T0).getTime() + n * 86_400_000);
const META = { ip: "1.2.3.4" };

let uow: InMemoryIdentityUow;
let mailer: RecordingMailer;
let clock: Clock;
let deps: IdentityDeps;

beforeEach(() => {
  uow = new InMemoryIdentityUow().seed({
    plans: [{ code: "TRIAL", name: "Dùng thử", dossiersPerMonth: 10, pagesPerDossier: 20 }, { code: "PRO", name: "Chuyên nghiệp", dossiersPerMonth: 150, pagesPerDossier: 40 }],
    orgs: [
      { id: "org_a", taxCode: "0316789012", name: "AN PHÁT", address: "HP", phone: "", planCode: "PRO", suspectThreshold: "BALANCED", fourEyes: false, createdAt: day(-40) },
      { id: "org_b", taxCode: "0100000002", name: "B", address: "", phone: "", planCode: "TRIAL", suspectThreshold: "BALANCED", fourEyes: false, createdAt: day(-5) },
    ],
    users: [
      { id: "usr_chau", email: "chau.le@anphat-demo.vn", passwordHash: "h:demo1234", name: "Lê Minh Châu", emailVerifiedAt: day(-40), createdAt: day(-40) },
      { id: "usr_quang", email: "quang@anphat-demo.vn", passwordHash: "h:demo1234", name: "Quang", emailVerifiedAt: day(-40), createdAt: day(-40) },
      { id: "usr_b", email: "b@b.vn", passwordHash: "h:demo1234", name: "B", emailVerifiedAt: day(-5), createdAt: day(-5) },
    ],
    memberships: [
      { id: "mem_chau", orgId: "org_a", userId: "usr_chau", role: "OWNER", status: "ACTIVE", invitedBy: null },
      { id: "mem_quang", orgId: "org_a", userId: "usr_quang", role: "VIEWER", status: "DISABLED", invitedBy: null },
      { id: "mem_b", orgId: "org_b", userId: "usr_b", role: "OWNER", status: "ACTIVE", invitedBy: null },
    ],
  });
  mailer = new RecordingMailer();
  clock = fixedClock(T0);
  deps = {
    uow, plans: uow, hasher: new FakeHasher(), rateLimiter: new InMemoryRateLimiter(clock), mailer, taxRegistry: new FakeTaxRegistry(),
    clock, idGen: sequentialIdGen(), appUrl: "http://localhost:3100", random: (n) => Buffer.alloc(n, 7),
  };
});

describe("register", () => {
  it("MST mới: tạo org TRIAL, membership OWNER, mail xác thực, session dùng được, gọi onOrgCreated", async () => {
    const created: { orgId: string; userId: string }[] = [];
    deps.onOrgCreated = async (o) => void created.push(o);
    const r = unwrap(await register(deps, { email: "an@minhkhang.vn", name: "Nguyễn Văn An", password: "matkhau123", taxCode: "0101234567", joinExisting: false }, META));
    expect(r.mode).toBe("CREATED_ORG");
    const org = uow.data.orgs.find((o) => o.taxCode === "0101234567");
    expect(org?.planCode).toBe("TRIAL");
    expect(uow.data.memberships.find((m) => m.orgId === org?.id)).toMatchObject({ role: "OWNER", status: "ACTIVE" });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.subject).toMatch(/Xác thực email/);
    const s = unwrap(await getSession(deps, r.sessionToken));
    expect(s.ctx.role).toBe("OWNER");
    expect(s.session.org.taxCode).toBe("0101234567");
    expect(s.session.org.plan.code).toBe("TRIAL");
    expect(created).toEqual([{ orgId: org?.id, userId: uow.data.memberships.find((m) => m.orgId === org?.id)?.userId }]);
  });
  it("email trùng → EMAIL_TAKEN", async () => {
    const r = await register(deps, { email: "chau.le@anphat-demo.vn", name: "X Y", password: "matkhau123", taxCode: "0101234567", joinExisting: false }, META);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("EMAIL_TAKEN");
  });
  it("joinExisting với MST đã có → JOIN_REQUESTED, thông báo cho OWNER, không có session", async () => {
    const r = unwrap(await register(deps, { email: "moi@anphat-demo.vn", name: "Người Mới", password: "matkhau123", taxCode: "0316789012", joinExisting: true }, META));
    expect(r.mode).toBe("JOIN_REQUESTED");
    expect(r.sessionToken).toBe("");
    expect(uow.data.joinRequests).toHaveLength(1);
    expect(uow.data.notifications.some((n) => n.userId === "usr_chau" && n.orgId === "org_a")).toBe(true);
  });
  it("không joinExisting nhưng MST đã có → TAX_CODE_EXISTS", async () => {
    const r = await register(deps, { email: "moi@anphat-demo.vn", name: "Người Mới", password: "matkhau123", taxCode: "0316789012", joinExisting: false }, META);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("TAX_CODE_EXISTS");
  });
});

describe("login / getSession / logout", () => {
  it("đúng mật khẩu → session có user, org, vai trò", async () => {
    const { sessionToken } = unwrap(await login(deps, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META));
    const s = unwrap(await getSession(deps, sessionToken));
    expect(s.session.user.id).toBe("usr_chau");
    expect(s.session.user.role).toBe("OWNER");
    expect(s.session.org.taxCode).toBe("0316789012");
    expect(s.session.org.plan.name).toBe("Chuyên nghiệp");
    expect(s.ctx.orgId).toBe("org_a");
  });
  it("sai mật khẩu và email không tồn tại → cùng INVALID_CREDENTIALS, cùng thông điệp", async () => {
    const a = await login(deps, { email: "chau.le@anphat-demo.vn", password: "sai-roi-1" }, META);
    const b = await login(deps, { email: "khong-co@x.vn", password: "sai-roi-1" }, META);
    expect(a.ok && b.ok).toBe(false);
    if (!a.ok && !b.ok) {
      expect(a.error.code).toBe("INVALID_CREDENTIALS");
      expect(b.error.code).toBe("INVALID_CREDENTIALS");
      expect(a.error.message).toBe(b.error.message);
    }
  });
  it("11 lần sai liên tiếp → RATE_LIMITED", async () => {
    let last: Awaited<ReturnType<typeof login>> | undefined;
    for (let i = 0; i < 11; i++) last = await login(deps, { email: "chau.le@anphat-demo.vn", password: "sai-roi-1" }, META);
    expect(last?.ok).toBe(false);
    if (last && !last.ok) expect(last.error.code).toBe("RATE_LIMITED");
  });
  it("đăng nhập đúng nhiều lần không bị khóa; đăng nhập đúng xóa bộ đếm các lần sai trước đó", async () => {
    for (let i = 0; i < 12; i++) expect((await login(deps, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META)).ok).toBe(true);
    for (let i = 0; i < 9; i++) await login(deps, { email: "chau.le@anphat-demo.vn", password: "sai-roi-1" }, META);
    expect((await login(deps, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META)).ok).toBe(true);
    for (let i = 0; i < 9; i++) expect(errCode(await login(deps, { email: "chau.le@anphat-demo.vn", password: "sai-roi-1" }, META))).toBe("INVALID_CREDENTIALS");
  });
  it("doanh nghiệp bị tạm khóa: đăng nhập → ORG_SUSPENDED, phiên đang có hết hiệu lực; mở lại thì dùng tiếp", async () => {
    const { sessionToken } = unwrap(await login(deps, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META));
    uow.data.orgs.find((o) => o.id === "org_a")!.status = "SUSPENDED";
    expect(errCode(await getSession(deps, sessionToken))).toBe("UNAUTHENTICATED");
    expect(errCode(await login(deps, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META))).toBe("ORG_SUSPENDED");
    uow.data.orgs.find((o) => o.id === "org_a")!.status = "ACTIVE";
    expect((await getSession(deps, sessionToken)).ok).toBe(true);
  });
  it("quản trị viên hệ thống không thuộc doanh nghiệp: đăng nhập được, phiên không có org (API của khách vẫn 401); bị khóa → MEMBERSHIP_DISABLED", async () => {
    uow.data.users.push({ id: "usr_ops", email: "ops@khaibao.vn", passwordHash: "h:demo1234", name: "Ops", emailVerifiedAt: day(-1), createdAt: day(-1) });
    expect(errCode(await login(deps, { email: "ops@khaibao.vn", password: "demo1234" }, META))).toBe("NO_ORGANIZATION");
    let status: "ACTIVE" | "DISABLED" = "ACTIVE";
    deps.platformStaff = async (id) => (id === "usr_ops" ? { status } : null);
    const { sessionToken } = unwrap(await login(deps, { email: "ops@khaibao.vn", password: "demo1234" }, META));
    expect(uow.data.sessions.at(-1)).toMatchObject({ userId: "usr_ops", orgId: null });
    expect(errCode(await getSession(deps, sessionToken))).toBe("UNAUTHENTICATED");
    status = "DISABLED";
    expect(errCode(await login(deps, { email: "ops@khaibao.vn", password: "demo1234" }, META))).toBe("MEMBERSHIP_DISABLED");
  });
  it("tài khoản cho quản trị viên mới: email mới → tạo user + liên kết đặt mật khẩu 7 ngày; email đã có → dùng lại; gửi lại xác thực", async () => {
    const created = unwrap(await provisionStaffAccount(deps, { email: "moi@khaibao.vn", name: "Người Mới" }));
    expect(created.created).toBe(true);
    expect(mailer.sent.at(-1)?.to).toBe("moi@khaibao.vn");
    expect(mailer.sent.at(-1)?.text).toMatch(/reset-password\?token=/);
    expect(uow.data.authTokens.at(-1)?.expiresAt.getTime()).toBe(new Date(T0).getTime() + 7 * 24 * 3_600_000);
    expect(unwrap(await provisionStaffAccount(deps, { email: "chau.le@anphat-demo.vn", name: "X" }))).toEqual({ userId: "usr_chau", created: false });
    expect(errCode(await resendVerificationEmail(deps, "usr_chau"))).toBe("CONFLICT");
    uow.data.users.find((u) => u.id === "usr_b")!.emailVerifiedAt = null;
    unwrap(await resendVerificationEmail(deps, "usr_b"));
    expect(mailer.sent.at(-1)).toMatchObject({ to: "b@b.vn" });
    expect(errCode(await resendVerificationEmail(deps, "usr_none"))).toBe("NOT_FOUND");
  });
  it("thành viên DISABLED → MEMBERSHIP_DISABLED; chỉ có yêu cầu tham gia → MEMBERSHIP_PENDING", async () => {
    const d = await login(deps, { email: "quang@anphat-demo.vn", password: "demo1234" }, META);
    if (!d.ok) expect(d.error.code).toBe("MEMBERSHIP_DISABLED");
    else throw new Error("phải bị từ chối");
    uow.seed({
      users: [{ id: "usr_p", email: "p@x.vn", passwordHash: "h:demo1234", name: "P", emailVerifiedAt: null, createdAt: day(0) }],
      joinRequests: [{ id: "jr_1", orgId: "org_a", userId: "usr_p", status: "PENDING", createdAt: day(0) }],
    });
    const p = await login(deps, { email: "p@x.vn", password: "demo1234" }, META);
    if (!p.ok) expect(p.error.code).toBe("MEMBERSHIP_PENDING");
    else throw new Error("phải bị từ chối");
    expect(uow.data.sessions).toHaveLength(0);
  });
  it("token hết hạn → UNAUTHENTICATED; token còn 10 ngày → được gia hạn", async () => {
    const { sessionToken } = unwrap(await login(deps, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META));
    const later = { ...deps, clock: fixedClock(day(31).toISOString()) };
    const r = await getSession(later, sessionToken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNAUTHENTICATED");
    const d20 = { ...deps, clock: fixedClock(day(20).toISOString()) };
    unwrap(await getSession(d20, sessionToken));
    expect(uow.data.sessions[0]?.expiresAt.getTime()).toBe(day(50).getTime());
  });
  it("logout rồi getSession → UNAUTHENTICATED", async () => {
    const { sessionToken } = unwrap(await login(deps, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META));
    unwrap(await logout(deps, sessionToken));
    expect((await getSession(deps, sessionToken)).ok).toBe(false);
  });
  it("user org B: ctx.orgId là org_b, không thấy org_a", async () => {
    const { sessionToken } = unwrap(await login(deps, { email: "b@b.vn", password: "demo1234" }, META));
    const s = unwrap(await getSession(deps, sessionToken));
    expect(s.ctx.orgId).toBe("org_b");
    expect(s.session.org.name).toBe("B");
  });
});

describe("lookupTaxCode", () => {
  it("MST của org đã có → existing true với tên trong hệ thống", async () => {
    expect(unwrap(await lookupTaxCode(deps, "0316 789 012"))).toEqual({ found: true, existing: true, name: "AN PHÁT", address: "HP" });
  });
  it("MST mới → existing false, tên từ cơ quan thuế; đuôi 000 → không tìm thấy; sai định dạng → VALIDATION", async () => {
    expect(unwrap(await lookupTaxCode(deps, "0101234567"))).toMatchObject({ found: true, existing: false });
    expect(unwrap(await lookupTaxCode(deps, "0101234000"))).toEqual({ found: false });
    const r = await lookupTaxCode(deps, "123");
    if (!r.ok) expect(r.error.code).toBe("VALIDATION");
    else throw new Error("phải lỗi");
  });
});

describe("token một lần", () => {
  it("verifyEmail: đúng token → emailVerifiedAt; dùng lần 2 → TOKEN_INVALID", async () => {
    await register(deps, { email: "an@minhkhang.vn", name: "Nguyễn Văn An", password: "matkhau123", taxCode: "0101234567", joinExisting: false }, META);
    const token = mailer.sent[0]!.text.match(/token=([A-Za-z0-9_-]+)/)![1]!;
    unwrap(await verifyEmail(deps, token));
    expect(uow.data.users.find((u) => u.email === "an@minhkhang.vn")?.emailVerifiedAt).not.toBeNull();
    const again = await verifyEmail(deps, token);
    if (!again.ok) expect(again.error.code).toBe("TOKEN_INVALID");
    else throw new Error("phải lỗi");
  });
  it("quên mật khẩu: email lạ → ok không mail; email có → mail; đặt lại rồi đăng nhập bằng mật khẩu mới", async () => {
    unwrap(await requestPasswordReset(deps, "khong-co@x.vn", META));
    expect(mailer.sent).toHaveLength(0);
    unwrap(await requestPasswordReset(deps, "chau.le@anphat-demo.vn", META));
    expect(mailer.sent).toHaveLength(1);
    const token = mailer.sent[0]!.text.match(/token=([A-Za-z0-9_-]+)/)![1]!;
    unwrap(await resetPassword(deps, { token, password: "matkhaumoi1" }));
    expect((await login(deps, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META)).ok).toBe(false);
    expect((await login(deps, { email: "chau.le@anphat-demo.vn", password: "matkhaumoi1" }, META)).ok).toBe(true);
  });
  it("acceptInvite: membership INVITED → ACTIVE + session; token hết hạn → TOKEN_INVALID", async () => {
    uow.seed({
      users: [{ id: "usr_linh", email: "linh@anphat-demo.vn", passwordHash: "h:tam", name: "Linh", emailVerifiedAt: null, createdAt: day(0) }],
      memberships: [{ id: "mem_linh", orgId: "org_a", userId: "usr_linh", role: "DECLARANT", status: "INVITED", invitedBy: "usr_chau" }],
      authTokens: [
        { id: "tok_ok", userId: "usr_linh", orgId: "org_a", kind: "INVITE", tokenHash: "b1e2b6a2b0a6d1a5f5f1c8a5f9d6d1a7c4a7c3a8b1a3e7e5d5d1c9c2b8a2e3e7", expiresAt: day(7), usedAt: null },
      ],
    });
    // hash của raw "moi-123" phải khớp: dùng hàm thật để tạo hash
    const { hashToken } = await import("../../domain/token.js");
    uow.data.authTokens[0]!.tokenHash = hashToken("moi-123-raw-token-xx");
    const r = unwrap(await acceptInvite(deps, { token: "moi-123-raw-token-xx", name: "Đỗ Khánh Linh", password: "matkhau123" }));
    const s = unwrap(await getSession(deps, r.sessionToken));
    expect(s.session.user.name).toBe("Đỗ Khánh Linh");
    expect(uow.data.memberships.find((m) => m.id === "mem_linh")?.status).toBe("ACTIVE");
    const expired = { ...deps, clock: fixedClock(day(8).toISOString()) };
    uow.data.authTokens.push({ id: "tok_old", userId: "usr_linh", orgId: "org_a", kind: "INVITE", tokenHash: hashToken("cu"), expiresAt: day(7), usedAt: null });
    const e = await acceptInvite(expired, { token: "cu", name: "X Y", password: "matkhau123" });
    if (!e.ok) expect(e.error.code).toBe("TOKEN_INVALID");
    else throw new Error("phải lỗi");
  });
});
