import { describe, expect, it } from "vitest";
import { branch, pipelineFor, submissionOf } from "@/test/branch-submission";
import { recallProgress, anyInProgress, canDeclareAll, clearedWhileResending, declareWaitingOn, postSheet, problemOf, sheetsOf, sheetView, orderLocked, waitingOn } from "./branch-sheets";

describe("sheetsOf", () => {
  it("JSON cũ không có branches → một tờ từ trường cấp hồ sơ", () => {
    const s = { ...submissionOf([branch(1, 1, "PRE_DECLARED")]), branches: [] };
    const [only, ...rest] = sheetsOf(s);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ no: 1, of: 1, stage: "PRE_DECLARED", declarationNo: "107624410321" });
  });
  it("lô nhiều tờ → giữ nguyên thứ tự nhánh", () => {
    const s = submissionOf([branch(1, 3, "CLEARED"), branch(2, 3, "PRE_DECLARED"), branch(3, 3, "NOT_SENT")]);
    expect(sheetsOf(s).map((b) => b.no)).toEqual([1, 2, 3]);
  });
});

describe("sheetView", () => {
  it("tờ 1 / lô 1 tờ → nguyên SubmissionView; tờ k → trường cấp hồ sơ của tờ k", () => {
    const s = submissionOf([branch(1, 3, "CLEARED"), branch(2, 3, "PRE_DECLARED", { nextOp: "IDC", pipeline: pipelineFor("PRE_DECLARED", ["IDC"]) }), branch(3, 3, "NOT_SENT")]);
    expect(sheetView(s, 1)).toBe(s);
    const v = sheetView(s, 2);
    expect(v).toMatchObject({ stage: "PRE_DECLARED", nextOp: "IDC", result: { declarationNo: "107624410322" } });
    expect(v.pipeline.find((r) => r.op === "IDC")!.enabled).toBe(true);
    expect(v.branches).toBe(s.branches);
  });
});

describe("waitingOn", () => {
  it("tờ chưa gửi chờ tờ ngay trước khi tờ đó chưa có số; tờ trước đã có số → không chờ (lỗi / đang gửi của chính nó)", () => {
    const sheets = [branch(1, 3, "PRE_DECLARED"), branch(2, 3, "NOT_SENT", { state: "SEND_FAILED" }), branch(3, 3, "NOT_SENT")];
    expect(waitingOn(sheets, 1)).toBeNull();
    expect(waitingOn(sheets, 2)).toBeNull();
    expect(waitingOn(sheets, 3)).toBe(2);
  });
  it("tờ đang gửi (SENDING) không ghi chờ", () => {
    const sending = branch(2, 2, "NOT_SENT", { pipeline: pipelineFor("NOT_SENT").map((r) => (r.op === "IDA" ? { ...r, status: "SENDING" as const } : r)) });
    expect(waitingOn([branch(1, 2, "NOT_SENT"), sending], 2)).toBeNull();
    expect(waitingOn([branch(1, 2, "NOT_SENT"), branch(2, 2, "NOT_SENT")], 2)).toBe(1);
  });
});

describe("waitingOn – truyền lại sau gọi về (tờ khai SUBMITTED)", () => {
  const sending = (b: ReturnType<typeof branch>, op: "IDA" | "IDA01") => ({ ...b, pipeline: b.pipeline.map((r) => (r.op === op ? { ...r, status: "SENDING" as const } : r)) });
  it("tờ đã gọi về chờ tờ trước gần nhất còn chờ gửi lại nội dung; tờ đang gửi / tờ trước đã xong → không chờ", () => {
    const sheets = [sending(branch(1, 3, "RECALLED"), "IDA"), branch(2, 3, "AMEND_RECALLED"), branch(3, 3, "RECALLED")];
    expect(waitingOn(sheets, 1, "SUBMITTED")).toBeNull();
    expect(waitingOn(sheets, 2, "SUBMITTED")).toBe(1);
    expect(waitingOn(sheets, 3, "SUBMITTED")).toBe(2);
    const later = [branch(1, 3, "PRE_DECLARED"), sending(branch(2, 3, "AMEND_RECALLED"), "IDA01"), branch(3, 3, "RECALLED")];
    expect(waitingOn(later, 2, "SUBMITTED")).toBeNull();
    expect(waitingOn(later, 3, "SUBMITTED")).toBe(2);
    // Tờ trước đã thông quan (miễn gọi về) → không chờ tờ đó.
    expect(waitingOn([branch(1, 2, "CLEARED"), branch(2, 2, "AMEND_RECALLED")], 2, "SUBMITTED")).toBeNull();
  });
  it("tờ khai đang sửa / không rõ → không ghi chờ cho tờ đã gọi về", () => {
    const sheets = [branch(1, 2, "RECALLED"), branch(2, 2, "RECALLED")];
    expect(waitingOn(sheets, 2, "DRAFT")).toBeNull();
    expect(waitingOn(sheets, 2)).toBeNull();
  });
});

describe("waitingOn – tờ khai đã duyệt lại, chưa truyền lại (APPROVED): cùng quy tắc thứ tự tờ với backend (sheetOrderWait)", () => {
  it("mọi tờ đã gọi về → tờ 1 không chờ, tờ 2 chờ tờ 1, tờ 3 chờ tờ 2", () => {
    const sheets = [branch(1, 3, "RECALLED"), branch(2, 3, "RECALLED"), branch(3, 3, "AMEND_RECALLED")];
    expect(waitingOn(sheets, 1, "APPROVED")).toBeNull();
    expect(waitingOn(sheets, 2, "APPROVED")).toBe(1);
    expect(waitingOn(sheets, 3, "APPROVED")).toBe(2);
  });
  it("R7: tờ trước đã thông quan không chờ; tờ giữa thông quan → tờ sau chờ tờ trước gần nhất còn chờ gửi", () => {
    expect(waitingOn([branch(1, 3, "CLEARED"), branch(2, 3, "AMEND_RECALLED"), branch(3, 3, "AMEND_RECALLED")], 2, "APPROVED")).toBeNull();
    expect(waitingOn([branch(1, 3, "CLEARED"), branch(2, 3, "AMEND_RECALLED"), branch(3, 3, "AMEND_RECALLED")], 3, "APPROVED")).toBe(2);
    expect(waitingOn([branch(1, 3, "AMEND_RECALLED"), branch(2, 3, "CLEARED"), branch(3, 3, "AMEND_RECALLED")], 3, "APPROVED")).toBe(1);
  });
  it("tờ chưa có số chờ tờ trước đã gọi về; tờ trước đã gửi lại xong → không chờ", () => {
    expect(waitingOn([branch(1, 3, "RECALLED"), branch(2, 3, "RECALLED"), branch(3, 3, "NOT_SENT")], 3, "APPROVED")).toBe(2);
    expect(waitingOn([branch(1, 3, "PRE_DECLARED"), branch(2, 3, "PRE_DECLARED"), branch(3, 3, "RECALLED")], 3, "APPROVED")).toBeNull();
    // Tờ không cần gửi nội dung (chưa gọi về) không ghi chờ – vẫn thấy nút gọi về của nó.
    expect(waitingOn([branch(1, 3, "RECALLED"), branch(2, 3, "RECALLED"), branch(3, 3, "PRE_DECLARED")], 3, "APPROVED")).toBeNull();
  });
});

describe("orderLocked – khóa nút gửi nội dung của tờ đang chờ tờ trước", () => {
  it("tờ chờ → IDA/IDA01 bấm được thành khóa với lý do SHEET_ORDER; nghiệp vụ khác giữ nguyên; không chờ → giữ nguyên", () => {
    const rows = pipelineFor("RECALLED", ["IDA", "IDC"]);
    const locked = orderLocked(rows, 3, 2);
    expect(locked.find((r) => r.op === "IDA")).toMatchObject({ enabled: false, reasonCode: "SHEET_ORDER", reasonParams: { sheet: 3, waitFor: 2 }, reason: "Tờ 3: chờ tờ 2 gửi nội dung trước – truyền theo thứ tự tờ khai" });
    expect(locked.find((r) => r.op === "IDC")).toEqual(rows.find((r) => r.op === "IDC"));
    expect(orderLocked(rows, 3, null)).toBe(rows);
  });
});

describe("clearedWhileResending", () => {
  it("tờ đã thông quan (kể cả sửa sau thông quan) khi có tờ đang gọi về / gọi sửa đổi; không có tờ gọi về → rỗng", () => {
    expect(clearedWhileResending([branch(1, 3, "CLEARED"), branch(2, 3, "AMEND_RECALLED"), branch(3, 3, "POST_EDITING")])).toEqual([1, 3]);
    expect(clearedWhileResending([branch(1, 2, "CLEARED"), branch(2, 2, "DECLARED")])).toEqual([]);
    expect(clearedWhileResending([branch(1, 2, "RECALLED"), branch(2, 2, "RECALLED")])).toEqual([]);
  });
});

describe("problemOf / anyInProgress", () => {
  it("problemOf theo summary", () => {
    const s = submissionOf([branch(1, 3, "CLEARED"), branch(2, 3, "REJECTED"), branch(3, 3, "NOT_SENT", { state: "SEND_FAILED" })]);
    expect([1, 2, 3].map((n) => problemOf(s, n))).toEqual([null, "REJECTED", "SEND_FAILED"]);
  });
  it("hỏi lại khi bất kỳ tờ nào đang chờ", () => {
    const idle = submissionOf([branch(1, 2, "PRE_DECLARED"), branch(2, 2, "PRE_DECLARED")]);
    expect(anyInProgress(idle)).toBe(false);
    expect(anyInProgress(submissionOf([branch(1, 2, "PRE_DECLARED"), branch(2, 2, "PRE_DECLARED", { inProgress: true })]))).toBe(true);
    expect(anyInProgress({ ...idle, inProgress: true, branches: [] })).toBe(true);
  });
});

describe("postSheet (tờ mở ở bước 7)", () => {
  const sheets = [branch(1, 3, "PRE_DECLARED"), branch(2, 3, "CLEARED"), branch(3, 3, "POST_EDITING")];
  it("?branch= hợp lệ → tờ đó; vắng / ngoài khoảng → tờ đang sửa sau thông quan, rồi tờ đã thông quan, rồi tờ 1", () => {
    expect(postSheet(sheets, "2")).toBe(2);
    expect(postSheet(sheets, null)).toBe(3);
    expect(postSheet(sheets, "9")).toBe(3);
    expect(postSheet([branch(1, 2, "PRE_DECLARED"), branch(2, 2, "CLEARED")], "abc")).toBe(2);
    expect(postSheet([branch(1, 1, "PRE_DECLARED")], null)).toBe(1);
  });
});

describe("khai chính thức (IDC/IDE) chờ tờ trước khai tạm xong", () => {
  it("declareWaitingOn: tờ PRE_DECLARED chờ tờ trước gần nhất còn chờ gửi nội dung; tờ trước đã khai tạm / thông quan → không chờ; lô một tờ / tờ đang gửi → không chờ", () => {
    expect(declareWaitingOn([branch(1, 3, "RECALLED"), branch(2, 3, "PRE_DECLARED"), branch(3, 3, "PRE_DECLARED")], 2)).toBe(1);
    expect(declareWaitingOn([branch(1, 3, "RECALLED"), branch(2, 3, "PRE_DECLARED"), branch(3, 3, "PRE_DECLARED")], 3)).toBe(1);
    expect(declareWaitingOn([branch(1, 3, "AMEND_RECALLED"), branch(2, 3, "AMEND_PRE_DECLARED"), branch(3, 3, "AMEND_PRE_DECLARED")], 2)).toBe(1);
    expect(declareWaitingOn([branch(1, 2, "PRE_DECLARED"), branch(2, 2, "PRE_DECLARED")], 2)).toBeNull();
    expect(declareWaitingOn([branch(1, 2, "CLEARED"), branch(2, 2, "PRE_DECLARED")], 2)).toBeNull();
    expect(declareWaitingOn([branch(1, 1, "PRE_DECLARED")], 1)).toBeNull();
    const sending = branch(2, 2, "PRE_DECLARED", { pipeline: pipelineFor("PRE_DECLARED", ["IDC"]).map((r) => (r.op === "IDC" ? { ...r, status: "SENDING" as const } : r)) });
    expect(declareWaitingOn([branch(1, 2, "RECALLED"), sending], 2)).toBeNull();
  });
  it("orderLocked: IDC/IDE/EDC/EDE bấm được thành khóa với SHEET_ORDER_DECLARE; IDA vẫn dùng SHEET_ORDER; nghiệp vụ khác giữ nguyên", () => {
    const rows = pipelineFor("PRE_DECLARED", ["IDC", "IDB"]);
    const locked = orderLocked(rows, 2, null, 1);
    expect(locked.find((r) => r.op === "IDC")).toMatchObject({ enabled: false, reasonCode: "SHEET_ORDER_DECLARE", reasonParams: { sheet: 2, waitFor: 1 }, reason: "Tờ 2: chờ tờ 1 khai tạm xong trước khi khai chính thức" });
    expect(locked.find((r) => r.op === "IDB")).toEqual(rows.find((r) => r.op === "IDB"));
    expect(orderLocked(rows, 2, null, null)).toBe(rows);
    const mixed = orderLocked(pipelineFor("RECALLED", ["IDA", "IDC"]), 3, 2, 1);
    expect(mixed.find((r) => r.op === "IDA")).toMatchObject({ reasonCode: "SHEET_ORDER", reasonParams: { sheet: 3, waitFor: 2 } });
    expect(mixed.find((r) => r.op === "IDC")).toMatchObject({ reasonCode: "SHEET_ORDER_DECLARE", reasonParams: { sheet: 3, waitFor: 1 } });
  });
});

describe("canDeclareAll", () => {
  const pre = (no: number, of: number) => branch(no, of, "PRE_DECLARED");
  it("lô nhiều tờ, mọi tờ đã khai tạm → ok, pending = số tờ chờ khai chính thức", () => {
    expect(canDeclareAll([pre(1, 3), pre(2, 3), pre(3, 3)])).toEqual({ ok: true, pending: 3 });
    expect(canDeclareAll([branch(1, 3, "CLEARED"), pre(2, 3), branch(3, 3, "AMEND_PRE_DECLARED")])).toEqual({ ok: true, pending: 2 });
  });
  it("lô một tờ → không ok", () => {
    expect(canDeclareAll([pre(1, 1)])).toEqual({ ok: false, pending: 1 });
  });
  it("còn tờ chờ gửi nội dung (NOT_SENT / RECALLED / AMEND_RECALLED) → không ok", () => {
    expect(canDeclareAll([branch(1, 3, "RECALLED"), pre(2, 3), pre(3, 3)]).ok).toBe(false);
    expect(canDeclareAll([pre(1, 3), pre(2, 3), branch(3, 3, "NOT_SENT")]).ok).toBe(false);
    expect(canDeclareAll([pre(1, 3), pre(2, 3), branch(3, 3, "AMEND_RECALLED")]).ok).toBe(false);
  });
  it("không tờ nào chờ khai chính thức → không ok", () => {
    expect(canDeclareAll([branch(1, 2, "CLEARED"), branch(2, 2, "CLEARED")])).toEqual({ ok: false, pending: 0 });
  });
  it("có tờ đang gửi → không ok", () => {
    const sending = pipelineFor("PRE_DECLARED").map((r) => (r.op === "IDC" ? { ...r, status: "SENDING" as const } : r));
    expect(canDeclareAll([pre(1, 2), branch(2, 2, "PRE_DECLARED", { pipeline: sending })]).ok).toBe(false);
  });
});

describe("recallProgress", () => {
  const recallRow = (op: "IDB" | "IDD", status: "WAITING" | "SENDING" | "NOT_SENT", enabled = false) =>
    ({ op, label: "Gọi về", status, phase: "DECLARE" as const, enabled, action: "SEND" as const });
  it("không có lệnh gọi về đang chạy → null", () => {
    expect(recallProgress([branch(1, 2, "PRE_DECLARED"), branch(2, 2, "PRE_DECLARED")])).toBeNull();
    expect(recallProgress([branch(1, 2, "RECALLED"), branch(2, 2, "RECALLED")])).toBeNull();
  });
  it("tờ 1 đã gọi về, tờ 2 đang gửi IDB → 1/2", () => {
    const sending = [...pipelineFor("PRE_DECLARED"), recallRow("IDB", "SENDING")];
    expect(recallProgress([branch(1, 3, "RECALLED"), branch(2, 3, "PRE_DECLARED", { pipeline: sending }), branch(3, 3, "CLEARED")])).toEqual({ done: 1, total: 2 });
  });
  it("tờ sau còn bấm được gọi về (chờ nối tiếp) tính vào total; IDD cũng tính", () => {
    const sending = [...pipelineFor("AMEND_PRE_DECLARED"), recallRow("IDD", "WAITING")];
    const pending = [...pipelineFor("PRE_DECLARED"), recallRow("IDB", "NOT_SENT", true)];
    expect(recallProgress([branch(1, 3, "AMEND_PRE_DECLARED", { pipeline: sending }), branch(2, 3, "PRE_DECLARED", { pipeline: pending }), branch(3, 3, "AMEND_RECALLED")])).toEqual({ done: 1, total: 3 });
  });
});

describe("recalled notice", () => {
  it("mã hóa / giải mã tất cả và danh sách tờ", async () => {
    const { encodeRecalled, parseRecalled } = await import("./branch-sheets");
    expect(encodeRecalled({ scope: "all", count: 3 })).toBe("all:3");
    expect(encodeRecalled({ scope: "sheets", sheets: [3, 2] })).toBe("2,3");
    expect(parseRecalled("all:3")).toEqual({ scope: "all", count: 3 });
    expect(parseRecalled("2,3")).toEqual({ scope: "sheets", sheets: [2, 3] });
    expect(parseRecalled(null)).toBeNull();
    expect(parseRecalled("x")).toBeNull();
    expect(parseRecalled("all:0")).toBeNull();
  });
});
