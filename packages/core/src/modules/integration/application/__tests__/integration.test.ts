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
  it("listIntegrations: 4 mục cố định, trạng thái mặc định theo cấu hình (chưa kiểm tra)", async () => {
    const deps = makeDeps();
    const list = unwrap(await listIntegrations(deps, ctx("VIEWER")));
    expect(list.map((i) => i.id)).toEqual(["HSCODEPRO", "CUSTOMS_HUB", "AI_PROVIDER", "EINVOICE"]);
    expect(list.find((i) => i.id === "EINVOICE")?.status).toBe("NOT_CONFIGURED");
    expect(list.find((i) => i.id === "AI_PROVIDER")?.status).toBe("CONNECTED");
  });
  it("testIntegration: probe ok → CONNECTED + lastCheckedAt; probe lỗi → ERROR + detail; lưu lại cho lần list sau", async () => {
    const deps = makeDeps();
    const ai = unwrap(await testIntegration(deps, ctx("ADMIN"), "AI_PROVIDER"));
    expect(ai).toMatchObject({ status: "CONNECTED", detail: "fake", lastCheckedAt: "2026-10-13T00:00:00.000Z" });
    const hub = unwrap(await testIntegration(deps, ctx("ADMIN"), "CUSTOMS_HUB"));
    expect(hub).toMatchObject({ status: "ERROR", detail: "Chứng thư số mặc định sắp hết hạn" });
    const list = unwrap(await listIntegrations(deps, ctx("VIEWER")));
    expect(list.find((i) => i.id === "CUSTOMS_HUB")?.status).toBe("ERROR");
  });
  it("EINVOICE chưa cấu hình → INTEGRATION_NOT_CONFIGURED; VIEWER → FORBIDDEN", async () => {
    const deps = makeDeps();
    const r = await testIntegration(deps, ctx("ADMIN"), "EINVOICE");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INTEGRATION_NOT_CONFIGURED");
    const v = await testIntegration(deps, ctx("VIEWER"), "AI_PROVIDER");
    if (!v.ok) expect(v.error.code).toBe("FORBIDDEN");
    else throw new Error("phải bị từ chối");
  });
  it("org khác không thấy trạng thái đã kiểm tra của org A", async () => {
    const deps = makeDeps();
    unwrap(await testIntegration(deps, ctx("ADMIN"), "AI_PROVIDER"));
    const other = unwrap(await listIntegrations(deps, ctx("ADMIN", "org_b")));
    expect(other.find((i) => i.id === "AI_PROVIDER")?.lastCheckedAt).toBeUndefined();
  });
});
