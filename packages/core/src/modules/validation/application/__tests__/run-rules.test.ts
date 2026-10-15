import { describe, expect, it } from "vitest";
import type { DossierProfile } from "../../domain/helpers.js";
import { anphatExport, hansol, ORG, XK_SEA } from "../../domain/test/shipments.js";
import type { ValidationDeps, ValidationRow } from "../ports.js";
import { runRules } from "../run-rules.js";

/** Fake in-memory: kết quả theo (org, dossier); hồ sơ chỉ đọc được đúng org sở hữu. */
function fakeDeps(profiles: Record<string, { orgId: string; profile: DossierProfile }> | null) {
  const store = new Map<string, ValidationRow[]>();
  let n = 0;
  const deps: ValidationDeps = {
    uow: { asOrg: (ctx, fn) => fn({ validations: { replaceForDossier: async (dossierId, rows) => void store.set(`${ctx.orgId}:${dossierId}`, rows), listLatest: async (dossierId) => store.get(`${ctx.orgId}:${dossierId}`) ?? [] } }) },
    idGen: { next: () => `chk_${++n}` },
    clock: { now: () => new Date("2026-10-15T00:00:00Z") },
    ...(profiles ? { dossiers: { profile: async (orgId: string, dossierId: string) => (profiles[dossierId]?.orgId === orgId ? profiles[dossierId]!.profile : null) } } : {}),
  };
  return { deps, store };
}
const result = (checks: { ruleCode: string; result: string; detail: string }[], code: string) => checks.find((c) => c.ruleCode === code)!;

describe("runRules", () => {
  it("có port hồ sơ: luật biết hồ sơ XK → luật chỉ áp dụng nhập SKIPPED, luật container chạy", async () => {
    const { deps, store } = fakeDeps({ dos_1: { orgId: "org_a", profile: XK_SEA } });
    const checks = await runRules(deps, "org_a", "dos_1", anphatExport(), 1, ORG);
    expect(result(checks, "R-POD-TRANSSHIP").detail).toBe("Không áp dụng cho tờ khai xuất khẩu");
    expect(result(checks, "R-CONTAINER-LIST").result).toBe("PASS");
    expect(store.get("org_a:dos_1")).toHaveLength(26);
  });
  it("không có port: chạy như cũ, luật cần hồ sơ SKIPPED", async () => {
    const { deps } = fakeDeps(null);
    const checks = await runRules(deps, "org_a", "dos_1", hansol(), 1, ORG);
    expect(result(checks, "R-CONTAINER-LIST").result).toBe("SKIPPED");
    expect(result(checks, "R-POD-TRANSSHIP").result).toBe("PASS");
  });
  it("org khác không đọc được hồ sơ → coi như chưa có hồ sơ, ghi kết quả vào đúng org gọi", async () => {
    const { deps, store } = fakeDeps({ dos_1: { orgId: "org_a", profile: XK_SEA } });
    const checks = await runRules(deps, "org_b", "dos_1", anphatExport(), 1, ORG);
    expect(result(checks, "R-POD-TRANSSHIP").result).toBe("WARN");
    expect(result(checks, "R-CONTAINER-LIST").result).toBe("SKIPPED");
    expect(store.has("org_a:dos_1")).toBe(false);
    expect(store.get("org_b:dos_1")).toHaveLength(26);
  });
});
