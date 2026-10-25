import { describe, expect, it } from "vitest";
import { branch, pipelineFor, submissionOf } from "@/test/branch-submission";
import { anyInProgress, postSheet, problemOf, sheetsOf, sheetView, waitingOn } from "./branch-sheets";

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
