import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock, type Clock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import { addCertificate } from "../add-certificate.js";
import { approveJoinRequest } from "../approve-join-request.js";
import { changeMemberRole } from "../change-member-role.js";
import { getOrganization } from "../get-organization.js";
import { inviteMember } from "../invite-member.js";
import { listCertificates } from "../list-certificates.js";
import { listJoinRequests } from "../list-join-requests.js";
import { listMembers } from "../list-members.js";
import { listNotifications } from "../list-notifications.js";
import { markAllNotificationsRead } from "../mark-all-notifications-read.js";
import type { IdentityDeps } from "../ports.js";
import { removeCertificate } from "../remove-certificate.js";
import { setDefaultCertificate } from "../set-default-certificate.js";
import { setMemberDisabled } from "../set-member-disabled.js";
import { FakeHasher, FakeTaxRegistry, InMemoryRateLimiter, RecordingMailer } from "../test/fakes.js";
import { InMemoryIdentityUow } from "../test/in-memory-uow.js";
import { updateOrganization } from "../update-organization.js";
import { updateSuspectThreshold } from "../update-suspect-threshold.js";

const T0 = "2026-10-13T00:00:00.000Z";
const day = (n: number) => new Date(new Date(T0).getTime() + n * 86_400_000);
const ctx = (role: Ctx["role"], userId = "usr_chau", orgId = "org_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId(userId), role });

let uow: InMemoryIdentityUow;
let mailer: RecordingMailer;
let clock: Clock;
let deps: IdentityDeps;
const expectErr = (r: { ok: boolean; error?: { code: string } }, code: string) => {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error?.code).toBe(code);
};

beforeEach(() => {
  uow = new InMemoryIdentityUow().seed({
    plans: [{ code: "PRO", name: "Chuyên nghiệp", dossiersPerMonth: 150, pagesPerDossier: 40 }],
    orgs: [
      { id: "org_a", taxCode: "0316789012", name: "AN PHÁT", address: "HP", phone: "0225", planCode: "PRO", suspectThreshold: "BALANCED", createdAt: day(-40) },
      { id: "org_b", taxCode: "0100000002", name: "B", address: "", phone: "", planCode: "PRO", suspectThreshold: "BALANCED", createdAt: day(-5) },
    ],
    users: [
      { id: "usr_chau", email: "chau.le@anphat-demo.vn", passwordHash: "h", name: "Lê Minh Châu", emailVerifiedAt: day(-1), createdAt: day(-40) },
      { id: "usr_phong", email: "phong@anphat-demo.vn", passwordHash: "h", name: "Trần Văn Phong", emailVerifiedAt: day(-1), createdAt: day(-40) },
      { id: "usr_ha", email: "ha@anphat-demo.vn", passwordHash: "h", name: "Nguyễn Thu Hà", emailVerifiedAt: day(-1), createdAt: day(-40) },
      { id: "usr_quang", email: "quang@anphat-demo.vn", passwordHash: "h", name: "Vũ Đức Quang", emailVerifiedAt: day(-1), createdAt: day(-40) },
      { id: "usr_b", email: "b@b.vn", passwordHash: "h", name: "B", emailVerifiedAt: day(-1), createdAt: day(-5) },
      { id: "usr_p", email: "p@x.vn", passwordHash: "h", name: "Người Xin", emailVerifiedAt: null, createdAt: day(0) },
    ],
    memberships: [
      { id: "mem_chau", orgId: "org_a", userId: "usr_chau", role: "ADMIN", status: "ACTIVE", invitedBy: null },
      { id: "mem_phong", orgId: "org_a", userId: "usr_phong", role: "OWNER", status: "ACTIVE", invitedBy: null },
      { id: "mem_ha", orgId: "org_a", userId: "usr_ha", role: "DECLARANT", status: "ACTIVE", invitedBy: null },
      { id: "mem_quang", orgId: "org_a", userId: "usr_quang", role: "VIEWER", status: "DISABLED", invitedBy: null },
      { id: "mem_b", orgId: "org_b", userId: "usr_b", role: "OWNER", status: "ACTIVE", invitedBy: null },
    ],
    sessions: [{ id: "ses_ha", userId: "usr_ha", orgId: "org_a", tokenHash: "x", expiresAt: day(10), lastSeenAt: day(-1) }],
    certificates: [
      { id: "cert_a1", orgId: "org_a", subject: "AN PHÁT", issuer: "VNPT-CA", serial: "S1", validTo: "2027-12-18", isDefault: true },
      { id: "cert_a2", orgId: "org_a", subject: "AN PHÁT", issuer: "Viettel-CA", serial: "S2", validTo: "2026-11-01", isDefault: false },
      { id: "cert_b1", orgId: "org_b", subject: "B", issuer: "VNPT-CA", serial: "SB", validTo: "2027-01-01", isDefault: true },
    ],
    notifications: [
      { id: "n1", orgId: "org_a", userId: "usr_chau", title: "a", body: "", href: null, readAt: null, createdAt: day(-1) },
      { id: "n2", orgId: "org_a", userId: "usr_chau", title: "b", body: "", href: null, readAt: null, createdAt: day(0) },
      { id: "n3", orgId: "org_a", userId: "usr_ha", title: "của hà", body: "", href: null, readAt: null, createdAt: day(0) },
    ],
    joinRequests: [{ id: "jr_1", orgId: "org_a", userId: "usr_p", status: "PENDING", createdAt: day(0) }],
  });
  mailer = new RecordingMailer();
  clock = fixedClock(T0);
  deps = { uow, plans: uow, hasher: new FakeHasher(), rateLimiter: new InMemoryRateLimiter(clock), mailer, taxRegistry: new FakeTaxRegistry(), clock, idGen: sequentialIdGen(), appUrl: "http://localhost:3100", random: (n) => Buffer.alloc(n, 7) };
});

describe("thành viên", () => {
  it("listMembers: đủ 4 người org A với trạng thái và lastActiveAt từ session", async () => {
    const list = unwrap(await listMembers(deps, ctx("VIEWER")));
    expect(list.map((m) => m.id).sort()).toEqual(["usr_chau", "usr_ha", "usr_phong", "usr_quang"]);
    expect(list.find((m) => m.id === "usr_quang")?.status).toBe("DISABLED");
    // RLS sessions chỉ lộ phiên của chính mình (BACKEND-TODO K1): usr_ha không có lastActiveAt khi usr_chau xem.
    expect(list.find((m) => m.id === "usr_ha")?.lastActiveAt).toBeUndefined();
  });
  it("org B không thấy thành viên org A", async () => {
    expect(unwrap(await listMembers(deps, ctx("OWNER", "usr_b", "org_b"))).map((m) => m.id)).toEqual(["usr_b"]);
  });
  it("inviteMember: tạo user + membership INVITED + mail; trùng → DUPLICATE; VIEWER → FORBIDDEN", async () => {
    const m = unwrap(await inviteMember(deps, ctx("ADMIN"), { email: "linh.do@anphat-demo.vn", role: "DECLARANT" }));
    expect(m).toMatchObject({ email: "linh.do@anphat-demo.vn", role: "DECLARANT", status: "INVITED", name: "Linh Do" });
    expect(mailer.sent[0]?.to).toBe("linh.do@anphat-demo.vn");
    expect(mailer.sent[0]?.text).toContain("/accept-invite?token=");
    expectErr(await inviteMember(deps, ctx("ADMIN"), { email: "ha@anphat-demo.vn", role: "VIEWER" }), "DUPLICATE");
    expectErr(await inviteMember(deps, ctx("VIEWER", "usr_quang"), { email: "x@y.vn", role: "VIEWER" }), "FORBIDDEN");
  });
  it("inviteMember: email đã có tài khoản ở org khác → thêm membership INVITED, không tạo user mới", async () => {
    unwrap(await inviteMember(deps, ctx("ADMIN"), { email: "b@b.vn", role: "VIEWER" }));
    expect(uow.data.users.filter((u) => u.email === "b@b.vn")).toHaveLength(1);
    expect(uow.data.memberships.find((m) => m.orgId === "org_a" && m.userId === "usr_b")?.status).toBe("INVITED");
  });
  it("changeMemberRole: DECLARANT → APPROVER; đổi OWNER → FORBIDDEN; người lạ → NOT_FOUND", async () => {
    expect(unwrap(await changeMemberRole(deps, ctx("ADMIN"), "usr_ha", "APPROVER")).role).toBe("APPROVER");
    expectErr(await changeMemberRole(deps, ctx("ADMIN"), "usr_phong", "ADMIN"), "FORBIDDEN");
    expectErr(await changeMemberRole(deps, ctx("ADMIN"), "usr_b", "ADMIN"), "NOT_FOUND");
  });
  it("setMemberDisabled: khóa OWNER → FORBIDDEN; tự khóa → FORBIDDEN; khóa/mở người khác ok", async () => {
    expectErr(await setMemberDisabled(deps, ctx("ADMIN"), "usr_phong", true), "FORBIDDEN");
    expectErr(await setMemberDisabled(deps, ctx("ADMIN"), "usr_chau", true), "FORBIDDEN");
    expect(unwrap(await setMemberDisabled(deps, ctx("ADMIN"), "usr_ha", true)).status).toBe("DISABLED");
    expect(unwrap(await setMemberDisabled(deps, ctx("ADMIN"), "usr_quang", false)).status).toBe("ACTIVE");
  });
  it("yêu cầu tham gia: liệt kê và duyệt → DECLARANT ACTIVE + thông báo + mail", async () => {
    const list = unwrap(await listJoinRequests(deps, ctx("ADMIN")));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "jr_1", email: "p@x.vn", name: "Người Xin" });
    const m = unwrap(await approveJoinRequest(deps, ctx("ADMIN"), "jr_1"));
    expect(m).toMatchObject({ id: "usr_p", role: "DECLARANT", status: "ACTIVE" });
    expect(uow.data.joinRequests[0]?.status).toBe("APPROVED");
    expect(uow.data.notifications.some((n) => n.userId === "usr_p")).toBe(true);
    expect(mailer.sent.some((x) => x.to === "p@x.vn")).toBe(true);
    expectErr(await approveJoinRequest(deps, ctx("ADMIN"), "jr_1"), "NOT_FOUND");
  });
});

describe("doanh nghiệp", () => {
  it("getOrganization trả DTO đúng gói; updateOrganization ADMIN ok, VIEWER → FORBIDDEN", async () => {
    expect(unwrap(await getOrganization(deps, ctx("VIEWER")))).toMatchObject({ name: "AN PHÁT", plan: { code: "PRO", name: "Chuyên nghiệp", dossiersPerMonth: 150 } });
    const o = unwrap(await updateOrganization(deps, ctx("ADMIN"), { name: "AN PHÁT MỚI", address: "HP 2", phone: "0225 3 888" }));
    expect(o.name).toBe("AN PHÁT MỚI");
    expectErr(await updateOrganization(deps, ctx("VIEWER", "usr_quang"), { name: "X", address: "", phone: "" }), "FORBIDDEN");
  });
  it("updateSuspectThreshold đổi ngưỡng", async () => {
    expect(unwrap(await updateSuspectThreshold(deps, ctx("OWNER", "usr_phong"), "STRICT")).suspectThreshold).toBe("STRICT");
  });
});

describe("chứng thư số", () => {
  it("list theo org; add đầu tiên của org mới là mặc định; remove mặc định → FORBIDDEN; setDefault đổi đúng", async () => {
    expect(unwrap(await listCertificates(deps, ctx("VIEWER"))).map((c) => c.id)).toEqual(["cert_a1", "cert_a2"]);
    expectErr(await removeCertificate(deps, ctx("ADMIN"), "cert_a1"), "FORBIDDEN");
    unwrap(await setDefaultCertificate(deps, ctx("ADMIN"), "cert_a2"));
    expect(unwrap(await listCertificates(deps, ctx("ADMIN"))).find((c) => c.isDefault)?.id).toBe("cert_a2");
    unwrap(await removeCertificate(deps, ctx("ADMIN"), "cert_a1"));
    expect(unwrap(await listCertificates(deps, ctx("ADMIN")))).toHaveLength(1);
    const added = unwrap(await addCertificate(deps, ctx("ADMIN"), { issuer: "FPT-CA", serial: "ab 12", validTo: "2028-01-01" }));
    expect(added).toMatchObject({ subject: "AN PHÁT", serial: "AB 12", isDefault: false });
  });
  it("org B không xóa/đặt mặc định được chứng thư của org A → NOT_FOUND", async () => {
    expectErr(await removeCertificate(deps, ctx("OWNER", "usr_b", "org_b"), "cert_a2"), "NOT_FOUND");
    expectErr(await setDefaultCertificate(deps, ctx("OWNER", "usr_b", "org_b"), "cert_a2"), "NOT_FOUND");
  });
});

describe("thông báo", () => {
  it("list chỉ của mình, mới nhất trước; markAllRead chỉ ảnh hưởng mình", async () => {
    const list = unwrap(await listNotifications(deps, ctx("ADMIN")));
    expect(list.map((n) => n.id)).toEqual(["n2", "n1"]);
    expect(list.every((n) => !n.read)).toBe(true);
    unwrap(await markAllNotificationsRead(deps, ctx("ADMIN")));
    expect(unwrap(await listNotifications(deps, ctx("ADMIN"))).every((n) => n.read)).toBe(true);
    expect(uow.data.notifications.find((n) => n.id === "n3")?.readAt).toBeNull();
  });
});
