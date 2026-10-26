// Luồng GĐ 3 (skill) trên Postgres thật: seed skill mẫu → org demo có skill → đăng ký org mới tự sao chép (hook identity)
// → sửa trường tạo phiên bản → upload mẫu → AI giả đọc → xác nhận → đánh giá → RLS: org khác không thấy, skill mẫu không lộ.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { runSeed, SYSTEM_ORG_ID } from "../db/seed/index.js";
import { startTestDb, type TestDb } from "../db/test-db.js";
import { systemClock } from "../shared/clock.js";
import type { Ctx } from "../shared/ctx.js";
import { asOrgId, asUserId, ulidIdGen } from "../shared/ids.js";
import { InMemoryJobQueue } from "../shared/queue.js";
import { errCode, unwrap } from "../shared/result.js";
import { DrizzleUsageRecorder } from "../modules/billing/infrastructure/drizzle-usage.js";
import { FakePdfInspector, InMemoryStorage } from "../modules/dossier/application/test/fakes.js";
import { FakeAiProvider } from "../modules/extraction/infrastructure/index.js";
import { getSession, register, type IdentityDeps } from "../modules/identity/index.js";
import { FakeHasher, FakeTaxRegistry, InMemoryRateLimiter, RecordingMailer } from "../modules/identity/application/test/fakes.js";
import { DrizzlePlansReader } from "../modules/identity/infrastructure/drizzle-plans-reader.js";
import { DrizzleIdentityUow } from "../modules/identity/infrastructure/drizzle-uow.js";
import {
  acceptSuggestion, cloneTemplatesForOrg, confirmPendingSamples, createSkillResolver, learnFromReview, listSuggestions, suggestAlias, evaluateSkill, getEvaluation, getSkill, listSamples, listSkills, readSample, runEvaluation, updateSkillField, uploadSamples,
  type SkillDeps,
} from "../modules/skill/index.js";
import { DrizzleSkillUow } from "../modules/skill/infrastructure/index.js";
import { dec } from "../shared/decimal.js";
import { sql } from "drizzle-orm";
import { withCtx } from "../db/with-ctx.js";

let t: TestDb;
let db: Db;
let skill: SkillDeps;
let identity: IdentityDeps;
let queue: InMemoryJobQueue;
const chau: Ctx = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau"), role: "ADMIN" };
const pdf = (name: string) => ({ name, mime: "application/pdf", bytes: Buffer.from(`%PDF-fake-${name}-1`) });

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  db = createDb(t.appUrl, { max: 4 });
  queue = new InMemoryJobQueue();
  skill = {
    uow: new DrizzleSkillUow(db), storage: new InMemoryStorage(), queue, ai: new FakeAiProvider(), usage: new DrizzleUsageRecorder(db, dec("25400")),
    users: { names: async (_o, ids) => new Map(ids.map((id) => [id, id === "usr_chau" ? "Lê Minh Châu" : id])) }, pdf: new FakePdfInspector(), clock: systemClock, idGen: ulidIdGen,
  };
  identity = {
    uow: new DrizzleIdentityUow(db), plans: new DrizzlePlansReader(db), hasher: new FakeHasher(), rateLimiter: new InMemoryRateLimiter(systemClock), mailer: new RecordingMailer(), taxRegistry: new FakeTaxRegistry(),
    clock: systemClock, idGen: ulidIdGen, appUrl: "http://localhost:3100",
    onOrgCreated: async (o) => void unwrap(await cloneTemplatesForOrg(skill, o)),
  };
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

describe("luồng skill trên Postgres thật", () => {
  it("seed: org hệ thống giữ 10 skill mẫu (không còn skill ánh xạ); org demo được sao chép đủ; skill mẫu không lộ qua getSkill; org khác không thấy", async () => {
    const mine = unwrap(await listSkills(skill, chau));
    expect(mine.map((s) => s.code)).toContain("SK-INV-GEN");
    expect(mine).toHaveLength(10);
    expect(mine.every((s) => s.version === 1 && s.labeledSamples === 0)).toBe(true);
    expect(errCode(await getSkill(skill, chau, "sk_tpl_sk_inv_gen"))).toBe("NOT_FOUND");
    const other: Ctx = { orgId: asOrgId("org_khac"), userId: asUserId("usr_x"), role: "ADMIN" };
    expect(unwrap(await listSkills(skill, other))).toEqual([]);
    // Policy: org thường đọc được template qua repo (để sao chép) nhưng không ghi được vào org hệ thống.
    await expect(skill.uow.asOrg(chau, (r) => r.skills.insert({ id: "sk_hack", orgId: SYSTEM_ORG_ID, code: "X", name: "x", kind: "DOCUMENT", docKind: "INVOICE", supplier: null, language: "", enabled: true, isTemplate: true, templateId: null, currentVersion: 1, labeledSamples: 0, accuracy: null, createdAt: new Date(), updatedAt: new Date() }))).rejects.toThrow();
    expect(await skill.uow.asOrg(chau, (r) => r.skills.listTemplates())).toHaveLength(10);
  });

  it("đăng ký MST mới → org mới có đủ skill sao chép (hook onOrgCreated)", async () => {
    const r = unwrap(await register(identity, { email: "an@minhkhang.vn", name: "Nguyễn Văn An", password: "matkhau123", taxCode: "0101234567", joinExisting: false }, { ip: "127.0.0.1" }));
    const s = unwrap(await getSession(identity, r.sessionToken));
    const theirs = unwrap(await listSkills(skill, s.ctx));
    expect(theirs).toHaveLength(10);
    expect(theirs.find((x) => x.code === "SK-INV-HANSOL")?.supplier).toBe("HANSOL PRECISION CO., LTD.");
  });

  it("sửa trường → phiên bản 2; upload 5 mẫu → AI giả đọc → xác nhận → đánh giá → kết quả + accuracy; resolver chọn skill HANSOL", async () => {
    const inv = unwrap(await listSkills(skill, chau)).find((s) => s.code === "SK-INV-GEN")!;
    const v2 = unwrap(await updateSkillField(skill, chau, inv.id, "po_no", { aliases: ["P/O No.", "PO Number", "Order No."] }));
    expect(v2.version).toBe(2);
    const added = unwrap(await uploadSamples(skill, chau, inv.id, ["inv1.pdf", "inv2.pdf", "inv3.pdf", "inv4.pdf", "inv5.pdf"].map(pdf)));
    expect(added).toHaveLength(5);
    expect(added[0]?.labeledBy).toBe("Lê Minh Châu");
    expect(queue.jobs.filter((j) => j.name === "skill-sample-read")).toHaveLength(5);
    for (const s of added) unwrap(await readSample(skill, { orgId: "org_anphat", userId: "usr_chau", sampleId: s.id }));
    expect(unwrap(await confirmPendingSamples(skill, chau, inv.id))).toBe(5);
    expect(unwrap(await getSkill(skill, chau, inv.id)).labeledSamples).toBe(5);
    expect(unwrap(await listSamples(skill, chau, inv.id)).every((s) => s.status === "LABELED")).toBe(true);
    const q = unwrap(await evaluateSkill(skill, chau, inv.id));
    expect(q.version).toBe(2);
    const ev = unwrap(await runEvaluation(skill, { orgId: "org_anphat", userId: "usr_chau", skillId: inv.id, version: 2 }));
    expect(ev.samples).toBe(5);
    expect(ev.accuracy).toBe(1); // AI giả đọc giống lúc gắn nhãn
    expect(unwrap(await getEvaluation(skill, chau, inv.id))?.version).toBe(2);
    expect(unwrap(await getSkill(skill, chau, inv.id)).accuracy).toBe(1);
    // usage_events ghi cho 10 lần gọi AI (5 đọc mẫu + 5 đánh giá), dossier_id null.
    const n = await withCtx(db, chau, (tx) => tx.execute(sql`select count(*)::int as n from usage_events where org_id = 'org_anphat' and dossier_id is null`));
    expect((n[0] as { n: number }).n).toBe(10);
    const resolver = createSkillResolver(skill);
    const picked = await resolver.resolve("org_anphat", "INVOICE", "HANSOL");
    expect(picked.fieldHints.join(" ")).toContain("MODEL");
    const gen = await resolver.resolve("org_anphat", "INVOICE", null);
    expect(gen.examples).toHaveLength(2);
    expect(gen.fieldHints.join(" ")).toContain("P/O No.");
  });

  it("tự học từ bước kiểm tra: mẫu REVIEW, tự tạo skill nhà cung cấp, gợi ý nhãn → đồng ý; org khác không thấy", async () => {
    const decl: Ctx = { ...chau, role: "DECLARANT" };
    for (const id of ["rv1", "rv2"]) await skill.storage.put(`orgs/org_anphat/docs/${id}.pdf`, Buffer.from(`%PDF-${id}`), "application/pdf");
    const d = (id: string) => ({ documentId: id, kind: "INVOICE" as const, fileName: `${id}.pdf`, mime: "application/pdf", pages: 1, storageKey: `orgs/org_anphat/docs/${id}.pdf`, data: { invoiceNo: id, seller: { name: "ZETA TOOLS CO., LTD" } }, corrections: [{ key: "invoice_no" }], supplier: "ZETA TOOLS CO., LTD" });
    expect(unwrap(await learnFromReview(skill, decl, [d("rv1")])).skills[0]?.created).toBe(false);
    const second = unwrap(await learnFromReview(skill, decl, [d("rv2")]));
    expect(second.skills[0]).toMatchObject({ created: true, supplier: "ZETA TOOLS CO., LTD" });
    const sup = unwrap(await getSkill(skill, chau, second.skills[0]!.id));
    expect(sup).toMatchObject({ kind: "SUPPLIER", labeledSamples: 2 });
    expect(unwrap(await listSamples(skill, chau, sup.id)).map((s) => s.source)).toEqual(["REVIEW", "REVIEW"]);

    const sug = unwrap(await suggestAlias(skill, decl, { documentId: "rv2", kind: "INVOICE", rawPath: "invoiceNo", supplier: "Zeta Tools" }, "Doc No.:"))!;
    expect(sug).toMatchObject({ skillId: sup.id, alias: "Doc No." });
    const other: Ctx = { orgId: asOrgId("org_khac"), userId: asUserId("usr_x"), role: "ADMIN" };
    expect(unwrap(await listSuggestions(skill, other))).toEqual([]);
    expect(errCode(await acceptSuggestion(skill, other, sug.id))).toBe("NOT_FOUND");
    const acc = unwrap(await acceptSuggestion(skill, chau, sug.id));
    expect(acc.skill.version).toBe(2);
    expect(acc.skill.fields.find((f) => f.key === "invoice_no")?.aliases).toContain("Doc No.");
    expect(unwrap(await listSuggestions(skill, chau))).toEqual([]);
  });
});
