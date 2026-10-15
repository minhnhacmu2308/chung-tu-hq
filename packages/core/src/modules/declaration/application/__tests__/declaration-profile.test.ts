import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { DOSSIER, hansol, ORG } from "../../domain/test/shipment.js";
import { getAgentRun, runAgent, startAgentRun } from "../agent-run.js";
import { getDeclarationProfile, listRuleOptions, saveDeclarationProfile } from "../declaration-profile.js";
import { getDeclarationView } from "../declaration.js";
import { confirmHs, listLineItems } from "../line-items.js";
import type { DeclarationDeps } from "../ports.js";
import { FakeDossiers, FakeShipments, fakeOrg, fakeUsers, fakeValidation, RecordingAudit, ScriptedHs } from "../test/fakes.js";
import { InMemoryDeclarationUow } from "../test/in-memory-uow.js";

const ctx = (role: Ctx["role"], org = "org_a"): Ctx => ({ orgId: asOrgId(org), userId: asUserId(`usr_${role}`), role });
let uow: InMemoryDeclarationUow;
let deps: DeclarationDeps;
let queue: InMemoryJobQueue;

beforeEach(() => {
  uow = new InMemoryDeclarationUow();
  uow.data.catalogHs.push({ code: "8482.10.00", description: "Ổ bi cầu", mfn: "3", pref: {}, vat: "8", policy: null, keywords: ["bearing"] });
  uow.data.exchangeRates.push({ currency: "USD", date: "2026-10-13", rate: "25400" });
  queue = new InMemoryJobQueue();
  deps = {
    uow, queue, hs: new ScriptedHs([{ match: /./, code: "8482.10.00", description: "Ổ bi", confidence: 0.9 }]),
    shipments: new FakeShipments({ dos_1: hansol() }, { dos_1: [] }), dossiers: new FakeDossiers([{ ...DOSSIER, orgId: "org_a", status: "NEEDS_REVIEW", step: "ocr" }], { dos_1: [] }),
    validation: fakeValidation({}), org: fakeOrg(ORG), audit: new RecordingAudit(), users: fakeUsers, clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
});

describe("mặc định khai báo", () => {
  it("chưa cấu hình → rỗng; ADMIN lưu NK → đọc lại đúng; VIEWER đọc được", async () => {
    expect(unwrap(await getDeclarationProfile(deps, ctx("VIEWER"), "NK"))).toEqual({ direction: "NK", values: {}, overrides: {}, updatedAt: null });
    unwrap(await saveDeclarationProfile(deps, ctx("ADMIN"), "NK", { values: { KHO: "03CCS01", PT_TT: "TTR – Điện chuyển tiền" }, overrides: { KHO: { sources: ["an.warehouse", "profile.KHO"] } } }));
    expect(unwrap(await getDeclarationProfile(deps, ctx("VIEWER"), "NK"))).toMatchObject({ values: { KHO: "03CCS01", PT_TT: "TTR – Điện chuyển tiền" }, overrides: { KHO: { sources: ["an.warehouse", "profile.KHO"] } }, updatedAt: "2026-10-14T03:00:00.000Z" });
    expect(unwrap(await getDeclarationProfile(deps, ctx("ADMIN"), "XK")).values).toEqual({});
  });
  it("ghi đè đã lưu nay không còn hợp lệ (nguồn bị bỏ / chỉ tiêu bị khóa) → lưu lại không bị chặn, ghi đè cũ bị loại; ghi đè MỚI sai vẫn bị từ chối", async () => {
    uow.data.profiles.push({ id: "dec_old", orgId: "org_a", direction: "NK", values: {}, overrides: { KHO: { sources: ["nguon.da.bo"] }, TONG_TG: { fixed: "1" } }, updatedBy: "usr_ADMIN", updatedAt: new Date("2026-10-01T00:00:00Z") });
    const saved = unwrap(await saveDeclarationProfile(deps, ctx("ADMIN"), "NK", { values: { KHO: "03CCS01" }, overrides: { KHO: { sources: ["nguon.da.bo"] }, TONG_TG: { fixed: "1" }, PT_TT: { sources: ["profile.PT_TT"] } } }));
    expect(saved.overrides).toEqual({ PT_TT: { sources: ["profile.PT_TT"] } });
    expect(saved.values).toEqual({ KHO: "03CCS01" });
    expect(errCode(await saveDeclarationProfile(deps, ctx("ADMIN"), "NK", { values: {}, overrides: { KHO: { sources: ["la"] } } }))).toBe("VALIDATION");
  });
  it("DECLARANT/APPROVER không lưu được → FORBIDDEN", async () => {
    expect(errCode(await saveDeclarationProfile(deps, ctx("DECLARANT"), "NK", { values: { KHO: "03CCS01" }, overrides: {} }))).toBe("FORBIDDEN");
    expect(errCode(await saveDeclarationProfile(deps, ctx("APPROVER"), "NK", { values: {}, overrides: {} }))).toBe("FORBIDDEN");
  });
  it("giá trị sai: mã ngoài danh sách, KHO quá 7 ký tự → VALIDATION nêu chỉ tiêu; ghi đè chỉ tiêu trị giá → FORBIDDEN", async () => {
    const r1 = await saveDeclarationProfile(deps, ctx("ADMIN"), "NK", { values: { SO_HD: "1" }, overrides: {} });
    expect(errCode(r1)).toBe("VALIDATION");
    const r2 = await saveDeclarationProfile(deps, ctx("ADMIN"), "NK", { values: { KHO: "QUA_DAI_12345" }, overrides: {} });
    expect(r2).toMatchObject({ ok: false, error: { code: "VALIDATION", message: expect.stringContaining("KHO") } });
    expect(errCode(await saveDeclarationProfile(deps, ctx("ADMIN"), "NK", { values: {}, overrides: { TONG_TG: { fixed: "1" } } }))).toBe("FORBIDDEN");
  });
  it("org B không đọc được cấu hình của org A", async () => {
    unwrap(await saveDeclarationProfile(deps, ctx("ADMIN"), "NK", { values: { KHO: "03CCS01" }, overrides: {} }));
    expect(unwrap(await getDeclarationProfile(deps, ctx("OWNER", "org_b"), "NK")).values).toEqual({});
  });
  it("dựng tờ khai dùng mặc định khai báo + ghi đè của org", async () => {
    unwrap(await saveDeclarationProfile(deps, ctx("OWNER"), "NK", { values: { KHO: "03CCS01" }, overrides: { KHAI_TG: { fixed: "1 – Khai trị giá tổng hợp" } } }));
    const declarant = ctx("DECLARANT");
    unwrap(await startAgentRun(deps, declarant, "dos_1", "DECLARATION"));
    const job = queue.jobs.at(-1)!.payload as { agentRunId: string };
    unwrap(await runAgent(deps, { orgId: "org_a", userId: declarant.userId, dossierId: "dos_1", agentRunId: job.agentRunId }));
    for (const it of unwrap(await listLineItems(deps, declarant, "dos_1"))) unwrap(await confirmHs(deps, declarant, it.id, "8482.10.00"));
    expect(unwrap(await getAgentRun(deps, declarant, "dos_1"))).toBeTruthy();
    const fields = unwrap(await getDeclarationView(deps, declarant, "dos_1")).declaration!.fields;
    expect(fields.find((f) => f.code === "KHO")).toMatchObject({ value: "03CCS01", provenance: { rule: "KHO", via: "profile" } });
    expect(fields.find((f) => f.code === "KHAI_TG")).toMatchObject({ value: "1 – Khai trị giá tổng hợp", provenance: { via: "fixed" } });
    expect(fields.find((f) => f.code === "SO_HD")?.provenance).toEqual({ rule: "SO_HD", via: "default" });
  });
  it("listRuleOptions: chỉ tiêu được cấu hình và chỉ tiêu bị khóa", () => {
    const v = listRuleOptions("NK");
    expect(v.find((x) => x.code === "KHO")?.locked).toBe(false);
    expect(v.find((x) => x.code === "TONG_TG")?.locked).toBe(true);
  });
});
