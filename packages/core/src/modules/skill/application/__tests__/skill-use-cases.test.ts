import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { addSkillField, removeSkillField, updateSkillField } from "../edit-fields.js";
import { cloneTemplatesForOrg } from "../clone-templates.js";
import { evaluateSkill, getEvaluation, runEvaluation } from "../evaluate.js";
import { getSkill, listSkills, setSkillEnabled } from "../query-skills.js";
import { createSkillResolver } from "../resolve-skill.js";
import { confirmPendingSamples, getSampleLabel, labelSample, listSamples, readSample, uploadSamples } from "../samples.js";
import type { SkillDeps } from "../ports.js";
import { fakePdf, fakeUsers, MemoryStorage, RecordingUsage, ScriptedAi, SYSTEM_ORG, templateRows } from "../test/fakes.js";
import { InMemorySkillUow } from "../test/in-memory-uow.js";

const ORG = "org_a";
const admin: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_1"), role: "ADMIN" };
const viewer: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_2"), role: "VIEWER" };
const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_9"), role: "ADMIN" };
const pdf = (name: string, pages = 1) => ({ name, mime: "application/pdf", bytes: Buffer.from(`%PDF-fake-${name}-${pages}`) });

let uow: InMemorySkillUow;
let queue: InMemoryJobQueue;
let ai: ScriptedAi;
let usage: RecordingUsage;
let deps: SkillDeps;

beforeEach(async () => {
  uow = new InMemorySkillUow();
  const now = new Date("2026-10-14T03:00:00.000Z");
  const t = templateRows(now);
  uow.data.skills.push(...t.skills);
  uow.data.versions.push(...t.versions);
  queue = new InMemoryJobQueue();
  ai = new ScriptedAi({ "a.pdf": { invoiceNo: "A-1", totalAmount: 100, poNo: "PO-1" }, "b.pdf": { invoiceNo: "B-2", totalAmount: 200, poNo: null } });
  usage = new RecordingUsage();
  deps = { uow, storage: new MemoryStorage(), queue, ai, usage, users: fakeUsers, pdf: fakePdf, clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen() };
  await cloneTemplatesForOrg(deps, { orgId: ORG, userId: "usr_1" });
});

describe("sao chép skill mẫu", () => {
  it("org mới có đủ skill (version 1, chưa có mẫu, không phải template); org khác không thấy", async () => {
    const mine = unwrap(await listSkills(deps, admin));
    expect(mine.map((s) => s.code).sort()).toEqual(["SK-INV-GEN", "SK-INV-HANSOL", "SK-MAP-IDA"]);
    expect(mine.every((s) => s.version === 1 && s.labeledSamples === 0 && s.accuracy === undefined && s.enabled)).toBe(true);
    expect(mine.find((s) => s.code === "SK-INV-GEN")?.fields.map((f) => f.key)).toEqual(["invoice_no", "total_amount", "po_no"]);
    expect(unwrap(await listSkills(deps, other))).toEqual([]);
    expect(unwrap(await listSkills(deps, admin, "MAPPING")).map((s) => s.code)).toEqual(["SK-MAP-IDA"]);
    // Gọi lại không nhân đôi.
    expect(unwrap(await cloneTemplatesForOrg(deps, { orgId: ORG, userId: "usr_1" }))).toBe(0);
    expect(unwrap(await listSkills(deps, admin))).toHaveLength(3);
  });
  it("skill mẫu của org hệ thống không lộ qua getSkill của org thường", async () => {
    const r = await getSkill(deps, admin, "sk_tpl_inv");
    expect(r.ok).toBe(false);
    expect(uow.data.skills.filter((s) => s.orgId === SYSTEM_ORG)).toHaveLength(3);
  });
});

describe("sửa trường tạo phiên bản mới", () => {
  const invId = async () => unwrap(await listSkills(deps, admin)).find((s) => s.code === "SK-INV-GEN")!.id;
  it("updateSkillField: version tăng, giữ lịch sử; tắt extract trường bắt buộc → FORBIDDEN; VIEWER → FORBIDDEN", async () => {
    const id = await invId();
    const s = unwrap(await updateSkillField(deps, admin, id, "po_no", { aliases: ["PO", "P/O No."], display: false }));
    expect(s.version).toBe(2);
    expect(s.fields.find((f) => f.key === "po_no")).toMatchObject({ aliases: ["PO", "P/O No."], display: false });
    expect(uow.data.versions.filter((v) => v.skillId === id).map((v) => v.version)).toEqual([1, 2]);
    expect(errCode(await updateSkillField(deps, admin, id, "invoice_no", { extract: false }))).toBe("FORBIDDEN");
    expect(errCode(await updateSkillField(deps, viewer, id, "po_no", { label: "x" }))).toBe("FORBIDDEN");
    expect(errCode(await updateSkillField(deps, admin, id, "nope", { label: "x" }))).toBe("NOT_FOUND");
  });
  it("addSkillField: trùng key → DUPLICATE; removeSkillField bỏ trường và tăng version", async () => {
    const id = await invId();
    const field = { key: "bank_info", label: "Ngân hàng", type: "string" as const, required: false, aliases: ["Bank"], extract: true, display: true };
    expect(unwrap(await addSkillField(deps, admin, id, field)).fields.map((f) => f.key)).toContain("bank_info");
    expect(errCode(await addSkillField(deps, admin, id, field))).toBe("DUPLICATE");
    const after = unwrap(await removeSkillField(deps, admin, id, "bank_info"));
    expect(after.version).toBe(3);
    expect(after.fields.map((f) => f.key)).toEqual(["invoice_no", "total_amount", "po_no"]);
  });
  it("setSkillEnabled: bật/tắt; org khác → NOT_FOUND", async () => {
    const id = await invId();
    expect(unwrap(await setSkillEnabled(deps, admin, id, false)).enabled).toBe(false);
    expect(errCode(await setSkillEnabled(deps, other, id, true))).toBe("NOT_FOUND");
  });
});

describe("mẫu và đánh giá", () => {
  const invId = async () => unwrap(await listSkills(deps, admin)).find((s) => s.code === "SK-INV-GEN")!.id;
  async function uploadAndRead(id: string, names: string[]) {
    const added = unwrap(await uploadSamples(deps, admin, id, names.map((n) => pdf(n))));
    for (const s of added) unwrap(await readSample(deps, { orgId: ORG, userId: "usr_1", sampleId: s.id }));
    return added;
  }
  it("upload → PENDING + job đọc mẫu; đọc xong có expected nháp; confirm → LABELED + labeledSamples; tên người gắn nhãn", async () => {
    const id = await invId();
    const added = unwrap(await uploadSamples(deps, admin, id, [pdf("a.pdf", 2), pdf("b.pdf")]));
    expect(added.map((s) => s.status)).toEqual(["PENDING", "PENDING"]);
    expect(added[0]).toMatchObject({ fileName: "a.pdf", pages: 2, labeledBy: "Tên usr_1" });
    expect(queue.jobs.filter((j) => j.name === "skill-sample-read")).toHaveLength(2);
    expect(uow.data.samples[0]?.storageKey).toMatch(new RegExp(`^orgs/${ORG}/skills/${id}/samples/`));
    // Chưa đọc xong → confirm chưa tính, nhưng đẩy lại job đọc cho mẫu chưa có nhãn nháp (tự chữa khi job mất).
    expect(unwrap(await confirmPendingSamples(deps, admin, id))).toBe(0);
    expect(queue.jobs.filter((j) => j.name === "skill-sample-read")).toHaveLength(4);
    for (const s of added) unwrap(await readSample(deps, { orgId: ORG, userId: "usr_1", sampleId: s.id }));
    expect(uow.data.samples.find((s) => s.fileName === "a.pdf")?.expected).toEqual({ invoice_no: "A-1", total_amount: 100, po_no: "PO-1" });
    expect(usage.events).toHaveLength(2);
    expect(unwrap(await confirmPendingSamples(deps, admin, id))).toBe(2);
    expect(unwrap(await getSkill(deps, admin, id)).labeledSamples).toBe(2);
    expect(unwrap(await listSamples(deps, admin, id)).every((s) => s.status === "LABELED")).toBe(true);
    expect(errCode(await listSamples(deps, other, id))).toBe("NOT_FOUND");
  });
  it("labelSample ghi expected do người dùng sửa và đánh LABELED", async () => {
    const id = await invId();
    const [s] = await uploadAndRead(id, ["a.pdf"]);
    const l = unwrap(await labelSample(deps, admin, s!.id, { invoice_no: "A-1", total_amount: "100", po_no: null }));
    expect(l.status).toBe("LABELED");
    expect(unwrap(await getSkill(deps, admin, id)).labeledSamples).toBe(1);
    expect(unwrap(await getSampleLabel(deps, admin, s!.id))).toMatchObject({ sample: { id: s!.id, status: "LABELED" }, expected: { invoice_no: "A-1", total_amount: "100", po_no: null } });
    expect(errCode(await getSampleLabel(deps, other, s!.id))).toBe("NOT_FOUND");
    // Gắn nhãn lại không cộng thêm.
    unwrap(await labelSample(deps, admin, s!.id, { invoice_no: "A-1" }));
    expect(unwrap(await getSkill(deps, admin, id)).labeledSamples).toBe(1);
  });
  it("evaluateSkill: thiếu mẫu → NOT_ENOUGH_SAMPLES; MAPPING → NOT_SUPPORTED; đủ mẫu → job skill-evaluate", async () => {
    const id = await invId();
    expect(errCode(await evaluateSkill(deps, admin, id))).toBe("NOT_ENOUGH_SAMPLES");
    const map = unwrap(await listSkills(deps, admin, "MAPPING"))[0]!;
    expect(errCode(await evaluateSkill(deps, admin, map.id))).toBe("NOT_SUPPORTED");
    await uploadAndRead(id, ["a.pdf", "b.pdf", "a.pdf", "b.pdf", "a.pdf"]);
    unwrap(await confirmPendingSamples(deps, admin, id));
    const r = unwrap(await evaluateSkill(deps, admin, id));
    expect(r.version).toBe(1);
    const job = queue.jobs.find((j) => j.name === "skill-evaluate");
    expect(job?.payload).toMatchObject({ orgId: ORG, skillId: id, version: 1 });
  });
  it("runEvaluation: so expected với kết quả đọc theo từng trường, ghi skill_evaluations và accuracy của skill", async () => {
    const id = await invId();
    await uploadAndRead(id, ["a.pdf", "b.pdf", "a.pdf", "b.pdf", "a.pdf"]);
    unwrap(await confirmPendingSamples(deps, admin, id));
    // Người dùng sửa nhãn một mẫu: AI đọc PO "PO-1" nhưng đúng phải là "PO-9" → trường po_no sai 1/5.
    const first = uow.data.samples.find((s) => s.fileName === "a.pdf")!;
    unwrap(await labelSample(deps, admin, first.id, { invoice_no: "A-1", total_amount: "100", po_no: "PO-9" }));
    expect(unwrap(await getEvaluation(deps, admin, id))).toBeNull();
    const ev = unwrap(await runEvaluation(deps, { orgId: ORG, userId: "usr_1", skillId: id, version: 1 }));
    expect(ev.samples).toBe(5);
    expect(ev.fields.find((f) => f.key === "po_no")).toEqual({ key: "po_no", label: "Số PO", accuracy: 0.8, errors: 1 });
    expect(ev.fields.find((f) => f.key === "invoice_no")?.accuracy).toBe(1);
    expect(ev.accuracy).toBeCloseTo(14 / 15, 3); // numeric(6,4)
    expect(ev.previousAccuracy).toBeUndefined();
    expect(unwrap(await getSkill(deps, admin, id)).accuracy).toBeCloseTo(14 / 15, 3);
    expect(unwrap(await getEvaluation(deps, admin, id))?.fields).toHaveLength(3);
    // Lần sau có previousAccuracy; gợi ý skill (alias) được đưa vào prompt.
    const ev2 = unwrap(await runEvaluation(deps, { orgId: ORG, userId: "usr_1", skillId: id, version: 1 }));
    expect(ev2.previousAccuracy).toBeCloseTo(14 / 15, 3);
    expect(ai.prompts.at(-1)?.skillHints.join(" ")).toContain("Invoice No.");
  });
});

describe("chọn skill cho trích xuất", () => {
  it("SUPPLIER khớp gợi ý nhà cung cấp, không thì DOCUMENT; tắt thì bỏ qua; org không có skill → null", async () => {
    const resolver = createSkillResolver(deps);
    const sup = await resolver.resolve(ORG, "INVOICE", "HANSOL PRECISION");
    expect(sup.skillVersionId).toBe(uow.data.versions.find((v) => v.orgId === ORG && v.skillId === uow.data.skills.find((s) => s.orgId === ORG && s.code === "SK-INV-HANSOL")!.id)!.id);
    expect(sup.fieldHints.join(" ")).toContain("MODEL");
    const gen = await resolver.resolve(ORG, "INVOICE", "SAMSUNG");
    expect(gen.fieldHints.join(" ")).toContain("Invoice No.");
    const hansol = uow.data.skills.find((s) => s.orgId === ORG && s.code === "SK-INV-HANSOL")!;
    unwrap(await setSkillEnabled(deps, admin, hansol.id, false));
    expect((await resolver.resolve(ORG, "INVOICE", "HANSOL")).skillVersionId).toBe(gen.skillVersionId);
    expect(await resolver.resolve("org_b", "INVOICE", null)).toEqual({ skillVersionId: null, fieldHints: [], examples: [] });
  });
});
