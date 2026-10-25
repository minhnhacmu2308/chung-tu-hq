import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb, saveDb } from "@/mocks/db";
import { approveDeclaration } from "./declaration";
import { getSubmission, listCustomsDeclarations, performOperation, resendOperation, startPostAmendment, submitDeclaration } from "./customs";
import { addPostAmendmentLines, approvePostAmendment, updatePostAmendmentField } from "./post-amendment";

// Bỏ độ trễ mạng giả để test nhanh; thời gian nghiệp vụ điều khiển bằng đồng hồ giả (chỉ Date).
vi.mock("@/lib/mock-request", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/mock-request")>();
  return {
    ...real,
    query: async <T,>(fn: (db: ReturnType<typeof getDb>) => T) => structuredClone(fn(getDb())),
    mutate: async <T,>(fn: (db: ReturnType<typeof getDb>) => T) => {
      const r = fn(getDb());
      saveDb();
      return structuredClone(r);
    },
  };
});

const NEW = "dos_024"; // NK, đã duyệt, chưa khai – luôn luồng xanh
const INSPECTING = "dos_019"; // NK, đã phân luồng vàng, đã gửi HYS
const CLEARED = "dos_018"; // NK, đã thông quan
const CERT = "cert_vnpt";

const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);
const err = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; message?: string }) => ({ code: e.code, message: e.message }));
const row = async (id: string, op: string) => (await getSubmission(id)).pipeline.find((r) => r.op === op)!;
const decl = (id: string) => getDb().declarations.find((d) => d.dossierId === id)!;
const dossier = (id: string) => getDb().dossiers.find((d) => d.id === id)!;
/** Gửi một nghiệp vụ và chờ Hải quan (mô phỏng) phản hồi. */
const run = async (id: string, op: Parameters<typeof performOperation>[1]) => {
  const r = await performOperation(id, op);
  wait(3_000);
  return r;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T03:00:00Z"));
  resetDb();
});
afterEach(() => vi.useRealTimers());

describe("luồng nghiệp vụ Hải quan (mock)", () => {
  it("IDA chỉ khai tạm → IDC do người khai bấm → luồng xanh tự thông quan, IID trả trạng thái", async () => {
    await submitDeclaration(NEW, CERT);
    let s = await getSubmission(NEW);
    expect(s.stage).toBe("NOT_SENT");
    expect(s.pipeline.find((r) => r.op === "IDA")!.status).toBe("SENDING");
    expect(s.pipeline.find((r) => r.op === "IDC")).toMatchObject({ enabled: false, reason: "Đang chờ phản hồi IDA" });
    expect(decl(NEW).status).toBe("SUBMITTED");

    wait(3_000);
    s = await getSubmission(NEW);
    expect(s).toMatchObject({ stage: "PRE_DECLARED", nextOp: "IDC", queryOp: "IID" });
    expect(s.result?.declarationNo).toMatch(/^107\d{9}$/);
    expect(s.result?.channel).toBeUndefined();
    expect(dossier(NEW).declarationNo).toBe(s.result?.declarationNo);
    expect(s.pipeline.some((r) => r.op === "IDC" && r.status === "NOT_SENT")).toBe(true);

    await run(NEW, "IDC");
    s = await getSubmission(NEW);
    expect(s).toMatchObject({ stage: "DECLARED", inProgress: true });
    expect(s.result).toMatchObject({ channel: "GREEN", clearanceStatus: "WAITING" });

    wait(6_000);
    s = await getSubmission(NEW);
    expect(s.stage).toBe("CLEARED");
    expect(s.result?.clearanceStatus).toBe("CLEARED");
    expect(dossier(NEW).status).toBe("CLEARED");
    expect(s.messages[0]).toMatchObject({ operation: "IID", direction: "IN", summary: "Trạng thái tờ khai: Đã thông quan" });

    const q = await performOperation(NEW, "IID");
    expect(q).toEqual({ sent: false, message: "Trạng thái tờ khai: Đã thông quan" });
    expect((await listCustomsDeclarations()).find((r) => r.dossierId === NEW)).toMatchObject({ state: "CLEARED", stage: "CLEARED", lastOperation: "IID" });
  });

  it("IDB gọi về sửa → mở lại tờ khai → duyệt lại → IDA khai tạm lại", async () => {
    await submitDeclaration(NEW, CERT);
    wait(3_000);
    await run(NEW, "IDB");
    let s = await getSubmission(NEW);
    expect(s.stage).toBe("RECALLED");
    expect(decl(NEW).status).toBe("DRAFT");
    expect(dossier(NEW)).toMatchObject({ step: "review", status: "NEEDS_REVIEW" });
    expect(s.pipeline.find((r) => r.op === "IDA")).toMatchObject({ enabled: true, action: "EDIT" });
    expect(s.nextOp).toBe("IDA");
    expect(await err(performOperation(NEW, "IDA"))).toMatchObject({ code: "NOT_APPROVED" });

    await approveDeclaration(NEW);
    expect(await row(NEW, "IDA")).toMatchObject({ enabled: true, action: "SEND" });
    await run(NEW, "IDA");
    s = await getSubmission(NEW);
    expect(s.stage).toBe("PRE_DECLARED");
    expect(s.messages[0]!.summary).toContain("khai tạm lại");
  });

  it("sửa đổi bổ sung: IDD → duyệt lại → IDA01 → IDE (luồng vàng thông quan sau khi đã có HYS)", async () => {
    expect((await getSubmission(INSPECTING)).stage).toBe("DECLARED");
    await run(INSPECTING, "IDD");
    expect((await getSubmission(INSPECTING)).stage).toBe("AMEND_RECALLED");
    expect(decl(INSPECTING).status).toBe("DRAFT");
    expect(await row(INSPECTING, "IDA01")).toMatchObject({ action: "EDIT" });

    await approveDeclaration(INSPECTING);
    await run(INSPECTING, "IDA01");
    let s = await getSubmission(INSPECTING);
    expect(s).toMatchObject({ stage: "AMEND_PRE_DECLARED", nextOp: "IDE" });
    await run(INSPECTING, "IDE");
    s = await getSubmission(INSPECTING);
    expect(s).toMatchObject({ stage: "DECLARED", amendments: 1 });
    expect(s.result?.channel).toBe("YELLOW");

    wait(7_000);
    expect((await getSubmission(INSPECTING)).stage).toBe("CLEARED");
  });

  it("sau thông quan: lập bản khai bổ sung (tờ khai gốc giữ nguyên) → duyệt → AMA → AMB → duyệt lại → AMA → AMC", async () => {
    let s = await getSubmission(CLEARED);
    expect(s.stage).toBe("CLEARED");
    expect(s.pipeline.find((r) => r.op === "AMA")).toMatchObject({ enabled: true, action: "START_POST_EDIT" });
    expect(await err(performOperation(CLEARED, "AMA"))).toMatchObject({ code: "POST_EDIT_REQUIRED" });
    const original = structuredClone(decl(CLEARED));

    await startPostAmendment(CLEARED);
    s = await getSubmission(CLEARED);
    expect(s.stage).toBe("POST_EDITING");
    expect(decl(CLEARED)).toEqual(original);
    expect(dossier(CLEARED).step).toBe("review");
    expect(s.pipeline.find((r) => r.op === "AMA")).toMatchObject({ action: "EDIT" });
    const pa = () => getDb().postAmendments.find((a) => a.dossierId === CLEARED)!;
    expect(pa()).toMatchObject({ status: "DRAFT", seq: 1, header: { TK_YNK: "I", TK_ICN: s.result?.declarationNo } });

    expect(await err(approvePostAmendment(CLEARED))).toMatchObject({ code: "NO_LINES" });
    await addPostAmendmentLines(CLEARED, [1]);
    await updatePostAmendmentField(CLEARED, { key: "TK_REC", value: "3" });
    await approvePostAmendment(CLEARED);
    expect((await getSubmission(CLEARED)).pipeline.find((r) => r.op === "AMA")).toMatchObject({ enabled: true });
    await run(CLEARED, "AMA");
    expect((await getSubmission(CLEARED)).stage).toBe("POST_PRE_DECLARED");
    expect(pa()).toMatchObject({ status: "PRE_DECLARED", result: { TK_SYN: expect.any(String), TK_A25: "1" } });
    expect(await err(updatePostAmendmentField(CLEARED, { key: "TK_REC", value: "1" }))).toMatchObject({ code: "LOCKED" });

    await run(CLEARED, "AMB");
    expect((await getSubmission(CLEARED)).stage).toBe("POST_RECALLED");
    expect(pa().status).toBe("RECALLED");
    expect(decl(CLEARED)).toEqual(original);
    await approvePostAmendment(CLEARED);
    await run(CLEARED, "AMA");
    await run(CLEARED, "AMC");
    s = await getSubmission(CLEARED);
    expect(s).toMatchObject({ stage: "CLEARED", postAmendments: 1 });
    expect(pa().status).toBe("REGISTERED");
    expect(dossier(CLEARED).status).toBe("CLEARED");
    expect(await err(startPostAmendment(NEW))).toMatchObject({ code: "INVALID_STATE" });
  });

  it("nghiệp vụ bị khóa → lỗi kèm lý do; sai chiều tờ khai → INVALID_OPERATION; đang chờ → khóa", async () => {
    expect(await err(performOperation(NEW, "IDC"))).toEqual({ code: "OPERATION_LOCKED", message: "Khai tạm trước để nhận số tờ khai" });
    // Cùng mã lý do backend gửi → giao diện dịch được ở chế độ mock.
    await expect(performOperation(NEW, "IDC")).rejects.toMatchObject({ reason: "IDC_REQUIRES_PRE_DECLARED" });
    expect((await getSubmission(NEW)).pipeline.find((r) => r.op === "IDC")).toMatchObject({ reasonCode: "IDC_REQUIRES_PRE_DECLARED", reason: "Khai tạm trước để nhận số tờ khai" });
    expect(await err(performOperation(NEW, "EDA"))).toMatchObject({ code: "INVALID_OPERATION" });
    expect(await err(performOperation(NEW, "IID"))).toMatchObject({ code: "OPERATION_LOCKED" });
    expect(await err(submitDeclaration(NEW, ""))).toMatchObject({ code: "NO_CERT" });
    // Ô bắt buộc bị xóa sau khi duyệt → chặn khai, chưa gửi gì.
    const kho = decl(NEW).fields.find((f) => f.code === "KHO")!;
    const saved = kho.value;
    kho.value = "";
    expect(await err(submitDeclaration(NEW, CERT))).toMatchObject({ code: "VALIDATION", message: expect.stringContaining("Chưa khai được") });
    await expect(submitDeclaration(NEW, CERT)).rejects.toMatchObject({ reason: "REQUIRED_FIELDS_MISSING_SUBMIT", params: { n: expect.any(Number) } });
    expect((await getSubmission(NEW)).stage).toBe("NOT_SENT");
    kho.value = saved;
    await submitDeclaration(NEW, CERT);
    expect(await err(performOperation(NEW, "HYS"))).toMatchObject({ code: "OPERATION_LOCKED", message: "Đang chờ phản hồi IDA" });
    wait(3_000);
    expect(await err(submitDeclaration(NEW, CERT))).toMatchObject({ code: "ALREADY_SUBMITTED" });
  });

  it("chứng từ & cảng: HYS số tiếp nhận, container qua KVGS, lệ phí cảng ghi rõ mô phỏng", async () => {
    expect((await run(INSPECTING, "HYS")).sent).toBe(true);
    expect((await getSubmission(INSPECTING)).messages[0]!.summary).toMatch(/số tiếp nhận HYS\d{6}/);
    await run(INSPECTING, "CONT");
    const cont = (await getSubmission(INSPECTING)).messages[0]!;
    expect(cont).toMatchObject({ operation: "CONT", direction: "IN" });
    expect(cont.summary).toMatch(/^Đã đăng ký qua khu vực giám sát: [A-Z]{4}\d{7}/);
    await run(INSPECTING, "PORT_FEE");
    const fee = (await getSubmission(INSPECTING)).messages.find((m) => m.operation === "PORT_FEE" && m.direction === "IN")!;
    expect(fee.summary).toContain("mô phỏng");
    expect(fee.summary).toContain("không phải biểu phí thật");
  });

  it("gửi lại nghiệp vụ lỗi: tra cứu trước rồi mới gửi lại", async () => {
    const db = getDb();
    const at = new Date(Date.now() - 1_000).toISOString();
    db.customsMessages.push({ id: "msg_err", dossierId: INSPECTING, operation: "HYS", direction: "OUT", result: "ERROR", summary: "Lỗi ký số", at, payloadPreview: "{}" });
    expect((await row(INSPECTING, "HYS")).status).toBe("ERROR");
    expect(await resendOperation(INSPECTING, "HYS")).toMatchObject({ resent: true });
    wait(1_500);
    const s = await getSubmission(INSPECTING);
    expect(s.messages.slice(0, 2).map((m) => m.operation)).toEqual(["IID", "IID"]);
    expect(s.pipeline.find((r) => r.op === "HYS")!.status).toBe("SENDING");
    wait(6_000);
    expect((await row(INSPECTING, "HYS")).status).toBe("OK");
    expect(await err(resendOperation(INSPECTING, "HYS"))).toMatchObject({ code: "NOTHING_TO_RESEND" });
  });
});

/* ---------------- Lô lớn: tờ khai nhánh (> 50 dòng → 50 dòng/tờ) ---------------- */

const BIG = "dos_028"; // NK, đã duyệt, 120 dòng → 3 tờ (50 + 50 + 20), mọi tờ luồng xanh
const runB = async (id: string, op: Parameters<typeof performOperation>[1], branch: number) => {
  const r = await performOperation(id, op, branch);
  wait(3_000);
  return r;
};
const sheets = async (id: string) => (await getSubmission(id)).branches;
/** Khai tạm cả lô: tờ 1 rồi tờ 2, 3 nối tiếp. */
const preDeclareAll = async (id: string) => {
  await submitDeclaration(id, CERT);
  wait(9_000);
};
const clearSheet = async (id: string, branch: number) => {
  await runB(id, "IDC", branch);
  wait(6_000);
};
const payloadOf = (id: string, branch: number, op: string, dir: "OUT" | "IN") => {
  const m = getDb().customsMessages.find((x) => x.dossierId === id && (x.branch ?? 1) === branch && x.operation === op && x.direction === dir)!;
  return JSON.parse(m.payloadPreview) as Record<string, unknown>;
};

describe("tờ khai nhánh (mock)", () => {
  it("lô 120 dòng → 3 tờ; khai tạm tờ 1 trước, tờ 2 và 3 nối tiếp, mỗi tờ một số tờ khai", async () => {
    let b = await sheets(BIG);
    expect(b.map((x) => [x.no, x.of, x.stage])).toEqual([[1, 3, "NOT_SENT"], [2, 3, "NOT_SENT"], [3, 3, "NOT_SENT"]]);
    await submitDeclaration(BIG, CERT);
    b = await sheets(BIG);
    expect(b[0]!.pipeline.find((r) => r.op === "IDA")!.status).toBe("SENDING");
    expect(b[1]!.stage).toBe("NOT_SENT");
    wait(3_000);
    b = await sheets(BIG);
    expect(b[0]).toMatchObject({ stage: "PRE_DECLARED" });
    expect(b[1]!.pipeline.find((r) => r.op === "IDA")!.status).toBe("SENDING"); // tờ 2 đã được gửi nối tiếp
    wait(6_000);
    b = await sheets(BIG);
    expect(b.map((x) => x.stage)).toEqual(["PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED"]);
    const nos = b.map((x) => x.declarationNo);
    expect(new Set(nos).size).toBe(3);
    expect(nos.every((n) => /^107\d{9}$/.test(n!))).toBe(true);
    expect(dossier(BIG).declarationNo).toBe(nos[0]);
    // 1.2: tờ 1 ghi "F", tờ k ≥ 2 ghi số tờ khai của tờ 1.
    expect(payloadOf(BIG, 1, "IDA", "OUT")).toMatchObject({ TK_FIC: "F", TK_BNO: 1, TK_DNO: 3 });
    expect(payloadOf(BIG, 2, "IDA", "OUT")).toMatchObject({ TK_FIC: nos[0], TK_BNO: 2, TK_DNO: 3 });
    expect(payloadOf(BIG, 3, "IDA", "OUT")).toMatchObject({ TK_FIC: nos[0], TK_BNO: 3, TK_DNO: 3 });
    const s = await getSubmission(BIG);
    expect(s.stage).toBe("PRE_DECLARED");
    expect(s.result?.declarationNo).toBe(nos[0]);
    expect(s.branches[1]!.messages.every((m) => m.operation === "IDA")).toBe(true);
    expect(s.summary).toEqual({ of: 3, cleared: 0, problems: [] });
    expect(await err(performOperation(BIG, "IDC", 4))).toMatchObject({ code: "NOT_FOUND" });
  });

  it("thông quan từng tờ: summary đếm số tờ; hồ sơ CLEARED chỉ khi đủ mọi tờ", async () => {
    await preDeclareAll(BIG);
    await clearSheet(BIG, 1);
    let s = await getSubmission(BIG);
    expect(s.branches.map((x) => x.stage)).toEqual(["CLEARED", "PRE_DECLARED", "PRE_DECLARED"]);
    expect(s.summary).toEqual({ of: 3, cleared: 1, problems: [] });
    expect(dossier(BIG).status).toBe("SUBMITTED");
    await clearSheet(BIG, 2);
    expect((await getSubmission(BIG)).summary.cleared).toBe(2);
    expect(dossier(BIG).status).toBe("SUBMITTED");
    await clearSheet(BIG, 3);
    s = await getSubmission(BIG);
    expect(s.summary).toEqual({ of: 3, cleared: 3, problems: [] });
    expect(dossier(BIG).status).toBe("CLEARED");
  });

  it("nghiệp vụ và gửi lại chỉ tác động tờ được chọn; danh sách Hải quan mỗi tờ một dòng", async () => {
    await preDeclareAll(BIG);
    await runB(BIG, "IDC", 2);
    const b = await sheets(BIG);
    expect(b.map((x) => x.stage)).toEqual(["PRE_DECLARED", "DECLARED", "PRE_DECLARED"]);
    expect(b[1]!.result).toMatchObject({ channel: "GREEN" });
    expect(b[0]!.result?.channel).toBeUndefined();
    expect((await performOperation(BIG, "IID", 2)).sent).toBe(false);
    expect((await sheets(BIG))[1]!.messages[0]).toMatchObject({ operation: "IID" });
    expect((await sheets(BIG))[0]!.messages[0]).toMatchObject({ operation: "IDA", direction: "IN" });
    getDb().customsMessages.push({ id: "msg_b3", dossierId: BIG, branch: 3, operation: "HYS", direction: "OUT", result: "ERROR", summary: "Lỗi", at: new Date(Date.now() - 500).toISOString(), payloadPreview: "{}" });
    expect(await err(resendOperation(BIG, "HYS", 2))).toMatchObject({ code: "NOTHING_TO_RESEND" });
    expect(await resendOperation(BIG, "HYS", 3)).toMatchObject({ resent: true });
    const rows = (await listCustomsDeclarations()).filter((r) => r.dossierId === BIG).sort((a, c) => a.branch - c.branch);
    expect(rows.map((r) => [r.branch, r.of])).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(rows.every((r) => r.declarationNo)).toBe(true);
  });

  it("sửa sau thông quan chỉ khi tờ đó đã thông quan; bản khai và số tờ khai theo tờ", async () => {
    await preDeclareAll(BIG);
    await clearSheet(BIG, 1);
    expect(await err(startPostAmendment(BIG, 2))).toMatchObject({ code: "INVALID_STATE" });
    await startPostAmendment(BIG, 1);
    const b = await sheets(BIG);
    expect(b.map((x) => x.stage)).toEqual(["POST_EDITING", "PRE_DECLARED", "PRE_DECLARED"]);
    expect(getDb().postAmendments.filter((a) => a.dossierId === BIG).map((a) => a.branch ?? 1)).toEqual([1]);
    expect(getDb().postAmendments[0]!.header["TK_ICN"]).toBe(b[0]!.declarationNo);
    expect((await getSubmission(BIG)).summary.cleared).toBe(1);
  });
});

describe("tờ khai nhánh: gọi về sửa và truyền lại (R3)", () => {
  it("gọi về sửa riêng tờ 2 → chưa mở lại tờ khai, truyền lại bị chặn: phải gọi về các tờ 1, 3", async () => {
    await preDeclareAll(BIG);
    await runB(BIG, "IDB", 2);
    const b = await sheets(BIG);
    expect(b.map((x) => x.stage)).toEqual(["PRE_DECLARED", "RECALLED", "PRE_DECLARED"]);
    expect(decl(BIG).status).toBe("SUBMITTED");
    await expect(submitDeclaration(BIG, CERT)).rejects.toMatchObject({ code: "INVALID_STATE", reason: "SHEETS_RECALL_FIRST", params: { sheets: "1, 3" } });
    expect((await sheets(BIG)).map((x) => x.stage)).toEqual(["PRE_DECLARED", "RECALLED", "PRE_DECLARED"]);
  });

  it("gọi về đủ mọi tờ → mở lại → duyệt lại → truyền lại lần lượt tờ 1 → 2 → 3", async () => {
    await preDeclareAll(BIG);
    await runB(BIG, "IDB", 1);
    await runB(BIG, "IDB", 2);
    expect(decl(BIG).status).toBe("SUBMITTED"); // còn tờ 3 chưa gọi về
    await runB(BIG, "IDB", 3);
    expect((await sheets(BIG)).map((x) => x.stage)).toEqual(["RECALLED", "RECALLED", "RECALLED"]);
    expect(decl(BIG).status).toBe("DRAFT");
    expect(dossier(BIG)).toMatchObject({ step: "review", status: "NEEDS_REVIEW" });
    await approveDeclaration(BIG);
    // Tờ sau không khai tạm lại trước khi tờ 1 / tờ trước xong.
    await expect(performOperation(BIG, "IDA", 3)).rejects.toMatchObject({ message: expect.stringContaining("truyền lại từ tờ 1") });
    await submitDeclaration(BIG, CERT);
    wait(9_000);
    const s = await getSubmission(BIG);
    expect(s.branches.map((x) => x.stage)).toEqual(["PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED"]);
    const outs = getDb().customsMessages.filter((m) => m.dossierId === BIG && m.operation === "IDA" && m.direction === "OUT" && m.summary.includes("sau khi gọi sửa"));
    expect(outs.map((m) => m.branch ?? 1)).toEqual([1, 2, 3]);
    expect(outs.map((m) => m.at)).toEqual([...outs.map((m) => m.at)].sort());
  });

  it("tờ k ≥ 2 không khai tạm khi tờ 1 chưa có số; lỗi gửi của một tờ → state SEND_FAILED trong summary.problems", async () => {
    expect(await err(performOperation(BIG, "IDA", 2))).toMatchObject({ code: "INVALID_STATE", message: expect.stringContaining("tờ 1 chưa có số tờ khai") });
    await preDeclareAll(BIG);
    getDb().customsMessages.push({ id: "msg_e3", dossierId: BIG, branch: 3, operation: "HYS", direction: "OUT", result: "ERROR", summary: "Lỗi", at: new Date(Date.now() - 500).toISOString(), payloadPreview: "{}" });
    const s = await getSubmission(BIG);
    expect(s.branches.map((x) => x.state)).toEqual(["APPROVED", "APPROVED", "SEND_FAILED"]);
    expect(s.summary.problems).toEqual([{ no: 3, kind: "SEND_FAILED" }]);
  });
});

describe("tờ khai nhánh: tờ đã thông quan không phải gọi về (R7), 'đã duyệt' khi đang truyền lại", () => {
  it("tờ 1 thông quan, tờ 3 gọi về, tờ 2 gọi sửa đổi (IDD) → mở lại; duyệt lại → truyền lại tờ 2 (IDA01) rồi tờ 3, tờ 1 giữ nguyên", async () => {
    await preDeclareAll(BIG);
    await clearSheet(BIG, 1);
    await runB(BIG, "IDB", 3);
    await runB(BIG, "IDC", 2);
    await runB(BIG, "IDD", 2);
    expect((await sheets(BIG)).map((x) => x.stage)).toEqual(["CLEARED", "AMEND_RECALLED", "RECALLED"]);
    expect(decl(BIG).status).toBe("DRAFT");
    await approveDeclaration(BIG);
    const before = getDb().customsMessages.filter((m) => m.dossierId === BIG && (m.branch ?? 1) === 1).length;
    await submitDeclaration(BIG, CERT);
    // Đang truyền lại tờ 2: tờ 3 (đã gọi về) vẫn là đã duyệt – IDA không trỏ về Review.
    expect((await sheets(BIG))[2]!.pipeline.find((r) => r.op === "IDA")!.action).not.toBe("EDIT");
    wait(9_000);
    expect((await sheets(BIG)).map((x) => x.stage)).toEqual(["CLEARED", "AMEND_PRE_DECLARED", "PRE_DECLARED"]);
    expect(getDb().customsMessages.filter((m) => m.dossierId === BIG && (m.branch ?? 1) === 1).length).toBe(before);
  });
});
