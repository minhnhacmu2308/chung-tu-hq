import type { AdminOrg } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { errCode } from "../../../../shared/result.js";
import { buildAttention } from "../attention.js";
import { daysUntil, recentMonths, vnMonth, vnMonthRange } from "../period.js";
import { deviceLabel, sanitizeJobError } from "../sanitize.js";
import { keepsASuperAdmin, requirePermission } from "../staff-rules.js";

const NOW = new Date("2026-10-14T03:00:00Z");
const d = (iso: string) => new Date(iso);

describe("tháng báo cáo", () => {
  it("tháng VN: 31/10 20:00 UTC đã là tháng 11 ở VN; khoảng tháng VN theo UTC", () => {
    expect(vnMonth(d("2026-10-31T16:59:59Z"))).toBe("2026-10");
    expect(vnMonth(d("2026-10-31T17:00:00Z"))).toBe("2026-11");
    expect(vnMonthRange("2026-10")).toEqual({ from: d("2026-09-30T17:00:00Z"), to: d("2026-10-31T17:00:00Z") });
    expect(recentMonths(NOW, 3)).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(recentMonths(d("2026-01-05T00:00:00Z"), 2)).toEqual(["2026-01", "2025-12"]);
  });

  it("daysUntil: số ngày tới một ngày (âm = đã qua)", () => {
    expect(daysUntil(d("2026-10-21T00:00:00Z"), NOW)).toBe(7);
    expect(daysUntil(d("2026-10-10T00:00:00Z"), NOW)).toBe(-4);
  });
});

describe("lọc thông tin kỹ thuật", () => {
  it("lỗi job: bỏ đường dẫn, tên tệp, chuỗi trích dẫn; chỉ dòng đầu; tối đa 200 ký tự", () => {
    expect(sanitizeJobError("Không đọc được /var/data/orgs/org_1/dossiers/x/Hoa don ABC.pdf\n    at foo (bar.ts:1)")).toBe("Không đọc được <đường dẫn>");
    expect(sanitizeJobError('PDF "Commercial Invoice HANSOL" có mật khẩu')).toBe("PDF <…> có mật khẩu");
    expect(sanitizeJobError("Lỗi khi mở Packing List.pdf")).toBe("Lỗi khi mở <tệp>");
    expect(sanitizeJobError("")).toBe("Lỗi không rõ nguyên nhân");
    expect(sanitizeJobError("x".repeat(300))).toHaveLength(198);
  });
  it("thiết bị từ User-Agent", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36")).toBe("Chrome · Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari · iOS");
    expect(deviceLabel(null)).toBe("Không rõ thiết bị");
  });
});

describe("quản trị viên", () => {
  const actor = (role: "SUPER_ADMIN" | "SUPPORT" | "READONLY", status: "ACTIVE" | "INVITED" | "DISABLED" = "ACTIVE") => ({ userId: "u", name: "U", email: "u@x.vn", role, status });
  it("quyền theo bảng STAFF_PERMISSIONS; tài khoản bị khóa → UNAUTHENTICATED", () => {
    expect(requirePermission(actor("READONLY"), "VIEW").ok).toBe(true);
    expect(errCode(requirePermission(actor("READONLY"), "SUPPORT"))).toBe("FORBIDDEN");
    expect(errCode(requirePermission(actor("SUPPORT"), "BILLING"))).toBe("FORBIDDEN");
    expect(requirePermission(actor("SUPER_ADMIN"), "STAFF").ok).toBe(true);
    expect(errCode(requirePermission(actor("SUPER_ADMIN", "DISABLED"), "VIEW"))).toBe("UNAUTHENTICATED");
  });
  it("không được để mất Quản trị cấp cao cuối cùng", () => {
    const all = [
      { userId: "a", role: "SUPER_ADMIN" as const, status: "ACTIVE" as const },
      { userId: "b", role: "SUPER_ADMIN" as const, status: "DISABLED" as const },
      { userId: "c", role: "SUPPORT" as const, status: "ACTIVE" as const },
    ];
    expect(errCode(keepsASuperAdmin(all, "a", { role: "SUPPORT", status: "ACTIVE" }))).toBe("CONFLICT");
    expect(errCode(keepsASuperAdmin(all, "a", { role: "SUPER_ADMIN", status: "DISABLED" }))).toBe("CONFLICT");
    expect(keepsASuperAdmin(all, "c", { role: "SUPER_ADMIN", status: "ACTIVE" }).ok).toBe(true);
    expect(keepsASuperAdmin(all, "b", { role: "SUPER_ADMIN", status: "ACTIVE" }).ok).toBe(true);
  });
});

describe("cần chú ý", () => {
  const PAYG = { code: "PAYG" as const, name: "Theo lượt", kind: "PAYG" as const, pagesPerDossier: 40, pricePerDeclarationVnd: "25000" };
  const CONTRACT = { code: "CONTRACT" as const, name: "Hợp đồng năm", kind: "CONTRACT" as const, pagesPerDossier: 100, pricePerDeclarationVnd: "0" };
  const contract = (endsOn: string | null, status: "ACTIVE" | "EXPIRING" | "GRACE" | "EXPIRED", daysLeft: number | null) => ({ contractNo: "HĐ", startsOn: null, endsOn, status, daysLeft });
  const org = (over: Partial<AdminOrg> & { id: string }): AdminOrg => ({
    name: over.id, taxCode: "0100000000", status: "ACTIVE", memberCount: 1, ownerName: "A", ownerEmail: "a@x.vn", createdAt: "2026-01-01T00:00:00.000Z",
    plan: PAYG, billing: { balance: 20, contract: null, declarationsThisMonth: 0, declarations30d: 5 },
    usage: { dossiersThisMonth: 0, pagesThisMonth: 0, aiCostVnd: "0" },
    ...over,
  });
  it("PAYG ≤ 3 lượt và có khai 30 ngày (0 lượt đỏ); hợp đồng sắp hết / ân hạn / hết hạn / chưa có ngày kết thúc; tích hợp lỗi; job lỗi; yêu cầu tham gia > 3 ngày; đỏ đứng trước", () => {
    const items = buildAttention({
      orgs: [
        org({ id: "low", billing: { balance: 3, contract: null, declarationsThisMonth: 2, declarations30d: 4 } }),
        org({ id: "empty", billing: { balance: 0, contract: null, declarationsThisMonth: 1, declarations30d: 1 } }),
        org({ id: "idle", billing: { balance: 1, contract: null, declarationsThisMonth: 0, declarations30d: 0 } }),
        org({ id: "rich", billing: { balance: 4, contract: null, declarationsThisMonth: 9, declarations30d: 9 } }),
        org({ id: "expiring", plan: CONTRACT, billing: { balance: 0, contract: contract("2026-11-01", "EXPIRING", 18), declarationsThisMonth: 0, declarations30d: 0 } }),
        org({ id: "grace", plan: CONTRACT, billing: { balance: 0, contract: contract("2026-10-10", "GRACE", -4), declarationsThisMonth: 0, declarations30d: 0 } }),
        org({ id: "expired", plan: CONTRACT, billing: { balance: 0, contract: contract("2026-09-01", "EXPIRED", -43), declarationsThisMonth: 0, declarations30d: 0 } }),
        org({ id: "noend", plan: CONTRACT, billing: { balance: 0, contract: contract(null, "ACTIVE", null), declarationsThisMonth: 0, declarations30d: 0 } }),
        org({ id: "fine", plan: CONTRACT, billing: { balance: 0, contract: contract("2027-06-01", "ACTIVE", 230), declarationsThisMonth: 0, declarations30d: 0 } }),
        org({ id: "suspended", status: "SUSPENDED", billing: { balance: 0, contract: null, declarationsThisMonth: 0, declarations30d: 9 } }),
      ],
      integrations: [{ id: "HSCODEPRO", name: "hscodepro", status: "ERROR", detail: "401" }, { id: "AI_PROVIDER", name: "AI", status: "CONNECTED" }],
      failedJobs: 2,
      pendingJoins: [d("2026-10-01T00:00:00Z"), d("2026-10-13T00:00:00Z")],
      now: NOW,
    });
    expect(items.map((i) => `${i.severity}:${i.id}`)).toEqual([
      "danger:low_credits_empty", "danger:contract_expired_expired", "danger:integration_HSCODEPRO",
      "warning:low_credits_low", "warning:contract_expiring_expiring", "warning:contract_expired_grace", "warning:contract_no_end_noend", "warning:jobs_failed", "warning:join_pending",
    ]);
    expect(items.find((i) => i.id === "join_pending")?.title).toMatch(/^1 yêu cầu/);
  });
});
