import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import { sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import { notifyExpiringCertificates } from "../notify-expiring-certificates.js";
import type { IdentityDeps } from "../ports.js";
import { FakeHasher, FakeTaxRegistry, InMemoryRateLimiter, RecordingMailer } from "../test/fakes.js";
import { InMemoryIdentityUow } from "../test/in-memory-uow.js";

const T0 = "2026-10-13T00:00:00.000Z";
const day = (n: number) => new Date(new Date(T0).getTime() + n * 86_400_000);

let uow: InMemoryIdentityUow;
let deps: IdentityDeps;

beforeEach(() => {
  uow = new InMemoryIdentityUow().seed({
    orgs: [
      { id: "org_a", taxCode: "0316789012", name: "AN PHÁT", address: "HP", phone: "0225", planCode: "PRO", suspectThreshold: "BALANCED", fourEyes: false, createdAt: day(-40) },
      { id: "org_b", taxCode: "0100000002", name: "B", address: "", phone: "", planCode: "PRO", suspectThreshold: "BALANCED", fourEyes: false, createdAt: day(-5) },
    ],
    memberships: [
      { id: "mem_chau", orgId: "org_a", userId: "usr_chau", role: "ADMIN", status: "ACTIVE", invitedBy: null },
      { id: "mem_phong", orgId: "org_a", userId: "usr_phong", role: "OWNER", status: "ACTIVE", invitedBy: null },
      { id: "mem_ha", orgId: "org_a", userId: "usr_ha", role: "DECLARANT", status: "ACTIVE", invitedBy: null },
      { id: "mem_quang", orgId: "org_a", userId: "usr_quang", role: "ADMIN", status: "DISABLED", invitedBy: null },
      { id: "mem_b", orgId: "org_b", userId: "usr_b", role: "OWNER", status: "ACTIVE", invitedBy: null },
    ],
    certificates: [
      { id: "cert_a1", orgId: "org_a", subject: "AN PHÁT", issuer: "VNPT-CA", serial: "S1", validTo: "2027-12-18", isDefault: true },
      { id: "cert_a2", orgId: "org_a", subject: "AN PHÁT", issuer: "Viettel-CA", serial: "S2", validTo: "2026-11-01", isDefault: false },
      { id: "cert_a3", orgId: "org_a", subject: "AN PHÁT", issuer: "FPT-CA", serial: "S3", validTo: "2026-10-01", isDefault: false },
      { id: "cert_b1", orgId: "org_b", subject: "B", issuer: "VNPT-CA", serial: "SB", validTo: "2027-01-01", isDefault: true },
    ],
  });
  const clock = fixedClock(T0);
  deps = { uow, plans: uow, hasher: new FakeHasher(), rateLimiter: new InMemoryRateLimiter(clock), mailer: new RecordingMailer(), taxRegistry: new FakeTaxRegistry(), clock, idGen: sequentialIdGen(), appUrl: "http://localhost:3100", random: (n) => Buffer.alloc(n, 7) };
});

describe("notifyExpiringCertificates", () => {
  it("chứng thư còn ≤ 30 ngày → thông báo OWNER/ADMIN đang hoạt động; bỏ qua DECLARANT, người bị khóa, chứng thư đã hết hạn và còn xa", async () => {
    const r = unwrap(await notifyExpiringCertificates(deps));
    expect(r.notified).toBe(2);
    expect(uow.data.notifications.map((n) => [n.orgId, n.userId]).sort()).toEqual([["org_a", "usr_chau"], ["org_a", "usr_phong"]]);
    expect(uow.data.notifications[0]).toMatchObject({ title: "Chứng thư số Viettel-CA hết hạn 2026-11-01", href: "/settings?tab=certificates", readAt: null, createdAt: new Date(T0) });
  });

  it("đúng ngày thứ 30 vẫn tính là sắp hết hạn", async () => {
    uow.data.certificates = [{ id: "c30", orgId: "org_b", subject: "B", issuer: "BKAV-CA", serial: "X", validTo: "2026-11-12", isDefault: true }];
    expect(unwrap(await notifyExpiringCertificates(deps)).notified).toBe(1);
  });

  it("daysAhead lớn hơn → thông báo cả org B; mỗi org chỉ báo cho quản lý của chính org đó", async () => {
    const r = unwrap(await notifyExpiringCertificates(deps, { daysAhead: 90 }));
    expect(r.notified).toBe(3);
    expect(uow.data.notifications.filter((n) => n.orgId === "org_b").map((n) => n.userId)).toEqual(["usr_b"]);
    expect(uow.data.notifications.filter((n) => n.orgId === "org_a").every((n) => n.userId !== "usr_b")).toBe(true);
  });

  it("không có chứng thư sắp hết hạn → không gửi gì", async () => {
    uow.data.certificates = uow.data.certificates.filter((c) => c.id !== "cert_a2");
    expect(unwrap(await notifyExpiringCertificates(deps))).toEqual({ notified: 0 });
    expect(uow.data.notifications).toEqual([]);
  });

  it("không có org nào → 0", async () => {
    uow.data.orgs = [];
    expect(unwrap(await notifyExpiringCertificates(deps))).toEqual({ notified: 0 });
  });

  // Nghi lỗi (báo cáo, chưa sửa): job chạy asOrg với userId "" nên RLS notifications (user_id = current user)
  // trả rỗng cho `notifications.list(org, m.userId)` → kiểm tra trùng trong ngày không bao giờ thấy bản đã gửi;
  // chạy job 2 lần cùng ngày → gửi trùng (lần 2 vẫn notified = 2, thay vì 0).
  it("chạy lại trong cùng ngày → không gửi trùng (notified = 0)", async () => {
    expect(unwrap(await notifyExpiringCertificates(deps)).notified).toBe(2);
    expect(unwrap(await notifyExpiringCertificates(deps))).toEqual({ notified: 0 });
    expect(uow.data.notifications).toHaveLength(2);
  });
});
