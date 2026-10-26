// Khu Quản trị hệ thống trên Postgres thật: role kb_platform (BYPASSRLS) đọc xuyên doanh nghiệp, kb_app không đọc được bảng admin,
// quyền theo vai trò, nhật ký cùng transaction, tác động tới ứng dụng của khách (đăng nhập, hạn mức, thông báo).
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { DEMO_ORG_ID, runSeed } from "../db/seed/index.js";
import { startTestDb, type TestDb } from "../db/test-db.js";
import { systemClock } from "../shared/clock.js";
import { InMemoryJobQueue } from "../shared/queue.js";
import { ulidIdGen } from "../shared/ids.js";
import { errCode, unwrap } from "../shared/result.js";
import { changePassword, getSession, hashToken, listNotifications, login, provisionOrgAccount, provisionStaffAccount, register, requestPasswordReset, resendVerificationEmail, type IdentityDeps } from "../modules/identity/index.js";
import { FakeTaxRegistry, InMemoryRateLimiter, RecordingMailer } from "../modules/identity/application/test/fakes.js";
import { AesSecretStore, Argon2Hasher, DrizzleIdentityUow, DrizzlePlansReader } from "../modules/identity/infrastructure/index.js";
import {
  adjustOrgQuota, changeOrgPlan, changeStaffRole, createOrg, extendOrgTrial,
  draftEmailWithAi, getEmailCampaign, getMailSettings, listEmailSignatures, listEmailTemplates, previewEmailAudience, processEmailCampaign, saveEmailSignature,
  saveEmailTemplate, sendEmail, updateMailSettings, getAdminSession, getOrg, getOverview, getSystemHealth, getUsageReport, inviteStaff, listAudit, listOrgs,
  listPlans, listPlatformIntegrations, listSkillTemplates, listStaff, listUsers, reactivateOrg, resolveStaff, retryFailedJob, revokeUserSessions, sendAnnouncement,
  setSkillTemplatePublished, setStaffDisabled, setUserDisabled, suspendOrg, testPlatformIntegration, updateIntegrationKey, updatePlan, withdrawAnnouncement,
  confirmMfaSetup, resetStaffMfa, resolveStaffSession, startMfaSetup, verifyMfa,
  type AdminDeps, type FailedJobInfo, type StaffActor,
} from "../modules/admin/index.js";
import { createAdminInfrastructure, platformStaffOf, type DrizzleAdminUow } from "../modules/admin/infrastructure/index.js";
import { base32Decode, totp } from "../modules/admin/domain/totp.js";

let t: TestDb;
let appDb: Db;
let identity: IdentityDeps;
let admin: AdminDeps & { db: Db };
let mailer: RecordingMailer;
const failed: FailedJobInfo[] = [];
const retried: string[] = [];
const META = { ip: "127.0.0.1" };
const R = { reason: "Khách yêu cầu qua hotline" };

// Đồng hồ của module admin chạy nhanh 31 giây sau mỗi lần nhập mã 2FA → mỗi lần là một mã mới (mã đã dùng bị từ chối).
let skew = 0;
const adminClock = { now: () => new Date(Date.now() + skew) };
const secrets = new Map<string, string>();
const codeFor = (email: string) => totp(base32Decode(secrets.get(email)!), adminClock.now());

/** Đăng nhập + qua bước 2FA (thiết lập ở lần đầu) → quản trị viên dùng được API quản trị. */
async function staff(email: string): Promise<StaffActor> {
  const { sessionToken } = unwrap(await login(identity, { email, password: "demo1234" }, META));
  const s = unwrap(await resolveStaffSession(admin, sessionToken));
  skew += 31_000;
  if (!s.mfa.enrolled) {
    const setup = unwrap(await startMfaSetup(admin, sessionToken));
    secrets.set(email, setup.secret);
    unwrap(await confirmMfaSetup(admin, sessionToken, codeFor(email)));
  } else unwrap(await verifyMfa(admin, sessionToken, codeFor(email)));
  return unwrap(await resolveStaff(admin, sessionToken));
}

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  appDb = createDb(t.appUrl, { max: 4 });
  mailer = new RecordingMailer();
  identity = {
    uow: new DrizzleIdentityUow(appDb), plans: new DrizzlePlansReader(appDb), hasher: new Argon2Hasher(), rateLimiter: new InMemoryRateLimiter(systemClock), mailer,
    taxRegistry: new FakeTaxRegistry(), clock: systemClock, idGen: ulidIdGen, appUrl: "http://localhost:3100",
  };
  admin = createAdminInfrastructure({
    platformUrl: t.platformUrl,
    identity: {
      hashToken,
      sendPasswordReset: (email) => requestPasswordReset(identity, email, META),
      resendVerification: (id) => resendVerificationEmail(identity, id),
      provisionAccount: (i) => provisionStaffAccount(identity, i),
      provisionOrg: (i) => provisionOrgAccount(identity, i),
    },
    jobs: {
      stats: async () => [{ queue: "extract-document", waiting: 1, active: 0, failed: failed.length, completedToday: 3 }],
      failed: async (limit) => failed.slice(0, limit),
      retry: async (queue, id) => {
        const i = failed.findIndex((j) => j.queue === queue && j.id === id);
        if (i < 0) return false;
        failed.splice(i, 1);
        retried.push(id);
        return true;
      },
    },
    system: { services: async (now) => [{ id: "POSTGRES", name: "Cơ sở dữ liệu", status: "UP", detail: "ok", checkedAt: now.toISOString() }] },
    probe: { test: async (_id, key) => (key?.startsWith("good") ? { ok: true, detail: "Gọi thử thành công" } : { ok: false, detail: "401 – khóa bị từ chối" }) },
    vault: new AesSecretStore(Buffer.alloc(32, 9).toString("base64")),
    limiter: new InMemoryRateLimiter(systemClock),
    clock: adminClock,
  });
  identity.platformStaff = (userId) => platformStaffOf(admin.uow as DrizzleAdminUow, userId);
  // Doanh nghiệp thứ hai (gói dùng thử) để kiểm tra đọc xuyên doanh nghiệp và nhóm nhận thông báo.
  unwrap(await register(identity, { email: "an@minhkhang.vn", name: "Nguyễn Văn An", password: "matkhau123", taxCode: "0101234567", joinExisting: false }, META));
}, 120_000);

afterAll(async () => {
  await admin?.db.close();
  await appDb?.close();
  await t?.stop();
});

describe("ranh giới dữ liệu (ADR 0006)", () => {
  it("kb_app không đọc được bảng của khu quản trị; kb_platform đọc được mọi doanh nghiệp", async () => {
    const appRows = await appDb.execute(sql`select count(*)::int as n from platform_staff`);
    expect((appRows as unknown as { n: number }[])[0]!.n).toBe(0);
    const platformRows = await admin.db.execute(sql`select count(*)::int as n from platform_staff`);
    expect((platformRows as unknown as { n: number }[])[0]!.n).toBe(3);
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    expect(unwrap(await listOrgs(admin, bao)).map((o) => o.taxCode).sort()).toEqual(expect.arrayContaining(["0101234567", "0316789012"]));
  });
});

describe("phiên quản trị", () => {
  it("quản trị viên không thuộc doanh nghiệp đăng nhập được, phiên không có org; khách không có quyền quản trị → null / FORBIDDEN", async () => {
    const { sessionToken } = unwrap(await login(identity, { email: "bao.hoang@khaibao-demo.vn", password: "demo1234" }, META));
    expect(errCode(await getSession(identity, sessionToken))).toBe("UNAUTHENTICATED"); // API của khách
    expect(unwrap(await getAdminSession(admin, sessionToken))?.staff).toMatchObject({ email: "bao.hoang@khaibao-demo.vn", role: "SUPER_ADMIN", status: "ACTIVE" });
    expect(errCode(await resolveStaff(admin, sessionToken))).toBe("MFA_REQUIRED"); // chưa qua 2FA → mọi API quản trị bị chặn
    const chau = unwrap(await login(identity, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META)).sessionToken;
    expect(unwrap(await getAdminSession(admin, chau))).toBeNull();
    expect(errCode(await resolveStaff(admin, chau))).toBe("FORBIDDEN");
    expect(errCode(await resolveStaff(admin, "token-la"))).toBe("UNAUTHENTICATED");
  });
});

describe("doanh nghiệp", () => {
  it("Chỉ xem không thao tác được; Hỗ trợ tạm khóa → thành viên không đăng nhập được, phiên cũ hết hiệu lực; mở lại → dùng tiếp; mỗi bước có nhật ký", async () => {
    const viet = await staff("viet.dinh@khaibao-demo.vn");
    const trang = await staff("trang.mai@khaibao-demo.vn");
    expect(errCode(await suspendOrg(admin, viet, "org_anphat", R))).toBe("FORBIDDEN");
    const chauSession = unwrap(await login(identity, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META)).sessionToken;

    expect(unwrap(await suspendOrg(admin, trang, "org_anphat", R))).toMatchObject({ status: "SUSPENDED", suspendedReason: R.reason });
    expect(errCode(await suspendOrg(admin, trang, "org_anphat", R))).toBe("CONFLICT");
    expect(errCode(await getSession(identity, chauSession))).toBe("UNAUTHENTICATED");
    expect(errCode(await login(identity, { email: "chau.le@anphat-demo.vn", password: "demo1234" }, META))).toBe("ORG_SUSPENDED");

    unwrap(await reactivateOrg(admin, trang, "org_anphat", { reason: "Đã xác minh, mở lại" }));
    expect((await getSession(identity, chauSession)).ok).toBe(true);
    const log = unwrap(await listAudit(admin, viet, { orgId: "org_anphat" }));
    expect(log.slice(0, 2).map((a) => [a.action, a.staffName, a.reason])).toEqual([
      ["ORG_REACTIVATED", "Mai Thị Thu Trang", "Đã xác minh, mở lại"],
      ["ORG_SUSPENDED", "Mai Thị Thu Trang", R.reason],
    ]);
    expect(errCode(await suspendOrg(admin, trang, "org_khong_co", R))).toBe("NOT_FOUND");
  });

  it("đổi gói (Cấp cao) → kỳ 30 ngày mới; nới hạn mức chỉ tháng này; gia hạn chỉ cho gói dùng thử; Hỗ trợ không có quyền BILLING", async () => {
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    const trang = await staff("trang.mai@khaibao-demo.vn");
    const minhKhang = unwrap(await listOrgs(admin, bao)).find((o) => o.taxCode === "0101234567")!;
    expect(errCode(await changeOrgPlan(admin, trang, minhKhang.id, { planCode: "BASIC", ...R }))).toBe("FORBIDDEN");

    const trialEnds = unwrap(await extendOrgTrial(admin, bao, minhKhang.id, { days: 14, ...R })).plan.renewsAt;
    expect(new Date(`${trialEnds}T00:00:00Z`).getTime()).toBeGreaterThan(Date.now() + 40 * 86_400_000); // 30 ngày kỳ hiện tại + 14
    const changed = unwrap(await changeOrgPlan(admin, bao, minhKhang.id, { planCode: "BASIC", ...R }));
    expect(changed.plan).toMatchObject({ code: "BASIC", name: "Cơ bản", dossiersPerMonth: 50 });
    expect(new Date(`${changed.plan.renewsAt}T00:00:00Z`).getTime() - Date.now()).toBeLessThan(31 * 86_400_000);
    expect(errCode(await changeOrgPlan(admin, bao, minhKhang.id, { planCode: "BASIC", ...R }))).toBe("CONFLICT");
    expect(errCode(await extendOrgTrial(admin, bao, minhKhang.id, { days: 7, ...R }))).toBe("CONFLICT");
    expect(unwrap(await adjustOrgQuota(admin, bao, minhKhang.id, { bonusDossiers: 20, ...R })).quotaBonus).toBe(20);
    const detail = unwrap(await getOrg(admin, bao, minhKhang.id));
    expect(detail).toMatchObject({ quotaBonus: 20, ownerEmail: "an@minhkhang.vn", memberCount: 1, integrations: [], certificates: [] });
    expect(unwrap(await listAudit(admin, bao, { orgId: minhKhang.id })).map((a) => a.detail)).toEqual(["+20 hồ sơ tháng này", "Dùng thử → Cơ bản", "+14 ngày dùng thử"]);
  });
});

describe("người dùng", () => {
  it("khóa tài khoản trong doanh nghiệp → đăng nhập bị chặn, phiên ở đó bị xóa; mở lại; đăng xuất mọi phiên; gửi đặt lại mật khẩu", async () => {
    const trang = await staff("trang.mai@khaibao-demo.vn");
    const id = "org_anphat~usr_ha";
    unwrap(await login(identity, { email: "ha.nguyen@anphat-demo.vn", password: "demo1234" }, META));
    const before = unwrap(await listUsers(admin, trang, { orgId: "org_anphat" })).find((u) => u.id === id)!;
    expect(before).toMatchObject({ orgName: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT", role: "DECLARANT", status: "ACTIVE" });
    expect(before.sessions.length).toBeGreaterThan(0);

    expect(unwrap(await setUserDisabled(admin, trang, id, true, R))).toMatchObject({ status: "DISABLED", sessions: [] });
    expect(errCode(await login(identity, { email: "ha.nguyen@anphat-demo.vn", password: "demo1234" }, META))).toBe("MEMBERSHIP_DISABLED");
    expect(errCode(await setUserDisabled(admin, trang, id, true, R))).toBe("CONFLICT");
    unwrap(await setUserDisabled(admin, trang, id, false, R));
    unwrap(await login(identity, { email: "ha.nguyen@anphat-demo.vn", password: "demo1234" }, META));
    expect(unwrap(await revokeUserSessions(admin, trang, id, R)).sessions).toEqual([]);
    expect(errCode(await revokeUserSessions(admin, trang, id, R))).toBe("CONFLICT");
    expect(errCode(await setUserDisabled(admin, trang, "org_anphat~usr_linh", true, R))).toBe("CONFLICT"); // INVITED
    expect(errCode(await setUserDisabled(admin, trang, "khong-hop-le", true, R))).toBe("NOT_FOUND");
  });
});

describe("gói, chi phí, tích hợp, hệ thống, skill mẫu", () => {
  it("sửa gói ghi chi tiết thay đổi; không đổi gì → CONFLICT; báo cáo tháng có mọi doanh nghiệp, tiền là chuỗi thập phân", async () => {
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    const pro = unwrap(await listPlans(admin, bao)).find((p) => p.code === "PRO")!;
    const updated = unwrap(await updatePlan(admin, bao, "PRO", { name: pro.name, dossiersPerMonth: 160, pagesPerDossier: pro.pagesPerDossier, priceVnd: "3190000", ...R }));
    expect(updated).toMatchObject({ dossiersPerMonth: 160, priceVnd: "3190000" });
    expect(errCode(await updatePlan(admin, bao, "PRO", { name: pro.name, dossiersPerMonth: 160, pagesPerDossier: pro.pagesPerDossier, priceVnd: "3190000.00", ...R }))).toBe("CONFLICT");
    expect(unwrap(await listAudit(admin, bao))[0]).toMatchObject({ action: "PLAN_UPDATED", detail: "Hồ sơ/tháng 150 → 160 · Giá 2990000 → 3190000 VND" });

    const month = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7);
    const report = unwrap(await getUsageReport(admin, bao, month));
    expect(report.rows.map((r) => r.orgId)).toEqual(expect.arrayContaining(["org_anphat"]));
    expect(report.totals.totalCostVnd).toMatch(/^\d+$/);
    expect(errCode(await getUsageReport(admin, bao, "2001-01"))).toBe("NOT_FOUND");
  });

  it("khóa tích hợp: lưu mã hóa, chỉ trả 4 ký tự cuối, gọi thử ngay; chưa có khóa → INTEGRATION_NOT_CONFIGURED; chỉ PLATFORM được đổi khóa", async () => {
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    const trang = await staff("trang.mai@khaibao-demo.vn");
    expect(errCode(await testPlatformIntegration(admin, trang, "HSCODEPRO"))).toBe("INTEGRATION_NOT_CONFIGURED");
    expect(errCode(await updateIntegrationKey(admin, trang, "HSCODEPRO", { apiKey: "good-key-1234", ...R }))).toBe("FORBIDDEN");
    const saved = unwrap(await updateIntegrationKey(admin, bao, "HSCODEPRO", { apiKey: "good-key-1234", ...R }));
    expect(saved).toMatchObject({ status: "CONNECTED", keyLast4: "1234" });
    expect(JSON.stringify(saved)).not.toContain("good-key");
    const stored = (await admin.db.execute(sql`select ciphertext from platform_integrations where id = 'HSCODEPRO'`)) as unknown as { ciphertext: string }[];
    expect(stored[0]!.ciphertext).not.toContain("good-key");
    expect(unwrap(await testPlatformIntegration(admin, trang, "HSCODEPRO")).status).toBe("CONNECTED");
    unwrap(await updateIntegrationKey(admin, bao, "AI_PROVIDER", { apiKey: "bad-key-9999", ...R }));
    const list = unwrap(await listPlatformIntegrations(admin, trang));
    expect(list.map((i) => [i.id, i.status])).toEqual([["AI_PROVIDER", "ERROR"], ["HSCODEPRO", "CONNECTED"], ["CUSTOMS_HUB", "NOT_CONFIGURED"], ["EINVOICE", "NOT_CONFIGURED"]]);
    expect(unwrap(await getOverview(admin, trang)).attention.map((a) => a.id)).toContain("integration_AI_PROVIDER");
  });

  it("job lỗi: lỗi được lọc tên tệp, gắn tên doanh nghiệp; chạy lại → ghi nhật ký; job không còn → NOT_FOUND", async () => {
    const trang = await staff("trang.mai@khaibao-demo.vn");
    failed.push({ id: "42", queue: "extract-document", orgId: "org_anphat", error: "Không mở được Commercial Invoice.pdf\n at x", attempts: 5, failedAt: new Date() });
    const health = unwrap(await getSystemHealth(admin, trang));
    expect(health.failedJobs[0]).toMatchObject({ id: "extract-document~42", kind: "Đọc chứng từ", orgName: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT", error: "Không mở được <tệp>" });
    expect(health.queues[0]).toMatchObject({ id: "extract-document", name: "Đọc chứng từ", failed: 1 });
    unwrap(await retryFailedJob(admin, trang, "extract-document~42", R));
    expect(retried).toEqual(["42"]);
    expect(errCode(await retryFailedJob(admin, trang, "extract-document~42", R))).toBe("NOT_FOUND");
    expect(unwrap(await listAudit(admin, trang, { orgId: "org_anphat" }))[0]).toMatchObject({ action: "JOB_RETRIED" });
  });

  it("skill mẫu: ngừng phát hành / phát hành lại; trùng trạng thái → CONFLICT; số trường lấy từ phiên bản hiện tại", async () => {
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    const list = unwrap(await listSkillTemplates(admin, bao));
    expect(list.length).toBeGreaterThan(5);
    const tpl = list.find((x) => x.code === "SK-INV-GEN")!;
    expect(tpl).toMatchObject({ published: true });
    expect(tpl.fieldCount).toBeGreaterThan(5);
    expect(tpl.orgCount).toBeGreaterThanOrEqual(1);
    expect(unwrap(await setSkillTemplatePublished(admin, bao, tpl.id, { published: false, ...R })).published).toBe(false);
    expect(errCode(await setSkillTemplatePublished(admin, bao, tpl.id, { published: false, ...R }))).toBe("CONFLICT");
    unwrap(await setSkillTemplatePublished(admin, bao, tpl.id, { published: true, ...R }));
  });
});

describe("quản trị viên", () => {
  it("mời: tạo tài khoản + mail đặt mật khẩu, INVITED tới lần đăng nhập đầu; trùng → DUPLICATE; không tự đổi vai trò/khóa mình; khóa → đăng xuất", async () => {
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    const trang = await staff("trang.mai@khaibao-demo.vn");
    expect(errCode(await inviteStaff(admin, trang, { email: "moi@khaibao-demo.vn", name: "Người Mới", role: "SUPPORT" }))).toBe("FORBIDDEN");
    const invited = unwrap(await inviteStaff(admin, bao, { email: "moi@khaibao-demo.vn", name: "Người Mới", role: "SUPPORT" }));
    expect(invited).toMatchObject({ status: "INVITED", role: "SUPPORT" });
    expect(mailer.sent.at(-1)).toMatchObject({ to: "moi@khaibao-demo.vn" });
    expect(errCode(await inviteStaff(admin, bao, { email: "moi@khaibao-demo.vn", name: "X", role: "READONLY" }))).toBe("DUPLICATE");
    expect(errCode(await setStaffDisabled(admin, bao, invited.id, true, R))).toBe("CONFLICT");

    expect(errCode(await changeStaffRole(admin, bao, bao.userId, { role: "SUPPORT", ...R }))).toBe("FORBIDDEN");
    expect(errCode(await setStaffDisabled(admin, bao, bao.userId, true, R))).toBe("FORBIDDEN");
    expect(unwrap(await changeStaffRole(admin, bao, trang.userId, { role: "READONLY", ...R })).role).toBe("READONLY");
    const trangToken = unwrap(await login(identity, { email: "trang.mai@khaibao-demo.vn", password: "demo1234" }, META)).sessionToken;
    unwrap(await setStaffDisabled(admin, bao, trang.userId, true, R));
    expect(errCode(await resolveStaff(admin, trangToken))).toBe("UNAUTHENTICATED");
    expect(errCode(await login(identity, { email: "trang.mai@khaibao-demo.vn", password: "demo1234" }, META))).toBe("MEMBERSHIP_DISABLED");
    unwrap(await setStaffDisabled(admin, bao, trang.userId, false, R));
    unwrap(await changeStaffRole(admin, bao, trang.userId, { role: "SUPPORT", ...R }));
    expect(unwrap(await listStaff(admin, bao)).find((s) => s.id === trang.userId)).toMatchObject({ role: "SUPPORT", status: "ACTIVE" });
  });
});

describe("thông báo hệ thống", () => {
  it("gửi theo gói → thành viên đang hoạt động nhận trong panel Thông báo; doanh nghiệp tạm khóa không nhận; thu hồi → biến mất", async () => {
    const trang = await staff("trang.mai@khaibao-demo.vn");
    const chau = { orgId: "org_anphat", userId: "usr_chau", role: "ADMIN" } as const;
    const a = unwrap(await sendAnnouncement(admin, trang, { title: "Bảo trì hệ thống tối thứ Bảy", body: "Hệ thống tạm dừng từ 22:00 đến 23:00 để nâng cấp.", kind: "MAINTENANCE", audience: "ALL", maintenanceDate: "2026-10-18" }));
    expect(a).toMatchObject({ status: "SENT", recipients: 2, sentByName: "Mai Thị Thu Trang", maintenanceDate: "2026-10-18" });
    expect(unwrap(await listNotifications(identity, chau as never)).map((n) => n.title)).toContain("Bảo trì hệ thống tối thứ Bảy");

    expect(errCode(await sendAnnouncement(admin, trang, { title: "Riêng gói Doanh nghiệp", body: "Nội dung chỉ cho gói Doanh nghiệp.", kind: "INFO", audience: "ENTERPRISE" }))).toBe("CONFLICT");
    unwrap(await suspendOrg(admin, trang, "org_anphat", R));
    expect(unwrap(await sendAnnouncement(admin, trang, { title: "Chỉ doanh nghiệp đang hoạt động", body: "Doanh nghiệp tạm khóa không nhận được.", kind: "INFO", audience: "ALL" })).recipients).toBe(1);
    unwrap(await reactivateOrg(admin, trang, "org_anphat", R));

    unwrap(await withdrawAnnouncement(admin, trang, a.id, R));
    expect(unwrap(await listNotifications(identity, chau as never)).map((n) => n.title)).not.toContain("Bảo trì hệ thống tối thứ Bảy");
    expect(errCode(await withdrawAnnouncement(admin, trang, a.id, R))).toBe("CONFLICT");
  });
});

describe("xác thực 2 lớp (B11)", () => {
  it("thiết lập: chưa xác nhận mã thì chưa bật; mã sai → MFA_INVALID; đúng → bật + 8 mã khôi phục, phiên dùng được; khóa không lưu dạng rõ", async () => {
    // Các test trước đã cho Việt thiết lập 2FA (qua helper) → đặt lại để bắt đầu từ đầu.
    unwrap(await resetStaffMfa(admin, await staff("bao.hoang@khaibao-demo.vn"), "usr_stf_viet", { reason: "Chuẩn bị kiểm thử thiết lập" }));
    const { sessionToken } = unwrap(await login(identity, { email: "viet.dinh@khaibao-demo.vn", password: "demo1234" }, META));
    expect(unwrap(await getAdminSession(admin, sessionToken))?.mfa).toEqual({ enrolled: false, verified: false });
    const setup = unwrap(await startMfaSetup(admin, sessionToken));
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\/.+secret=[A-Z2-7]{32}&/);
    expect(setup.qrSvg).toMatch(/^<svg/);
    expect(unwrap(await getAdminSession(admin, sessionToken))?.mfa?.enrolled).toBe(false);
    expect(errCode(await confirmMfaSetup(admin, sessionToken, "000000"))).toBe("MFA_INVALID");
    const enabled = unwrap(await confirmMfaSetup(admin, sessionToken, totp(base32Decode(setup.secret), adminClock.now())));
    expect(enabled.recoveryCodes).toHaveLength(8);
    secrets.set("viet.dinh@khaibao-demo.vn", setup.secret);
    expect(unwrap(await getAdminSession(admin, sessionToken))?.mfa).toEqual({ enrolled: true, verified: true });
    expect(unwrap(await listOrgs(admin, unwrap(await resolveStaff(admin, sessionToken)))).length).toBeGreaterThan(0);
    expect(errCode(await startMfaSetup(admin, sessionToken))).toBe("CONFLICT");
    const row = (await admin.db.execute(sql`select totp_ciphertext, recovery_codes from platform_staff where user_id = 'usr_stf_viet'`)) as unknown as { totp_ciphertext: string; recovery_codes: string[] }[];
    expect(row[0]!.totp_ciphertext).not.toContain(setup.secret);
    expect(row[0]!.recovery_codes).not.toContain(enabled.recoveryCodes[0]);

    // Phiên mới: phải nhập mã; mã đã dùng bị từ chối; mã khôi phục dùng được đúng một lần.
    const second = unwrap(await login(identity, { email: "viet.dinh@khaibao-demo.vn", password: "demo1234" }, META)).sessionToken;
    expect(errCode(await resolveStaff(admin, second))).toBe("MFA_REQUIRED");
    expect(unwrap(await verifyMfa(admin, second, enabled.recoveryCodes[0]!.toUpperCase()))).toEqual({ recoveryCodesLeft: 7 });
    expect((await resolveStaff(admin, second)).ok).toBe(true);
    const third = unwrap(await login(identity, { email: "viet.dinh@khaibao-demo.vn", password: "demo1234" }, META)).sessionToken;
    expect(errCode(await verifyMfa(admin, third, enabled.recoveryCodes[0]!))).toBe("MFA_INVALID");
  });

  it("nhập sai 5 lần → RATE_LIMITED kể cả khi mã đúng", async () => {
    const email = "viet.dinh@khaibao-demo.vn";
    const { sessionToken } = unwrap(await login(identity, { email, password: "demo1234" }, META));
    // Lần nhập sai ở test trước (mã khôi phục đã dùng) cũng tính – tối đa 5 lần sai trong 15 phút.
    let wrong = 0;
    while (errCode(await verifyMfa(admin, sessionToken, "111111")) === "MFA_INVALID") wrong++;
    expect(wrong).toBeGreaterThan(0);
    expect(wrong).toBeLessThanOrEqual(5);
    skew += 31_000;
    expect(errCode(await verifyMfa(admin, sessionToken, codeFor(email)))).toBe("RATE_LIMITED");
  });

  it("đặt lại 2FA (quyền STAFF, không tự đặt lại mình) → người đó bị đăng xuất, lần sau phải thiết lập lại; có nhật ký", async () => {
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    const trang = await staff("trang.mai@khaibao-demo.vn");
    expect(errCode(await resetStaffMfa(admin, trang, bao.userId, R))).toBe("FORBIDDEN");
    expect(errCode(await resetStaffMfa(admin, bao, bao.userId, R))).toBe("FORBIDDEN");
    const trangToken = unwrap(await login(identity, { email: "trang.mai@khaibao-demo.vn", password: "demo1234" }, META)).sessionToken;
    expect(unwrap(await resetStaffMfa(admin, bao, trang.userId, { reason: "Mất điện thoại" })).mfaEnabled).toBe(false);
    expect(errCode(await resolveStaffSession(admin, trangToken))).toBe("UNAUTHENTICATED");
    expect(errCode(await resetStaffMfa(admin, bao, trang.userId, R))).toBe("CONFLICT");
    const again = unwrap(await login(identity, { email: "trang.mai@khaibao-demo.vn", password: "demo1234" }, META)).sessionToken;
    expect(unwrap(await getAdminSession(admin, again))?.mfa).toEqual({ enrolled: false, verified: false });
    expect(unwrap(await listAudit(admin, bao))[0]).toMatchObject({ action: "STAFF_MFA_RESET", reason: "Mất điện thoại", targetLabel: "Mai Thị Thu Trang" });
    secrets.delete("trang.mai@khaibao-demo.vn");
  });
});

describe("tạo hộ doanh nghiệp ký hợp đồng trực tiếp + mật khẩu tạm", () => {
  it("Cấp cao tạo: org + Chủ sở hữu (bắt đổi mật khẩu) + hợp đồng + nhật ký; Hỗ trợ không có quyền; MST trùng → lỗi; đổi mật khẩu → dùng bình thường", async () => {
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    const trang = await staff("trang.mai@khaibao-demo.vn");
    const input = {
      taxCode: "0108888888", name: "CÔNG TY HỢP ĐỒNG TRỰC TIẾP", address: "Hà Nội", planCode: "PRO" as const,
      contractNo: "HĐ-2026/015", contractEndsOn: "2027-10-31", owner: { email: "chu@hopdong-test.vn", name: "Đỗ Chủ Sở Hữu" }, note: "Phụ trách: anh Bảo",
    };
    expect(errCode(await createOrg(admin, trang, input))).toBe("FORBIDDEN");
    const r = unwrap(await createOrg(admin, bao, input));
    expect(r).toMatchObject({ orgName: input.name, ownerEmail: input.owner.email });
    expect(r.tempPassword).toMatch(/^[A-Za-z2-9]{12}$/);

    const detail = unwrap(await getOrg(admin, bao, r.orgId));
    expect(detail).toMatchObject({ taxCode: "0108888888", ownerEmail: "chu@hopdong-test.vn", plan: { code: "PRO" }, contract: { contractNo: "HĐ-2026/015", endsOn: "2027-10-31", note: "Phụ trách: anh Bảo" } });
    expect(unwrap(await listAudit(admin, bao))[0]).toMatchObject({ action: "ORG_CREATED", targetId: r.orgId });
    expect(errCode(await createOrg(admin, bao, { ...input, owner: { ...input.owner, email: "khac@hopdong-test.vn" } }))).toBe("TAX_CODE_EXISTS");
    // Hợp đồng chỉ khu quản trị đọc được.
    await expect(appDb.execute(sql`select * from org_contracts`)).resolves.toHaveLength(0);

    const first = unwrap(await login(identity, { email: input.owner.email, password: r.tempPassword }, META)).sessionToken;
    expect(unwrap(await getSession(identity, first)).session).toMatchObject({ mustChangePassword: true, user: { role: "OWNER" }, org: { id: r.orgId } });
    const next = unwrap(await changePassword(identity, first, { currentPassword: r.tempPassword, newPassword: "matkhaurieng123" })).sessionToken;
    expect(unwrap(await getSession(identity, next)).session.mustChangePassword).toBeUndefined();
    expect(errCode(await getSession(identity, first))).toBe("UNAUTHENTICATED");
  });

  it("quản trị viên còn mật khẩu tạm → API quản trị PASSWORD_CHANGE_REQUIRED (trước cả 2FA); đổi xong thì tới bước 2FA", async () => {
    const email = "tam.thoi@khaibao-demo.vn";
    await admin.db.execute(sql`insert into users (id, email, name, password_hash, email_verified_at, must_change_password) values ('usr_tmp_staff', ${email}, 'Quản trị tạm', ${await new Argon2Hasher().hash("TamThoi12345")}, now(), true)`);
    await admin.db.execute(sql`insert into platform_staff (user_id, role, status) values ('usr_tmp_staff', 'SUPER_ADMIN', 'INVITED')`);
    const token = unwrap(await login(identity, { email, password: "TamThoi12345" }, META)).sessionToken;
    expect(unwrap(await getAdminSession(admin, token))).toMatchObject({ mustChangePassword: true });
    expect(errCode(await resolveStaff(admin, token))).toBe("PASSWORD_CHANGE_REQUIRED");
    const next = unwrap(await changePassword(identity, token, { currentPassword: "TamThoi12345", newPassword: "matkhaurieng123" })).sessionToken;
    expect(unwrap(await getAdminSession(admin, next))?.mustChangePassword).toBeUndefined();
    expect(errCode(await resolveStaff(admin, next))).toBe("MFA_REQUIRED");
  });
});

describe("email (ADR 0008)", () => {
  const text = (id: string, t: string) => ({ id, type: "text" as const, text: t, align: "left" as const });

  it("mẫu, chữ ký chung/riêng, chọn người nhận, gửi theo đợt qua worker: biến theo người nhận, một người lỗi không dừng đợt, chạy lại không gửi trùng", async () => {
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    const trang = await staff("trang.mai@khaibao-demo.vn");
    const outbox: { to: string; subject: string; html?: string }[] = [];
    admin.mail = {
      send: async (m) => {
        if (m.to.startsWith("ha.nguyen")) throw new Error("550 Hộp thư không tồn tại");
        outbox.push(m);
      },
      verify: async () => {},
      invalidate: () => {},
    };
    const queue = new InMemoryJobQueue();
    admin.queue = queue;

    const tpl = unwrap(await saveEmailTemplate(admin, trang, null, { name: "Bảo trì", subject: "Bảo trì cho {{orgName}}", blocks: [text("b1", "Chào {{name}}, hệ thống bảo trì.")] }));
    expect(unwrap(await listEmailTemplates(admin, trang)).map((x) => x.id)).toContain(tpl.id);

    expect(errCode(await saveEmailSignature(admin, trang, null, { name: "Chung", personal: false, isDefault: true, blocks: [text("s0", "KhaiBáo AI")] }))).toBe("FORBIDDEN");
    const mine = unwrap(await saveEmailSignature(admin, trang, null, { name: "Trang", personal: true, isDefault: true, blocks: [text("s1", "Trang – CSKH")] }));
    unwrap(await saveEmailSignature(admin, bao, null, { name: "Chung", personal: false, isDefault: true, blocks: [text("s2", "KhaiBáo AI")] }));
    expect(unwrap(await listEmailSignatures(admin, bao)).map((x) => x.id)).not.toContain(mine.id);

    // Doanh nghiệp demo: Chủ sở hữu (Phong) + Người khai đang hoạt động (Hà; Linh còn INVITED → không), thêm Tuấn chọn riêng,
    // email ngoài, và email trùng với Phong → bỏ trùng.
    const audience = {
      orgs: { mode: "PICK" as const, orgIds: [DEMO_ORG_ID] }, roles: ["OWNER" as const, "DECLARANT" as const], userIds: ["usr_tuan"],
      extraEmails: ["khach@ngoai.vn", "phong.tran@anphat-demo.vn"],
    };
    const preview = unwrap(await previewEmailAudience(admin, trang, audience));
    expect(preview.total).toBe(4);

    const c = unwrap(await sendEmail(admin, trang, { subject: tpl.subject, blocks: tpl.blocks, signatureId: mine.id, templateId: tpl.id, audience }));
    expect(c).toMatchObject({ status: "QUEUED", total: 4 });
    expect(queue.jobs.map((j) => j.name)).toContain("email-campaign");

    const done = unwrap(await processEmailCampaign(admin, c.id));
    expect(done).toMatchObject({ status: "PARTIAL", sent: 3, failed: 1 });
    const phong = outbox.find((m) => m.to === "phong.tran@anphat-demo.vn")!;
    expect(phong.html).toContain("Chào Trần Văn Phong");
    expect(phong.html).toContain("Trang – CSKH");
    expect(phong.subject).toMatch(/^Bảo trì cho \S/);
    const before = outbox.length;
    unwrap(await processEmailCampaign(admin, c.id));
    expect(outbox).toHaveLength(before);
    const detail = unwrap(await getEmailCampaign(admin, bao, c.id));
    expect(detail.recipients.find((r) => r.email.startsWith("ha."))).toMatchObject({ status: "FAILED", error: "550 Hộp thư không tồn tại" });
    expect(unwrap(await listAudit(admin, bao))[0]).toMatchObject({ action: "EMAIL_SENT", targetId: c.id });
  });

  it("máy chủ gửi mail: chỉ quyền Nền tảng; mật khẩu lưu mã hóa, bỏ trống thì giữ; lưu xong thử đăng nhập và ghi kết quả", async () => {
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    const trang = await staff("trang.mai@khaibao-demo.vn");
    const tried: (string | null)[] = [];
    admin.mail = { send: async () => {}, invalidate: () => {}, verify: async (s) => {
      tried.push(s.password);
      if (s.password !== "matkhau-dung") throw new Error("Sai tên đăng nhập hoặc mật khẩu SMTP");
    } };
    const input = { host: "smtp.gmail.com", port: 465, secure: true, username: "ops@khaibao.ai", fromName: "KhaiBáo AI", fromEmail: "ops@khaibao.ai" };
    expect(errCode(await updateMailSettings(admin, trang, { ...input, password: "x" }))).toBe("FORBIDDEN");
    const bad = unwrap(await updateMailSettings(admin, bao, { ...input, password: "matkhau-sai" }));
    expect(bad).toMatchObject({ configured: true, hasPassword: true, lastTest: { ok: false } });
    const row = (await admin.db.execute(sql`select password_ciphertext from mail_settings`)) as unknown as { password_ciphertext: string }[];
    expect(row[0]!.password_ciphertext).not.toContain("matkhau-sai");
    unwrap(await updateMailSettings(admin, bao, { ...input, fromName: "KhaiBáo AI – CSKH" }));
    expect(tried.at(-1)).toBe("matkhau-sai");
    const good = unwrap(await updateMailSettings(admin, bao, { ...input, password: "matkhau-dung" }));
    expect(good.lastTest?.ok).toBe(true);
    expect(unwrap(await getMailSettings(admin, bao))).not.toHaveProperty("password");
  });

  it("AI soạn mẫu: khối được cấp id và kiểm lại bằng schema, đầu ra sai → GATEWAY_ERROR; mọi lần gọi đều ghi usage", async () => {
    const bao = await staff("bao.hoang@khaibao-demo.vn");
    const recorded: unknown[] = [];
    admin.recordAiUsage = async (u) => void recorded.push(u);
    const usage = { model: "claude-test", inputTokens: 100, outputTokens: 50 };
    admin.emailAi = { draft: async () => ({ subject: "Tính năng mới", blocks: [{ type: "heading", text: "Chào {{name}}", level: 1, align: "left" }], usage }) };
    const ok1 = unwrap(await draftEmailWithAi(admin, bao, { description: "Giới thiệu tính năng hộp thư chứng từ", tone: "FRIENDLY", language: "vi" }));
    expect(ok1.blocks[0]).toMatchObject({ type: "heading", text: "Chào {{name}}" });
    expect(ok1.blocks[0]!.id).toBeTruthy();
    admin.emailAi = { draft: async () => ({ subject: "", blocks: [{ type: "bogus" }], usage }) };
    expect(errCode(await draftEmailWithAi(admin, bao, { description: "Mô tả bất kỳ đủ dài", tone: "SHORT", language: "vi" }))).toBe("GATEWAY_ERROR");
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({ kind: "AI_EMAIL_DRAFT", model: "claude-test" });
  });
});
