import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import { seedAdmin, DEMO_ORG_ID } from "../seed/admin";
import { seedCore } from "../seed/core";
import { seedSettings } from "../seed/settings";
import * as ops from "./ops";

const REASON = { reason: "Khách yêu cầu qua hotline" };
let db: ops.AdminScope;

/** Đăng nhập bằng một quản trị viên mẫu: bao = Cấp cao, trang = Hỗ trợ, viet = Chỉ xem. */
const as = (who: "bao.hoang" | "trang.mai" | "viet.dinh") => ops.adminLogin(db, `${who}@khaibao-demo.vn`, "matkhau");

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return e.code;
    throw e;
  }
  return "OK";
};

beforeEach(() => {
  // Bản sao sâu như mocks/db.ts: seed dùng hằng số cấp module, không được để test này sửa dữ liệu của test kia.
  const core = seedCore();
  db = structuredClone({ org: core.org, members: core.members, notifications: core.notifications, ...seedSettings(), ...seedAdmin() });
});

describe("phiên quản trị", () => {
  it("chưa đăng nhập: không đọc được gì", () => {
    expect(ops.getAdminSession(db)).toBeNull();
    expect(codeOf(() => ops.listOrgs(db))).toBe("UNAUTHENTICATED");
  });
  it("đăng nhập đúng → có phiên; sai email hoặc mật khẩu ngắn → từ chối", () => {
    expect(as("bao.hoang").staff.role).toBe("SUPER_ADMIN");
    expect(ops.getAdminSession(db)?.staff.id).toBe("stf_bao");
    expect(codeOf(() => ops.adminLogin(db, "ai-do@khaibao-demo.vn", "matkhau"))).toBe("INVALID_CREDENTIALS");
    expect(codeOf(() => ops.adminLogin(db, "bao.hoang@khaibao-demo.vn", "123"))).toBe("INVALID_CREDENTIALS");
  });
  it("tài khoản chưa kích hoạt lời mời không đăng nhập được", () => {
    expect(codeOf(() => ops.adminLogin(db, "yen.ly@khaibao-demo.vn", "matkhau"))).toBe("FORBIDDEN");
  });
  it("đăng xuất → mất phiên", () => {
    as("bao.hoang");
    ops.adminLogout(db);
    expect(ops.getAdminSession(db)).toBeNull();
  });
});

describe("phân quyền theo vai trò", () => {
  it("Chỉ xem: đọc được, mọi thao tác ghi bị từ chối", () => {
    as("viet.dinh");
    expect(ops.listOrgs(db).length).toBeGreaterThan(1);
    expect(codeOf(() => ops.suspendOrg(db, "org_hoanggia", REASON))).toBe("FORBIDDEN");
    expect(codeOf(() => ops.retryJob(db, "job_8841", REASON))).toBe("FORBIDDEN");
    expect(codeOf(() => ops.sendAnnouncement(db, { title: "Thông báo thử", body: "Nội dung thông báo thử.", kind: "INFO", audience: "ALL" }))).toBe("FORBIDDEN");
  });
  it("Hỗ trợ: khóa doanh nghiệp được, nhưng không đổi gói / khóa API / skill mẫu / quản trị viên", () => {
    as("trang.mai");
    expect(ops.suspendOrg(db, "org_hoanggia", REASON).status).toBe("SUSPENDED");
    expect(codeOf(() => ops.changeOrgPlan(db, "org_hoanggia", { planCode: "BASIC", ...REASON }))).toBe("FORBIDDEN");
    expect(codeOf(() => ops.updateIntegrationKey(db, "CUSTOMS_HUB", { apiKey: "sk-moi-12345678", ...REASON }))).toBe("FORBIDDEN");
    expect(codeOf(() => ops.setTemplatePublished(db, "tpl_an", { published: true, ...REASON }))).toBe("FORBIDDEN");
    expect(codeOf(() => ops.inviteStaff(db, { email: "moi@khaibao-demo.vn", name: "Người Mới", role: "SUPPORT" }))).toBe("FORBIDDEN");
  });
  it("bị từ chối thì không ghi nhật ký và không đổi dữ liệu", () => {
    as("viet.dinh");
    const before = db.admin.audit.length;
    codeOf(() => ops.suspendOrg(db, "org_hoanggia", REASON));
    expect(db.admin.audit).toHaveLength(before);
    expect(db.admin.orgs.find((o) => o.org.id === "org_hoanggia")?.meta.status).toBe("ACTIVE");
  });
});

describe("lý do & nhật ký", () => {
  beforeEach(() => void as("bao.hoang"));

  it("thiếu lý do hoặc lý do quá ngắn → VALIDATION, không đổi gì", () => {
    expect(codeOf(() => ops.suspendOrg(db, "org_hoanggia", { reason: "  ok " }))).toBe("VALIDATION");
    expect(codeOf(() => ops.suspendOrg(db, "org_hoanggia", {}))).toBe("VALIDATION");
    expect(ops.listOrgs(db).find((o) => o.id === "org_hoanggia")?.status).toBe("ACTIVE");
  });
  it("thao tác thành công → thêm 1 dòng nhật ký mới nhất, đủ ai / việc gì / đối tượng / lý do", () => {
    const before = db.admin.audit.length;
    ops.suspendOrg(db, "org_hoanggia", REASON);
    expect(db.admin.audit).toHaveLength(before + 1);
    expect(db.admin.audit[0]).toMatchObject({ staffId: "stf_bao", action: "ORG_SUSPENDED", targetType: "ORG", targetId: "org_hoanggia", orgId: "org_hoanggia", reason: REASON.reason });
  });
  it("lọc nhật ký theo doanh nghiệp", () => {
    ops.suspendOrg(db, "org_hoanggia", REASON);
    const rows = ops.listAudit(db, { orgId: "org_hoanggia" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((a) => a.orgId === "org_hoanggia")).toBe(true);
  });
});

describe("doanh nghiệp", () => {
  beforeEach(() => void as("bao.hoang"));

  it("danh sách gồm doanh nghiệp demo đang dùng ở ứng dụng khách, kèm chủ sở hữu và số thành viên", () => {
    const demo = ops.listOrgs(db).find((o) => o.id === DEMO_ORG_ID);
    expect(demo).toMatchObject({ taxCode: "0316789012", ownerName: "Trần Văn Phong", memberCount: 6 });
  });
  it("khóa rồi mở lại: lưu lý do khóa, mở thì xóa; khóa hai lần → CONFLICT", () => {
    expect(ops.suspendOrg(db, "org_hoanggia", REASON)).toMatchObject({ status: "SUSPENDED", suspendedReason: REASON.reason });
    expect(codeOf(() => ops.suspendOrg(db, "org_hoanggia", REASON))).toBe("CONFLICT");
    const back = ops.reactivateOrg(db, "org_hoanggia", REASON);
    expect(back.status).toBe("ACTIVE");
    expect(back.suspendedReason).toBeUndefined();
  });
  it("đổi gói doanh nghiệp demo → ứng dụng khách thấy gói mới (db.org)", () => {
    ops.changeOrgPlan(db, DEMO_ORG_ID, { planCode: "ENTERPRISE", ...REASON });
    expect(db.org.plan).toMatchObject({ code: "ENTERPRISE", name: "Doanh nghiệp", dossiersPerMonth: 1000 });
    expect(db.admin.audit[0]?.detail).toBe("Chuyên nghiệp → Doanh nghiệp");
  });
  it("đổi sang đúng gói đang dùng → CONFLICT", () => {
    expect(codeOf(() => ops.changeOrgPlan(db, DEMO_ORG_ID, { planCode: "PRO", ...REASON }))).toBe("CONFLICT");
  });
  it("nới hạn mức: đặt số hồ sơ cộng thêm; 0 = bỏ nới", () => {
    expect(ops.adjustOrgQuota(db, "org_minhkhang", { bonusDossiers: 30, ...REASON }).quotaBonus).toBe(30);
    expect(ops.adjustOrgQuota(db, "org_minhkhang", { bonusDossiers: 0, ...REASON }).quotaBonus).toBe(0);
  });
  it("gia hạn dùng thử chỉ áp dụng cho gói TRIAL", () => {
    const before = ops.listOrgs(db).find((o) => o.id === "org_dailoc")!.plan.renewsAt;
    const after = ops.extendOrgTrial(db, "org_dailoc", { days: 14, ...REASON }).plan.renewsAt;
    expect(new Date(after).getTime() - new Date(before).getTime()).toBe(14 * 86_400_000);
    expect(codeOf(() => ops.extendOrgTrial(db, "org_hoanggia", { days: 14, ...REASON }))).toBe("CONFLICT");
  });
  it("doanh nghiệp không tồn tại → NOT_FOUND", () => {
    expect(codeOf(() => ops.getOrg(db, "org_khong_co"))).toBe("NOT_FOUND");
  });
  it("chi tiết doanh nghiệp chỉ có trạng thái kết nối, không lộ serial chứng thư hay chi tiết tích hợp", () => {
    const d = ops.getOrg(db, DEMO_ORG_ID);
    expect(Object.keys(d.integrations[0]!).sort()).toEqual(["id", "name", "status"]);
    expect(Object.keys(d.certificates[0]!).sort()).toEqual(["id", "isDefault", "issuer", "validTo"]);
  });
});

describe("người dùng", () => {
  beforeEach(() => void as("trang.mai"));

  it("khóa thành viên doanh nghiệp demo → ứng dụng khách thấy đã khóa, phiên bị thu hồi", () => {
    const u = ops.setUserDisabled(db, "usr_ha", true, REASON);
    expect(u).toMatchObject({ status: "DISABLED", sessions: [] });
    expect(db.members.find((m) => m.id === "usr_ha")?.status).toBe("DISABLED");
  });
  it("mở khóa lại → ACTIVE; khóa tài khoản đã khóa → CONFLICT", () => {
    ops.setUserDisabled(db, "usr_ha", true, REASON);
    expect(codeOf(() => ops.setUserDisabled(db, "usr_ha", true, REASON))).toBe("CONFLICT");
    expect(ops.setUserDisabled(db, "usr_ha", false, REASON).status).toBe("ACTIVE");
  });
  it("tài khoản mới được mời (chưa kích hoạt) không khóa được", () => {
    expect(codeOf(() => ops.setUserDisabled(db, "usr_linh", true, REASON))).toBe("CONFLICT");
  });
  it("gửi lại xác thực chỉ khi email chưa xác thực", () => {
    expect(ops.resendVerification(db, "usr_linh", REASON).emailVerified).toBe(false);
    expect(codeOf(() => ops.resendVerification(db, "usr_chau", REASON))).toBe("CONFLICT");
  });
  it("đăng xuất mọi phiên: xóa hết phiên, ghi số phiên vào nhật ký", () => {
    expect(ops.revokeUserSessions(db, "usr_chau", REASON).sessions).toEqual([]);
    expect(db.admin.audit[0]).toMatchObject({ action: "USER_SESSIONS_REVOKED", detail: "2 phiên" });
    expect(codeOf(() => ops.revokeUserSessions(db, "usr_chau", REASON))).toBe("CONFLICT");
  });
  it("lọc theo doanh nghiệp chỉ trả người của doanh nghiệp đó", () => {
    const rows = ops.listUsers(db, { orgId: "org_tanviet" });
    expect(rows).toHaveLength(6);
    expect(rows.every((u) => u.orgName === "CÔNG TY TNHH LINH KIỆN ĐIỆN TỬ TÂN VIỆT")).toBe(true);
  });
});

describe("gói & sử dụng", () => {
  beforeEach(() => void as("bao.hoang"));

  it("sửa gói → doanh nghiệp đang dùng gói nhận hạn mức mới", () => {
    const p = ops.updatePlan(db, "PRO", { name: "Chuyên nghiệp", dossiersPerMonth: 200, pagesPerDossier: 40, priceVnd: "3990000", ...REASON });
    expect(p).toMatchObject({ dossiersPerMonth: 200, orgCount: 4 });
    expect(db.org.plan.dossiersPerMonth).toBe(200);
    expect(db.admin.audit[0]?.detail).toBe("Hồ sơ/tháng 150 → 200");
  });
  it("lưu gói mà không đổi gì → CONFLICT", () => {
    expect(codeOf(() => ops.updatePlan(db, "PRO", { name: "Chuyên nghiệp", dossiersPerMonth: 150, pagesPerDossier: 40, priceVnd: "3990000", ...REASON }))).toBe("CONFLICT");
  });
  it("6 tháng gần nhất, mới nhất đứng đầu, qua được ranh giới năm", () => {
    expect(ops.usageMonths(new Date("2026-02-10T00:00:00Z"))).toEqual(["2026-02", "2026-01", "2025-12", "2025-11", "2025-10", "2025-09"]);
  });
  it("báo cáo tháng hiện tại: tổng = cộng các dòng; biên = giá gói − giá vốn", () => {
    const r = ops.getUsageReport(db, ops.usageMonths()[0]!);
    expect(r.rows).toHaveLength(12);
    const sum = (k: "totalCostVnd" | "planPriceVnd") => r.rows.reduce((n, x) => n + Number(x[k]), 0);
    expect(Number(r.totals.totalCostVnd)).toBe(sum("totalCostVnd"));
    expect(Number(r.totals.marginVnd)).toBe(sum("planPriceVnd") - sum("totalCostVnd"));
    // Giá vốn theo nhà cung cấp (AI / HSCodePro / Customs Hub) cộng lại đúng tổng.
    expect(Number(r.totals.readCostVnd) + Number(r.totals.hsCostVnd) + Number(r.totals.customsCostVnd)).toBe(Number(r.totals.totalCostVnd));
    expect(r.totals.hsItems).toBe(r.rows.reduce((n, x) => n + x.hsItems, 0));
    expect(r.totals.customsMessages).toBe(r.rows.reduce((n, x) => n + x.customsMessages, 0));
    for (const x of r.rows) {
      expect(Number(x.readCostVnd) + Number(x.hsCostVnd) + Number(x.customsCostVnd)).toBe(Number(x.totalCostVnd));
      expect(Number(x.marginVnd)).toBe(Number(x.planPriceVnd) - Number(x.totalCostVnd));
    }
  });
  it("tháng cũ: bỏ doanh nghiệp chưa đăng ký ở tháng đó; số liệu ổn định giữa hai lần gọi", () => {
    const month = ops.usageMonths()[3]!;
    const a = ops.getUsageReport(db, month);
    expect(a.rows.length).toBeLessThan(12);
    expect(a.rows.some((x) => x.orgId === "org_kimlong")).toBe(false);
    expect(ops.getUsageReport(db, month)).toEqual(a);
  });
  it("tháng ngoài khoảng có số liệu → NOT_FOUND; sai định dạng → VALIDATION", () => {
    expect(codeOf(() => ops.getUsageReport(db, "2020-01"))).toBe("NOT_FOUND");
    expect(codeOf(() => ops.getUsageReport(db, "thang-10"))).toBe("VALIDATION");
  });
});

describe("tích hợp, job, skill mẫu", () => {
  beforeEach(() => void as("bao.hoang"));

  it("khóa hỏng: kiểm tra vẫn lỗi cho tới khi cập nhật khóa; chỉ giữ 4 ký tự cuối", () => {
    expect(ops.testPlatformIntegration(db, "CUSTOMS_HUB").status).toBe("ERROR");
    const it = ops.updateIntegrationKey(db, "CUSTOMS_HUB", { apiKey: "ch_live_ABCDEFGH7788", ...REASON });
    expect(it).toMatchObject({ status: "CONNECTED", keyLast4: "7788" });
    expect(JSON.stringify(db.admin)).not.toContain("ch_live_ABCDEFGH7788");
    expect(ops.testPlatformIntegration(db, "CUSTOMS_HUB").status).toBe("CONNECTED");
  });
  it("tích hợp chưa có khóa → không kiểm tra được", () => {
    expect(codeOf(() => ops.testPlatformIntegration(db, "EINVOICE"))).toBe("NOT_CONFIGURED");
  });
  it("chạy lại job: rời danh sách lỗi, hàng đợi bớt 1 lỗi và thêm 1 chờ", () => {
    const q = () => db.admin.queues.find((x) => x.id === "extraction")!;
    const before = { ...q() };
    ops.retryJob(db, "job_8841", REASON);
    expect(db.admin.failedJobs.some((j) => j.id === "job_8841")).toBe(false);
    expect(q()).toMatchObject({ failed: before.failed - 1, waiting: before.waiting + 1 });
    expect(codeOf(() => ops.retryJob(db, "job_8841", REASON))).toBe("NOT_FOUND");
  });
  it("phát hành / ngừng phát hành skill mẫu; lặp lại trạng thái cũ → CONFLICT", () => {
    expect(ops.setTemplatePublished(db, "tpl_an", { published: true, ...REASON }).published).toBe(true);
    expect(codeOf(() => ops.setTemplatePublished(db, "tpl_an", { published: true, ...REASON }))).toBe("CONFLICT");
  });
});

describe("quản trị viên", () => {
  beforeEach(() => void as("bao.hoang"));

  it("mời: tạo tài khoản chờ kích hoạt; email trùng → DUPLICATE", () => {
    expect(ops.inviteStaff(db, { email: "Moi@KhaiBao-Demo.vn", name: "Người Mới", role: "SUPPORT" })).toMatchObject({ email: "moi@khaibao-demo.vn", status: "INVITED" });
    expect(codeOf(() => ops.inviteStaff(db, { email: "moi@khaibao-demo.vn", name: "Người Mới", role: "SUPPORT" }))).toBe("DUPLICATE");
  });
  it("không tự đổi vai trò hay tự khóa chính mình", () => {
    expect(codeOf(() => ops.changeStaffRole(db, "stf_bao", { role: "SUPPORT", ...REASON }))).toBe("FORBIDDEN");
    expect(codeOf(() => ops.setStaffDisabled(db, "stf_bao", true, REASON))).toBe("FORBIDDEN");
  });
  it("không hạ cấp / khóa Quản trị cấp cao duy nhất còn hoạt động", () => {
    ops.changeStaffRole(db, "stf_trang", { role: "SUPER_ADMIN", ...REASON });
    as("trang.mai"); // giờ có 2 cấp cao: Bảo và Trang
    expect(ops.changeStaffRole(db, "stf_bao", { role: "READONLY", ...REASON }).role).toBe("READONLY");
    as("bao.hoang"); // Bảo chỉ còn quyền xem
    expect(codeOf(() => ops.setStaffDisabled(db, "stf_trang", true, REASON))).toBe("FORBIDDEN");
    as("trang.mai");
    ops.changeStaffRole(db, "stf_viet", { role: "SUPER_ADMIN", ...REASON });
    as("viet.dinh"); // Việt hạ Trang được vì vẫn còn Việt là cấp cao
    expect(ops.changeStaffRole(db, "stf_trang", { role: "SUPPORT", ...REASON }).role).toBe("SUPPORT");
  });
  it("khóa quản trị viên khác rồi mở lại", () => {
    expect(ops.setStaffDisabled(db, "stf_trang", true, REASON).status).toBe("DISABLED");
    expect(codeOf(() => ops.adminLogin(db, "trang.mai@khaibao-demo.vn", "matkhau"))).toBe("FORBIDDEN");
  });
});

describe("thông báo hệ thống", () => {
  beforeEach(() => void as("trang.mai"));
  const input = { title: "Bảo trì hệ thống", body: "Hệ thống tạm ngưng 30 phút đêm nay.", kind: "INFO" as const };

  it("gửi mọi doanh nghiệp: không tính doanh nghiệp đang tạm khóa; doanh nghiệp demo nhận trong panel Thông báo", () => {
    const before = db.notifications.length;
    const a = ops.sendAnnouncement(db, { ...input, audience: "ALL" });
    expect(a.recipients).toBe(11); // 12 doanh nghiệp, 1 đang tạm khóa
    expect(db.notifications).toHaveLength(before + 1);
    expect(db.notifications[0]).toMatchObject({ title: input.title, read: false });
  });
  it("gửi theo gói mà doanh nghiệp demo không dùng → khách demo không nhận", () => {
    const before = db.notifications.length;
    expect(ops.sendAnnouncement(db, { ...input, audience: "TRIAL" }).recipients).toBe(3);
    expect(db.notifications).toHaveLength(before);
  });
  it("thu hồi → gỡ khỏi panel của khách; thu hồi lần hai → CONFLICT", () => {
    const before = db.notifications.length;
    const a = ops.sendAnnouncement(db, { ...input, audience: "PRO" });
    expect(ops.withdrawAnnouncement(db, a.id, REASON).status).toBe("WITHDRAWN");
    expect(db.notifications).toHaveLength(before);
    expect(codeOf(() => ops.withdrawAnnouncement(db, a.id, REASON))).toBe("CONFLICT");
  });
});

describe("tổng quan vận hành", () => {
  beforeEach(() => void as("viet.dinh"));

  it("đếm doanh nghiệp, cộng hồ sơ và chi phí AI của mọi doanh nghiệp", () => {
    const o = ops.getOverview(db);
    expect(o.orgs).toMatchObject({ active: 11, suspended: 1 });
    expect(o.dossiersThisMonth).toBe(ops.listOrgs(db).reduce((n, x) => n + x.usage.dossiersThisMonth, 0));
    expect(o.recentOrgs.map((x) => x.id).slice(0, 2)).toEqual(["org_kimlong", "org_dailoc"]);
  });
  it("mục cần chú ý: hết hạn mức (đỏ) xếp trước sắp hết (vàng); có tích hợp lỗi, job lỗi, yêu cầu tham gia treo", () => {
    const { attention } = ops.getOverview(db);
    const kinds = new Set(attention.map((a) => a.kind));
    expect(kinds).toEqual(new Set(["QUOTA", "PLAN_EXPIRING", "INTEGRATION_ERROR", "JOBS_FAILED", "JOIN_PENDING"]));
    expect(attention.find((a) => a.id === "quota_org_minhkhang")?.severity).toBe("danger"); // 51/50
    expect(attention.find((a) => a.id === "quota_org_hoanggia")?.severity).toBe("warning"); // 142/150
    expect(attention.findIndex((a) => a.severity === "warning")).toBeGreaterThan(attention.findLastIndex((a) => a.severity === "danger"));
  });
  it("doanh nghiệp đã nới hạn mức không còn bị cảnh báo", () => {
    as("bao.hoang");
    ops.adjustOrgQuota(db, "org_minhkhang", { bonusDossiers: 50, ...REASON });
    expect(ops.getOverview(db).attention.some((a) => a.id === "quota_org_minhkhang")).toBe(false);
  });
  it("doanh nghiệp đang tạm khóa không sinh cảnh báo hạn mức / hết hạn", () => {
    expect(ops.getOverview(db).attention.some((a) => a.id.endsWith("org_baotin"))).toBe(false);
  });
});

describe("tỷ giá tính thuế", () => {
  it("xem: nhóm theo tuần mới nhất trước, có lần lấy gần nhất; ai cũng xem được", () => {
    as("viet.dinh");
    const v = ops.listExchangeRates(db);
    expect(v.weeks.length).toBeGreaterThan(0);
    expect(v.weeks[0]!.rates.find((r) => r.currency === "USD")?.source).toBe("VCB");
    expect(v.lastFetch?.status).toBe("OK");
  });
  it("sửa tay: chỉ quyền PLATFORM; ghi MANUAL + nhật ký có lý do; thứ Hai bắt buộc", () => {
    as("trang.mai");
    const input = { currency: "TWD", effectiveFrom: ops.listExchangeRates(db).weeks[0]!.effectiveFrom, rate: "805.12", reason: "Tỷ giá chéo NHNN" };
    expect(codeOf(() => ops.upsertExchangeRate(db, input))).toBe("FORBIDDEN");
    as("bao.hoang");
    expect(ops.upsertExchangeRate(db, input)).toMatchObject({ currency: "TWD", rate: "805.12", source: "MANUAL", updatedByName: expect.any(String) });
    expect(db.admin.audit[0]).toMatchObject({ action: "EXCHANGE_RATE_UPDATED", reason: "Tỷ giá chéo NHNN" });
    expect(codeOf(() => ops.upsertExchangeRate(db, { ...input, effectiveFrom: "2026-10-15" }))).toBe("VALIDATION");
  });
});
