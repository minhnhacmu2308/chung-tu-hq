import { describe, expect, it } from "vitest";
import { AdminOrgSchema, AnnouncementSchema, STAFF_PERMISSIONS, StaffRoleSchema, staffCan, UsageMonthSchema } from "./admin.js";
import { AdjustOrgCreditsInputSchema, AdminReasonSchema, CreateOrgInputSchema, SendAnnouncementInputSchema, UpsertOrgContractInputSchema } from "../api/admin.js";

describe("staffCan", () => {
  it("Quản trị cấp cao làm được mọi thứ", () => {
    for (const p of ["VIEW", "SUPPORT", "BILLING", "PLATFORM", "STAFF"] as const) expect(staffCan("SUPER_ADMIN", p)).toBe(true);
  });
  it("Hỗ trợ: thao tác hỗ trợ khách được, không đụng gói / khóa API / quản trị viên", () => {
    expect(staffCan("SUPPORT", "SUPPORT")).toBe(true);
    expect(staffCan("SUPPORT", "BILLING")).toBe(false);
    expect(staffCan("SUPPORT", "PLATFORM")).toBe(false);
    expect(staffCan("SUPPORT", "STAFF")).toBe(false);
  });
  it("Chỉ xem: chỉ có quyền VIEW", () => {
    expect(STAFF_PERMISSIONS.READONLY).toEqual(["VIEW"]);
  });
  it("mọi vai trò đều xem được", () => {
    for (const r of StaffRoleSchema.options) expect(staffCan(r, "VIEW")).toBe(true);
  });
});

describe("schema back-office", () => {
  const org = {
    id: "org_1", name: "CÔNG TY A", taxCode: "0316789012", status: "ACTIVE",
    plan: { code: "PAYG", name: "Theo lượt", kind: "PAYG", pagesPerDossier: 40, pricePerDeclarationVnd: "25000" },
    billing: { balance: 12, contract: null, declarationsThisMonth: 4, declarations30d: 9 }, usage: { dossiersThisMonth: 37, pagesThisMonth: 412, aiCostVnd: "96500" },
    memberCount: 6, ownerName: "Trần Văn Phong", ownerEmail: "phong@a.vn", createdAt: "2026-06-01T02:00:00.000Z",
  };
  it("AdminOrgSchema: MST là chuỗi, chi phí là chuỗi thập phân", () => {
    expect(AdminOrgSchema.parse(org)).toEqual(org);
    expect(AdminOrgSchema.safeParse({ ...org, taxCode: 316789012 }).success).toBe(false);
    expect(AdminOrgSchema.safeParse({ ...org, usage: { ...org.usage, aiCostVnd: 96500 } }).success).toBe(false);
  });
  it.each(["2026-10", "2026-01"])("UsageMonthSchema nhận %s", (m) => expect(UsageMonthSchema.safeParse(m).success).toBe(true));
  it.each(["2026-13", "2026-1", "10-2026"])("UsageMonthSchema từ chối %s", (m) => expect(UsageMonthSchema.safeParse(m).success).toBe(false));
  it("AnnouncementSchema: audience là ALL hoặc mã gói", () => {
    const a = { id: "ann_1", title: "Bảo trì", body: "Hệ thống bảo trì.", kind: "INFO", audience: "PAYG", status: "SENT", sentAt: "2026-10-13T02:00:00.000Z", sentByName: "A", recipients: 3 };
    expect(AnnouncementSchema.parse(a)).toEqual(a);
    expect(AnnouncementSchema.safeParse({ ...a, audience: "VIP" }).success).toBe(false);
  });
});

describe("input back-office", () => {
  it("lý do: bỏ khoảng trắng, ít nhất 5 ký tự", () => {
    expect(AdminReasonSchema.safeParse("   ok  ").success).toBe(false);
    expect(AdminReasonSchema.parse("  Khách yêu cầu  ")).toBe("Khách yêu cầu");
  });
  it("điều chỉnh lượt: số nguyên khác 0; nạp/tặng phải dương; bắt buộc ghi chú", () => {
    const ok = { delta: 20, kind: "MANUAL_TOPUP", note: "Chuyển khoản ngày 05/11", reason: "Khách chuyển khoản ngoài" };
    expect(AdjustOrgCreditsInputSchema.safeParse(ok).success).toBe(true);
    expect(AdjustOrgCreditsInputSchema.safeParse({ ...ok, delta: 0 }).success).toBe(false);
    expect(AdjustOrgCreditsInputSchema.safeParse({ ...ok, delta: 1.5 }).success).toBe(false);
    expect(AdjustOrgCreditsInputSchema.safeParse({ ...ok, delta: -2 }).success).toBe(false);
    expect(AdjustOrgCreditsInputSchema.safeParse({ ...ok, kind: "ADJUST", delta: -2 }).success).toBe(true);
    expect(AdjustOrgCreditsInputSchema.safeParse({ ...ok, note: "" }).success).toBe(false);
    expect(AdjustOrgCreditsInputSchema.safeParse({ ...ok, kind: "CHARGE" }).success).toBe(false);
  });
  it("hợp đồng: ngày kết thúc không trước ngày bắt đầu, giá trị không âm", () => {
    const ok = { contractNo: "HD-01", startsOn: "2026-01-01", endsOn: "2026-12-31", valueVnd: "120000000", reason: "Ký hợp đồng năm" };
    expect(UpsertOrgContractInputSchema.safeParse(ok).success).toBe(true);
    expect(UpsertOrgContractInputSchema.safeParse({ ...ok, endsOn: "2025-12-31" }).success).toBe(false);
    expect(UpsertOrgContractInputSchema.safeParse({ ...ok, valueVnd: "-1" }).success).toBe(false);
  });
  it("tạo doanh nghiệp: mã gói mới PAYG/CONTRACT", () => {
    const base = { taxCode: "0316789012", name: "CÔNG TY A", address: "", owner: { email: "a@a.vn", name: "Nguyễn A" } };
    expect(CreateOrgInputSchema.safeParse({ ...base, planCode: "PAYG", grantCredits: 5 }).success).toBe(true);
    expect(CreateOrgInputSchema.safeParse({ ...base, planCode: "PRO" }).success).toBe(false);
  });
  it("thông báo bảo trì bắt buộc có ngày bảo trì", () => {
    const base = { title: "Bảo trì hệ thống", body: "Hệ thống tạm ngưng 30 phút.", audience: "ALL" as const };
    expect(SendAnnouncementInputSchema.safeParse({ ...base, kind: "INFO" }).success).toBe(true);
    expect(SendAnnouncementInputSchema.safeParse({ ...base, kind: "MAINTENANCE" }).success).toBe(false);
    expect(SendAnnouncementInputSchema.safeParse({ ...base, kind: "MAINTENANCE", maintenanceDate: "2026-10-20" }).success).toBe(true);
  });
});
