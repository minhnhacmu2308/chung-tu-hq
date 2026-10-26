import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import { listIntegrations } from "../list-integrations.js";
import type { IntegrationDeps, IntegrationStatusRow } from "../ports.js";
import { testIntegration } from "../test-integration.js";

const ctx = (role: Ctx["role"], orgId = "org_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId("usr_a"), role });

function makeDeps(overrides: Partial<IntegrationDeps> = {}): IntegrationDeps & { rows: IntegrationStatusRow[] } {
  const rows: IntegrationStatusRow[] = [];
  return {
    rows,
    statusRepo: {
      list: async (orgId) => rows.filter((r) => r.orgId === orgId),
      upsert: async (row) => {
        const i = rows.findIndex((r) => r.orgId === row.orgId && r.kind === row.kind);
        if (i >= 0) rows[i] = row;
        else rows.push(row);
      },
    },
    probes: {
      HSCODEPRO: { configured: true, probe: async () => ({ ok: true, detail: "giả lập" }) },
      AI_PROVIDER: { configured: true, probe: async () => ({ ok: true, detail: "fake" }) },
      CUSTOMS_HUB: { configured: true, probe: async () => ({ ok: false, detail: "Chứng thư số mặc định sắp hết hạn" }) },
      EINVOICE: { configured: false, probe: async () => ({ ok: false, detail: "" }) },
    },
    clock: fixedClock("2026-10-13T00:00:00.000Z"),
    idGen: { next: (p) => `${p}_1` },
    ...overrides,
  };
}

describe("integration", () => {
  it("listIntegrations: doanh nghiệp chỉ thấy Customs Hub (VNACCS); dịch vụ nền tảng (AI, hscodepro, HĐĐT) ẩn", async () => {
    const deps = makeDeps();
    const list = unwrap(await listIntegrations(deps, ctx("VIEWER")));
    expect(list.map((i) => i.id)).toEqual(["CUSTOMS_HUB"]);
    expect(list[0]?.status).toBe("CONNECTED");
  });
  it("testIntegration: probe lỗi → ERROR + detail + lastCheckedAt; lưu lại cho lần list sau", async () => {
    const deps = makeDeps();
    const hub = unwrap(await testIntegration(deps, ctx("ADMIN"), "CUSTOMS_HUB"));
    expect(hub).toMatchObject({ status: "ERROR", detail: "Chứng thư số mặc định sắp hết hạn", lastCheckedAt: "2026-10-13T00:00:00.000Z" });
    const list = unwrap(await listIntegrations(deps, ctx("VIEWER")));
    expect(list.find((i) => i.id === "CUSTOMS_HUB")?.status).toBe("ERROR");
  });
  it("dịch vụ nền tảng → NOT_FOUND (doanh nghiệp không kiểm được); VIEWER → FORBIDDEN", async () => {
    const deps = makeDeps();
    for (const kind of ["AI_PROVIDER", "HSCODEPRO", "EINVOICE"] as const) {
      const r = await testIntegration(deps, ctx("ADMIN"), kind);
      expect(r.ok ? null : r.error.code).toBe("NOT_FOUND");
    }
    const v = await testIntegration(deps, ctx("VIEWER"), "CUSTOMS_HUB");
    expect(v.ok ? null : v.error.code).toBe("FORBIDDEN");
  });
  it("org khác không thấy trạng thái đã kiểm tra của org A", async () => {
    const deps = makeDeps();
    unwrap(await testIntegration(deps, ctx("ADMIN"), "CUSTOMS_HUB"));
    const other = unwrap(await listIntegrations(deps, ctx("ADMIN", "org_b")));
    expect(other.find((i) => i.id === "CUSTOMS_HUB")?.lastCheckedAt).toBeUndefined();
  });
});
