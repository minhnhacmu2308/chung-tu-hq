import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { domainError } from "../../../../shared/errors.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import type { AiFile, AiProvider } from "../../../extraction/index.js";
import { cloneTemplatesForOrg } from "../clone-templates.js";
import { updateSkillField } from "../edit-fields.js";
import { evaluateSkill, getEvaluation, runEvaluation } from "../evaluate.js";
import type { SampleRow, SkillDeps } from "../ports.js";
import { listSkills } from "../query-skills.js";
import { confirmPendingSamples, getSampleLabel, labelSample, listSamples, readSample, uploadSamples } from "../samples.js";
import { fakePdf, fakeUsers, MemoryStorage, RecordingUsage, ScriptedAi, templateRows } from "../test/fakes.js";
import { InMemorySkillUow } from "../test/in-memory-uow.js";

const ORG = "org_a";
const NOW = new Date("2026-10-14T03:00:00.000Z");
const admin: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_1"), role: "ADMIN" };
const viewer: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_2"), role: "VIEWER" };
const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_9"), role: "ADMIN" };
const pdf = (name: string) => ({ name, mime: "application/pdf", bytes: Buffer.from(`%PDF-fake-${name}-1`) });

let uow: InMemorySkillUow;
let queue: InMemoryJobQueue;
let storage: MemoryStorage;
let usage: RecordingUsage;
let deps: SkillDeps;
let aiFiles: { file: AiFile; pages: number[] }[];
let invId: string;
let mapId: string;

beforeEach(async () => {
  uow = new InMemorySkillUow();
  const t = templateRows(NOW);
  uow.data.skills.push(...t.skills);
  uow.data.versions.push(...t.versions);
  queue = new InMemoryJobQueue();
  storage = new MemoryStorage();
  usage = new RecordingUsage();
  aiFiles = [];
  const scripted = new ScriptedAi({ "a.pdf": { invoiceNo: "A-1", totalAmount: 100, poNo: "PO-1" } });
  const ai: AiProvider = {
    name: "fake", classifyPages: () => scripted.classifyPages(),
    extract: async (file, pages, schema, prompt) => (aiFiles.push({ file, pages }), scripted.extract(file, pages, schema, prompt)),
  };
  deps = { uow, storage, queue, ai, usage, users: fakeUsers, pdf: fakePdf, clock: fixedClock(NOW.toISOString()), idGen: sequentialIdGen() };
  await cloneTemplatesForOrg(deps, { orgId: ORG, userId: "usr_1" });
  const skills = unwrap(await listSkills(deps, admin));
  invId = skills.find((s) => s.code === "SK-INV-GEN")!.id;
  mapId = skills.find((s) => s.code === "SK-MAP-IDA")!.id;
});

let seq = 0;
const seedSample = async (p: Partial<SampleRow> = {}): Promise<SampleRow> => {
  const id = p.id ?? `smp_seed_${++seq}`;
  const row: SampleRow = {
    id, orgId: ORG, skillId: invId, documentId: null, storageKey: `k/${id}`, fileName: "a.pdf", pages: 1, sizeBytes: 10, status: "LABELED",
    expected: { invoice_no: "A-1", total_amount: 100, po_no: "PO-1" }, labeledBy: "usr_1", labeledAt: NOW, createdAt: NOW, updatedAt: NOW, ...p,
  };
  uow.data.samples.push(row);
  await storage.put(row.storageKey, Buffer.from("%PDF"));
  return row;
};
const read = (sampleId: string) => readSample(deps, { orgId: ORG, userId: "usr_1", sampleId });

describe("uploadSamples – kiểm tra file", () => {
  it("VIEWER → FORBIDDEN; không chọn file → FILE_INVALID", async () => {
    expect(errCode(await uploadSamples(deps, viewer, invId, [pdf("a.pdf")]))).toBe("FORBIDDEN");
    expect(errCode(await uploadSamples(deps, admin, invId, []))).toBe("FILE_INVALID");
  });

  it("định dạng không cho phép → FILE_INVALID; > 20 MB → FILE_TOO_LARGE; không lưu gì", async () => {
    expect(errCode(await uploadSamples(deps, admin, invId, [{ name: "a.docx", mime: "application/msword", bytes: Buffer.from("x") }]))).toBe("FILE_INVALID");
    expect(errCode(await uploadSamples(deps, admin, invId, [{ name: "big.pdf", mime: "application/pdf", bytes: Buffer.alloc(20 * 1024 * 1024 + 1) }]))).toBe("FILE_TOO_LARGE");
    expect(storage.files.size).toBe(0);
  });

  it("đọc file lỗi: DomainError giữ nguyên mã; lỗi khác → FILE_INVALID “không đọc được”; file có mật khẩu → FILE_INVALID", async () => {
    deps.pdf = { inspect: async () => { throw domainError("FILE_TOO_LARGE", "quá nhiều trang"); } };
    expect(errCode(await uploadSamples(deps, admin, invId, [pdf("a.pdf")]))).toBe("FILE_TOO_LARGE");
    deps.pdf = { inspect: async () => { throw new Error("boom"); } };
    const r = await uploadSamples(deps, admin, invId, [pdf("a.pdf")]);
    expect(r.ok === false && r.error).toMatchObject({ code: "FILE_INVALID", message: "a.pdf: không đọc được file" });
    deps.pdf = { inspect: async () => ({ pages: 1, encrypted: true }) };
    expect(errCode(await uploadSamples(deps, admin, invId, [pdf("a.pdf")]))).toBe("FILE_INVALID");
    expect(uow.data.samples).toHaveLength(0);
  });

  it("skill ánh xạ → NOT_SUPPORTED; skill không tồn tại / org khác → NOT_FOUND; không lưu file, không xếp job", async () => {
    expect(errCode(await uploadSamples(deps, admin, mapId, [pdf("a.pdf")]))).toBe("NOT_SUPPORTED");
    expect(errCode(await uploadSamples(deps, admin, "sk_khong_co", [pdf("a.pdf")]))).toBe("NOT_FOUND");
    expect(errCode(await uploadSamples(deps, other, invId, [pdf("a.pdf")]))).toBe("NOT_FOUND");
    expect(storage.files.size).toBe(0);
    expect(queue.jobs).toHaveLength(0);
  });

  it("ảnh PNG: 1 trang, khóa lưu trữ theo đuôi file", async () => {
    const [s] = unwrap(await uploadSamples(deps, admin, invId, [{ name: "Scan.PNG", mime: "image/png", bytes: Buffer.from("png") }]));
    expect(s).toMatchObject({ fileName: "Scan.PNG", pages: 1, status: "PENDING" });
    expect(uow.data.samples[0]?.storageKey).toMatch(/\/samples\/smp_\w+\.png$/);
  });
});

describe("listSamples / getSampleLabel", () => {
  it("skill không tồn tại → NOT_FOUND; mẫu chưa có người gắn nhãn → tên người gắn nhãn rỗng", async () => {
    expect(errCode(await listSamples(deps, admin, "sk_khong_co"))).toBe("NOT_FOUND");
    await seedSample({ status: "PENDING", labeledBy: null, labeledAt: null, expected: null });
    const [s] = unwrap(await listSamples(deps, admin, invId));
    expect(s?.labeledBy).toBe("");
  });

  it("getSampleLabel: không có mẫu → NOT_FOUND; mẫu chưa gắn nhãn → expected null", async () => {
    expect(errCode(await getSampleLabel(deps, admin, "smp_khong_co"))).toBe("NOT_FOUND");
    const row = await seedSample({ status: "PENDING", labeledBy: null, expected: null });
    expect(unwrap(await getSampleLabel(deps, admin, row.id))).toMatchObject({ sample: { id: row.id, status: "PENDING" }, expected: null });
  });
});

describe("readSample (job)", () => {
  it("không có mẫu → NOT_FOUND; skill của mẫu không còn → NOT_FOUND", async () => {
    expect(errCode(await read("smp_khong_co"))).toBe("NOT_FOUND");
    const row = await seedSample({ status: "PENDING", skillId: "sk_da_xoa" });
    expect(errCode(await read(row.id))).toBe("NOT_FOUND");
  });

  it("mẫu đã LABELED hoặc skill không gắn loại chứng từ → bỏ qua, không gọi AI", async () => {
    const labeled = await seedSample();
    unwrap(await read(labeled.id));
    const onMap = await seedSample({ status: "PENDING", skillId: mapId });
    unwrap(await read(onMap.id));
    expect(aiFiles).toHaveLength(0);
    expect(usage.events).toHaveLength(0);
  });

  it.each([["scan.png", "image/png"], ["scan.jpg", "image/jpeg"], ["SCAN.PDF", "application/pdf"]])("%s → gửi AI mime %s; số trang 0 → vẫn đọc trang 1", async (fileName, mime) => {
    const row = await seedSample({ status: "PENDING", fileName, pages: 0, expected: null });
    unwrap(await read(row.id));
    expect(aiFiles[0]).toMatchObject({ file: { mime, fileName }, pages: [1] });
    expect(usage.events).toHaveLength(1);
    expect(uow.data.samples.find((s) => s.id === row.id)?.expected).not.toBeNull();
  });

  // Nghi lỗi (báo cáo, chưa sửa): samples.ts đoán mime theo đuôi tên file, không theo mime lúc tải lên –
  // PDF tên không có đuôi (vd "hoa-don", mime application/pdf) bị gửi AI như image/jpeg; khóa lưu trữ cũng thành ".hoa-don" (fallback "bin" không bao giờ chạy).
  it("mẫu PDF tên không có đuôi → đọc với mime application/pdf (theo chữ ký %PDF đầu tệp)", async () => {
    const row = await seedSample({ status: "PENDING", fileName: "hoa-don", expected: null });
    unwrap(await read(row.id));
    expect(aiFiles[0]).toMatchObject({ file: { mime: "application/pdf", fileName: "hoa-don" } });
  });
});

describe("labelSample / confirmPendingSamples", () => {
  it("labelSample: VIEWER → FORBIDDEN; không có mẫu → NOT_FOUND; skill của mẫu không còn → NOT_FOUND", async () => {
    const row = await seedSample({ status: "PENDING" });
    expect(errCode(await labelSample(deps, viewer, row.id, {}))).toBe("FORBIDDEN");
    expect(errCode(await labelSample(deps, admin, "smp_khong_co", {}))).toBe("NOT_FOUND");
    const orphan = await seedSample({ status: "PENDING", skillId: "sk_da_xoa" });
    expect(errCode(await labelSample(deps, admin, orphan.id, {}))).toBe("NOT_FOUND");
    expect(uow.data.samples.find((s) => s.id === orphan.id)?.status).toBe("PENDING");
  });

  it("confirmPendingSamples: VIEWER → FORBIDDEN; skill không tồn tại → NOT_FOUND", async () => {
    expect(errCode(await confirmPendingSamples(deps, viewer, invId))).toBe("FORBIDDEN");
    expect(errCode(await confirmPendingSamples(deps, admin, "sk_khong_co"))).toBe("NOT_FOUND");
  });

  it("confirmPendingSamples: không có mẫu chờ → 0, không đổi skill, không xếp job", async () => {
    await seedSample();
    const before = uow.data.skills.find((s) => s.id === invId)!.updatedAt;
    expect(unwrap(await confirmPendingSamples(deps, admin, invId))).toBe(0);
    expect(uow.data.skills.find((s) => s.id === invId)!.updatedAt).toEqual(before);
    expect(queue.jobs).toHaveLength(0);
  });
});

describe("evaluateSkill / runEvaluation / getEvaluation – nhánh biên", () => {
  const seedLabeled = async (n: number, p: Partial<SampleRow> = {}) => {
    for (let i = 0; i < n; i++) await seedSample(p);
  };
  const runEval = (version = 1, skillId = invId) => runEvaluation(deps, { orgId: ORG, userId: "usr_1", skillId, version });

  it("evaluateSkill: VIEWER → FORBIDDEN; skill không tồn tại / org khác → NOT_FOUND", async () => {
    expect(errCode(await evaluateSkill(deps, viewer, invId))).toBe("FORBIDDEN");
    expect(errCode(await evaluateSkill(deps, admin, "sk_khong_co"))).toBe("NOT_FOUND");
    expect(errCode(await evaluateSkill(deps, other, invId))).toBe("NOT_FOUND");
  });

  it("evaluateSkill: mẫu LABELED chưa có thời điểm gắn nhãn vẫn tính; jobId theo version + tập mẫu", async () => {
    await seedLabeled(5, { labeledAt: null });
    expect(unwrap(await evaluateSkill(deps, admin, invId))).toEqual({ queued: true, version: 1 });
    expect(queue.jobs[0]?.jobId).toMatch(new RegExp(`^skill-eval:${invId}:1:[0-9a-f]{16}$`));
  });

  it("runEvaluation: skill không tồn tại → NOT_FOUND; phiên bản không có → NOT_FOUND; skill ánh xạ → NOT_SUPPORTED", async () => {
    expect(errCode(await runEval(1, "sk_khong_co"))).toBe("NOT_FOUND");
    expect(errCode(await runEval(99))).toBe("NOT_FOUND");
    expect(errCode(await runEval(1, mapId))).toBe("NOT_SUPPORTED");
  });

  it("runEvaluation: mẫu LABELED mà expected null không tính → thiếu mẫu NOT_ENOUGH_SAMPLES, không gọi AI", async () => {
    await seedLabeled(4);
    await seedLabeled(1, { expected: null });
    expect(errCode(await runEval())).toBe("NOT_ENOUGH_SAMPLES");
    expect(aiFiles).toHaveLength(0);
  });

  it("runEvaluation phiên bản cũ (job xếp trước khi sửa trường) → dùng đúng trường của phiên bản đó; ảnh PNG/JPG gửi đúng mime", async () => {
    await seedLabeled(3);
    await seedLabeled(1, { fileName: "x.png" });
    await seedLabeled(1, { fileName: "x.jpeg", pages: 0 });
    unwrap(await updateSkillField(deps, admin, invId, "po_no", { aliases: ["P/O"] }));
    const ev = unwrap(await runEval(1));
    expect(ev.version).toBe(1);
    expect(ev.samples).toBe(5);
    expect(aiFiles.map((f) => f.file.mime)).toEqual(["application/pdf", "application/pdf", "application/pdf", "image/png", "image/jpeg"]);
    expect(aiFiles[4]?.pages).toEqual([1]);
    expect(usage.events).toHaveLength(5);
  });

  it("getEvaluation: skill không tồn tại → NOT_FOUND", async () => {
    expect(errCode(await getEvaluation(deps, admin, "sk_khong_co"))).toBe("NOT_FOUND");
    expect(errCode(await getEvaluation(deps, other, invId))).toBe("NOT_FOUND");
  });
});
