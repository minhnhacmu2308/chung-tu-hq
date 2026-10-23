import type { ClassifyResult } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import { sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import { AiDataError, type ExtractionDeps, type ExtractionUow } from "../ports.js";
import { processDocument } from "../process-document.js";
import { FakeDocuments, InMemoryExtractionUow, NoSkills, NoValidation, RecordingUsage, ScriptedAi } from "../test/fakes.js";

const PACKING = { invoiceNo: "HSP-2610-0457", date: "2026-10-02", packages: 48, packageUnit: "PALLET", grossWeightKg: 3842, netWeightKg: 3600, volumeCbm: null, marks: null, items: [], uncertainties: [] };
const ORG = "org_a";

let uow: InMemoryExtractionUow;
let docs: FakeDocuments;
let usage: RecordingUsage;
let deps: ExtractionDeps;

const addDoc = (id: string, kind: "INVOICE" | "PACKING_LIST" | "OTHER", kindSource: "AI" | "USER" | "FILENAME" = "USER", pages = 1) => {
  docs.docs.push({ id, orgId: ORG, dossierId: "dos_1", kind, kindSource, fileName: `${id}.pdf`, mime: "application/pdf", pages, status: "QUEUED", storageKey: `k/${id}`, sha256: `sha_${id}` });
  docs.files.set(`k/${id}`, Buffer.from("%PDF-fake"));
};
const process = (documentId = "doc_1") => processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId, mode: "FULL" });
const withAi = (byKind: Record<string, unknown>, classify: ClassifyResult | null = null) => {
  const ai = new ScriptedAi(byKind, classify);
  deps.ai = ai;
  return ai;
};
/** AI ném lỗi tùy ý (không bắt buộc là Error) ở bước trích xuất. */
const throwing = (e: unknown) => {
  deps.ai = { name: "boom", classifyPages: async () => { throw e; }, extract: async () => { throw e; } };
};

beforeEach(() => {
  uow = new InMemoryExtractionUow();
  docs = new FakeDocuments();
  usage = new RecordingUsage();
  deps = { uow, documents: docs, validation: new NoValidation(), ai: new ScriptedAi({ PACKING_LIST: PACKING }), usage, skills: new NoSkills(), clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen() };
});

describe("processDocument – phân loại", () => {
  it("AI không tách được chứng từ nào → giữ loại theo tên file, không đổi kindSource", async () => {
    addDoc("doc_1", "PACKING_LIST", "FILENAME");
    const ai = withAi({ PACKING_LIST: PACKING }, { documents: [] });
    unwrap(await process());
    expect(ai.calls).toEqual({ classify: 1, extract: 1 });
    expect(docs.docs[0]).toMatchObject({ kind: "PACKING_LIST", kindSource: "FILENAME", status: "DONE" });
  });

  it("mọi trang là bản sao → lấy chứng từ đầu tiên; cùng loại với tên file → chỉ đổi kindSource sang AI", async () => {
    addDoc("doc_1", "PACKING_LIST", "FILENAME");
    withAi({ PACKING_LIST: PACKING }, { documents: [{ kind: "PACKING_LIST", pages: [1], isDuplicateCopy: true, supplierHint: null }] });
    unwrap(await process());
    expect(docs.docs[0]).toMatchObject({ kind: "PACKING_LIST", kindSource: "AI", status: "DONE" });
  });
});

describe("processDocument – trích xuất", () => {
  it("số trang 0 → vẫn gửi trang 1", async () => {
    addDoc("doc_1", "PACKING_LIST", "USER", 0);
    let sent: number[] = [];
    const ai = new ScriptedAi({ PACKING_LIST: PACKING });
    deps.ai = { name: ai.name, classifyPages: (f) => ai.classifyPages(f), extract: async (f, pages, s, p) => ((sent = pages), ai.extract(f, pages, s, p)) };
    unwrap(await process());
    expect(sent).toEqual([1]);
  });

  it("model trả sai cấu trúc → chứng từ ERROR nêu trường sai; usage vẫn ghi; không lưu extraction", async () => {
    addDoc("doc_1", "PACKING_LIST");
    withAi({ PACKING_LIST: { ...PACKING, packages: "bốn mươi tám" } });
    unwrap(await process());
    expect(docs.docs[0]).toMatchObject({ status: "ERROR", error: expect.stringMatching(/không đúng cấu trúc \(packages\)/) });
    expect(usage.events).toHaveLength(1);
    expect(uow.data.extractions).toHaveLength(0);
  });

  it("model từ chối / cắt vì max_tokens (AiDataError kèm usage) → chứng từ ERROR nhưng token vẫn được ghi usage_events (bất biến 8)", async () => {
    addDoc("doc_1", "PACKING_LIST", "FILENAME");
    const tokens = { model: "claude-sonnet-5-5", inputTokens: 4321, outputTokens: 12 };
    deps.ai = { name: "claude", classifyPages: async () => { throw new AiDataError("Model từ chối đọc chứng từ (safety)", tokens); }, extract: async () => { throw new Error("không tới đây"); } };
    unwrap(await process());
    expect(docs.docs[0]).toMatchObject({ status: "ERROR", error: expect.stringContaining("từ chối") });
    expect(usage.events).toHaveLength(1);
    expect(usage.events[0]).toMatchObject({ kind: "AI_CLASSIFY", provider: "claude", model: "claude-sonnet-5-5", inputTokens: 4321, outputTokens: 12 });
  });

  it("hai job song song: insert trùng khóa → bỏ qua, chứng từ vẫn DONE", async () => {
    addDoc("doc_1", "PACKING_LIST");
    const racing: ExtractionUow = {
      asOrg: (ctx, fn) => uow.asOrg(ctx, (r) => fn({ ...r, extractions: { ...r.extractions, findByKey: async () => null, insert: async () => { throw new Error("duplicate key value violates unique constraint extractions_idem_uq"); } } })),
    };
    deps.uow = racing;
    unwrap(await process());
    expect(docs.docs[0]?.status).toBe("DONE");
  });

  it("insert lỗi DB khác → coi là lỗi tạm: chứng từ QUEUED, ném lại", async () => {
    addDoc("doc_1", "PACKING_LIST");
    deps.uow = { asOrg: (ctx, fn) => uow.asOrg(ctx, (r) => fn({ ...r, extractions: { ...r.extractions, insert: async () => { throw new Error("connection terminated"); } } })) };
    await expect(process()).rejects.toThrow("connection terminated");
    expect(docs.docs[0]?.status).toBe("QUEUED");
  });
});

describe("processDocument – phân loại lỗi", () => {
  it.each([
    ["HTTP 400 từ nhà cung cấp AI", Object.assign(new Error("invalid pdf"), { status: 400 }), "invalid pdf"],
    ["HTTP 413", Object.assign(new Error("too large"), { status: 413 }), "too large"],
    ["FILE_INVALID (không có message)", { code: "FILE_INVALID" }, "Không đọc được chứng từ"],
    ["file không còn trong storage (NoSuchKey)", Object.assign(new Error("gone"), { name: "NoSuchKey" }), "gone"],
  ])("%s → lỗi vĩnh viễn: chứng từ ERROR, không ném", async (_label, e, message) => {
    addDoc("doc_1", "PACKING_LIST");
    throwing(e);
    unwrap(await process());
    expect(docs.docs[0]).toMatchObject({ status: "ERROR", error: message });
    expect(docs.events).toContainEqual({ type: "document.status", documentId: "doc_1", status: "ERROR", error: message });
  });

  it.each([
    ["HTTP 429", Object.assign(new Error("rate limited"), { status: 429 })],
    ["HTTP 503", Object.assign(new Error("overloaded"), { status: 503 })],
    ["lỗi không phải Error", "ECONNRESET"],
  ])("%s → lỗi tạm: chứng từ QUEUED, ném để retry", async (_label, e) => {
    addDoc("doc_1", "PACKING_LIST");
    throwing(e);
    await expect(process()).rejects.toBe(e);
    expect(docs.docs[0]?.status).toBe("QUEUED");
  });

  it("lỗi ở bước phân loại (FILENAME) cũng được xử lý như trích xuất", async () => {
    addDoc("doc_1", "PACKING_LIST", "FILENAME");
    throwing(Object.assign(new Error("bad request"), { status: 400 }));
    unwrap(await process());
    expect(docs.docs[0]).toMatchObject({ status: "ERROR", error: "bad request" });
  });
});
