import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { cloneTemplatesForOrg } from "../clone-templates.js";
import { acceptSuggestion, dismissSuggestion, learnFromReview, listSuggestions, rereadStale, staleReads, suggestAlias, type LearnDocument } from "../learning.js";
import type { OpenRead, SampleRow, SkillDeps } from "../ports.js";
import { getSkill, listSkills } from "../query-skills.js";
import { fakePdf, fakeUsers, MemoryStorage, RecordingUsage, ScriptedAi, templateRows } from "../test/fakes.js";
import { InMemorySkillUow } from "../test/in-memory-uow.js";

const ORG = "org_a";
const NOW = new Date("2026-10-25T03:00:00.000Z");
const admin: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_1"), role: "ADMIN" };
const declarant: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_2"), role: "DECLARANT" };
const viewer: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_3"), role: "VIEWER" };
const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_9"), role: "ADMIN" };

let uow: InMemorySkillUow;
let storage: MemoryStorage;
let queue: InMemoryJobQueue;
let deps: SkillDeps;
let invId: string;
let open: OpenRead[];
let reread: string[];

const doc = (id: string, supplier: string | null, corrections = 1): LearnDocument => ({
  documentId: id, kind: "INVOICE", fileName: `${id}.pdf`, mime: "application/pdf", pages: 1, storageKey: `orgs/${ORG}/docs/${id}.pdf`,
  data: { invoiceNo: `INV-${id}`, totalAmount: 100, poNo: null, seller: supplier ? { name: supplier } : null },
  corrections: Array.from({ length: corrections }, () => ({ key: "invoice_no" })), supplier,
});

beforeEach(async () => {
  uow = new InMemorySkillUow();
  const t = templateRows(NOW);
  uow.data.skills.push(...t.skills);
  uow.data.versions.push(...t.versions);
  storage = new MemoryStorage();
  queue = new InMemoryJobQueue();
  open = [];
  reread = [];
  deps = {
    uow, storage, queue, ai: new ScriptedAi(), usage: new RecordingUsage(), users: fakeUsers, pdf: fakePdf, clock: fixedClock(NOW.toISOString()), idGen: sequentialIdGen(),
    reads: { open: async () => open, reread: async (_ctx, ids) => (reread.push(...ids), ids.length) },
  };
  await cloneTemplatesForOrg(deps, { orgId: ORG, userId: "usr_1" });
  invId = unwrap(await listSkills(deps, admin)).find((s) => s.code === "SK-INV-GEN")!.id;
  for (const id of ["d1", "d2", "d3", "d4"]) await storage.put(`orgs/${ORG}/docs/${id}.pdf`, Buffer.from(`%PDF-${id}`));
});

const samplesOf = (skillId: string): SampleRow[] => uow.data.samples.filter((s) => s.skillId === skillId);

describe("learnFromReview", () => {
  it("chứng từ có trường bị sửa → mẫu đã gắn nhãn (REVIEW) của skill chung, nhãn theo key skill, file được chép sang khu mẫu", async () => {
    const r = unwrap(await learnFromReview(deps, declarant, [doc("d1", "ACME TRADING CO., LTD"), doc("d2", null, 0)]));
    expect(r).toEqual({ learned: 1, skills: [{ id: invId, name: "Commercial Invoice – chung", created: false }] });
    const [s] = samplesOf(invId);
    expect(s).toMatchObject({ documentId: "d1", status: "LABELED", source: "REVIEW", supplier: "ACME TRADING CO., LTD", expected: { invoice_no: "INV-d1", total_amount: 100, po_no: null } });
    expect(storage.files.has(s!.storageKey)).toBe(true);
    expect(unwrap(await getSkill(deps, admin, invId)).labeledSamples).toBe(1);
  });

  it("xác nhận lại cùng chứng từ → cập nhật nhãn, không thêm mẫu", async () => {
    await learnFromReview(deps, declarant, [doc("d1", null)]);
    const again = { ...doc("d1", null), data: { invoiceNo: "SỬA-2", totalAmount: 5 } };
    unwrap(await learnFromReview(deps, declarant, [again]));
    expect(samplesOf(invId)).toHaveLength(1);
    expect(samplesOf(invId)[0]!.expected).toMatchObject({ invoice_no: "SỬA-2" });
    expect(unwrap(await getSkill(deps, admin, invId)).labeledSamples).toBe(1);
  });

  it("cùng nhà cung cấp bị sửa lần thứ 2 → tự tạo skill riêng, chép mẫu cũ sang; lần sau dùng luôn skill riêng", async () => {
    unwrap(await learnFromReview(deps, declarant, [doc("d1", "ACME TRADING CO., LTD")]));
    const r = unwrap(await learnFromReview(deps, declarant, [doc("d2", "Acme Trading")]));
    const sup = r.skills[0]!;
    expect(sup).toMatchObject({ created: true, supplier: "Acme Trading", name: "Commercial Invoice – Acme Trading" });
    const created = unwrap(await getSkill(deps, admin, sup.id));
    expect(created).toMatchObject({ kind: "SUPPLIER", docKind: "INVOICE", labeledSamples: 2, enabled: true });
    expect(samplesOf(sup.id).map((s) => s.documentId).sort()).toEqual(["d1", "d2"]);
    const third = unwrap(await learnFromReview(deps, declarant, [doc("d3", "ACME TRADING")]));
    expect(third.skills).toEqual([{ id: sup.id, name: sup.name, supplier: "Acme Trading", created: false }]);
  });

  it("nhà cung cấp khác nhau cùng đuôi CO., LTD không bị gộp", async () => {
    await learnFromReview(deps, declarant, [doc("d1", "ACME CO., LTD")]);
    const r = unwrap(await learnFromReview(deps, declarant, [doc("d2", "ZETA CO., LTD")]));
    expect(r.skills[0]).toMatchObject({ id: invId, created: false });
  });

  it("file gốc không còn → bỏ qua chứng từ đó; người chỉ xem không được ghi", async () => {
    expect(unwrap(await learnFromReview(deps, declarant, [{ ...doc("d1", null), storageKey: "missing" }])).learned).toBe(0);
    expect(errCode(await learnFromReview(deps, viewer, [doc("d1", null)]))).toBe("FORBIDDEN");
  });
});

describe("gợi ý nhãn", () => {
  const src = { documentId: "d1", kind: "INVOICE" as const, rawPath: "invoiceNo", supplier: null };

  it("nhãn mới → gợi ý chờ cho đúng trường; gặp lại tăng số lần; nhãn đã có / dòng hàng → không gợi ý", async () => {
    const s = unwrap(await suggestAlias(deps, declarant, src, "Ref. Inv#:"));
    expect(s).toMatchObject({ skillId: invId, fieldKey: "invoice_no", fieldLabel: "Số hóa đơn", alias: "Ref. Inv#", hits: 1 });
    expect(unwrap(await suggestAlias(deps, declarant, src, "Ref. Inv# "))?.hits).toBe(2);
    expect(unwrap(await suggestAlias(deps, declarant, src, "invoice no"))).toBeNull();
    expect(unwrap(await suggestAlias(deps, declarant, { ...src, rawPath: "items.0.quantity" }, "Qty"))).toBeNull();
    expect(unwrap(await listSuggestions(deps, declarant))).toHaveLength(1);
    expect(unwrap(await listSuggestions(deps, other))).toHaveLength(0);
  });

  it("đồng ý → thêm alias (phiên bản mới), hết khỏi danh sách; chỉ người duyệt/quản trị được đồng ý", async () => {
    const s = unwrap(await suggestAlias(deps, declarant, src, "Ref. Inv#"))!;
    expect(errCode(await acceptSuggestion(deps, declarant, s.id))).toBe("FORBIDDEN");
    expect(errCode(await acceptSuggestion(deps, other, s.id))).toBe("NOT_FOUND");
    const r = unwrap(await acceptSuggestion(deps, admin, s.id));
    expect(r.skill.version).toBe(2);
    expect(r.skill.fields.find((f) => f.key === "invoice_no")!.aliases).toContain("Ref. Inv#");
    expect(r.evaluationQueued).toBe(false);
    expect(unwrap(await listSuggestions(deps, admin))).toHaveLength(0);
  });

  it("đủ mẫu → đồng ý xong tự đánh giá lại", async () => {
    for (const id of ["d1", "d2", "d3", "d4"]) await learnFromReview(deps, declarant, [doc(id, null)]);
    await storage.put(`orgs/${ORG}/docs/d5.pdf`, Buffer.from("%PDF-d5"));
    await learnFromReview(deps, declarant, [doc("d5", null)]);
    const s = unwrap(await suggestAlias(deps, declarant, src, "Ref. Inv#"))!;
    expect(unwrap(await acceptSuggestion(deps, admin, s.id)).evaluationQueued).toBe(true);
    expect(queue.jobs.some((j) => j.name === "skill-evaluate")).toBe(true);
  });

  it("bỏ qua → không gợi ý lại nhãn đó", async () => {
    const s = unwrap(await suggestAlias(deps, declarant, src, "Ref. Inv#"))!;
    unwrap(await dismissSuggestion(deps, declarant, s.id));
    expect(unwrap(await suggestAlias(deps, declarant, src, "Ref. Inv#"))).toBeNull();
    expect(unwrap(await listSuggestions(deps, declarant))).toHaveLength(0);
  });
});

describe("đọc lại chứng từ đã đọc bằng cấu hình cũ", () => {
  it("chỉ chứng từ mà giờ sẽ đọc bằng skill này và lần đọc gần nhất dùng phiên bản khác", async () => {
    const current = uow.data.versions.find((v) => v.skillId === invId && v.version === 1)!.id;
    const hansol = unwrap(await listSkills(deps, admin)).find((s) => s.supplier?.startsWith("HANSOL"))!;
    open = [
      { documentId: "old", dossierId: "ds1", dossierCode: "HS-1", kind: "INVOICE", fileName: "a.pdf", skillVersionId: "skv_cu", supplier: "ACME" },
      { documentId: "fresh", dossierId: "ds1", dossierCode: "HS-1", kind: "INVOICE", fileName: "b.pdf", skillVersionId: current, supplier: null },
      { documentId: "hansol", dossierId: "ds2", dossierCode: "HS-2", kind: "INVOICE", fileName: "c.pdf", skillVersionId: "skv_cu", supplier: "Hansol Precision" },
      { documentId: "bl", dossierId: "ds2", dossierCode: "HS-2", kind: "BILL_OF_LADING", fileName: "d.pdf", skillVersionId: null, supplier: null },
    ];
    expect(unwrap(await staleReads(deps, declarant, invId))).toEqual({ documents: [{ documentId: "old", dossierId: "ds1", dossierCode: "HS-1", fileName: "a.pdf" }], dossiers: 1 });
    expect(unwrap(await staleReads(deps, declarant, hansol.id)).documents.map((d) => d.documentId)).toEqual(["hansol"]);
    expect(unwrap(await rereadStale(deps, declarant, invId))).toEqual({ queued: 1 });
    expect(reread).toEqual(["old"]);
    expect(errCode(await rereadStale(deps, viewer, invId))).toBe("FORBIDDEN");
  });
});
