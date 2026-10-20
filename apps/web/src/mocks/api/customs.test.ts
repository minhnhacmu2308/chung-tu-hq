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
    expect(await err(performOperation(NEW, "EDA"))).toMatchObject({ code: "INVALID_OPERATION" });
    expect(await err(performOperation(NEW, "IID"))).toMatchObject({ code: "OPERATION_LOCKED" });
    expect(await err(submitDeclaration(NEW, ""))).toMatchObject({ code: "NO_CERT" });
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
