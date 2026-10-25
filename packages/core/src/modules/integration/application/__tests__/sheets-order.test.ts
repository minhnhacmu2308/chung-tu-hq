// Thứ tự truyền theo tờ cho khai chính thức (IDC/IDE/EDC/EDE) và hiển thị khóa của getSubmission (lô nhiều tờ).
import { beforeEach, describe, expect, it } from "vitest";
import { unwrap } from "../../../../shared/result.js";
import type { CustomsDeps } from "../customs-ports.js";
import { getSubmission } from "../get-submission.js";
import { performOperation } from "../perform-operation.js";
import { approver, D, declarant, lines, lot as lotOf, makeHarness, other, seed as seedOf, viewer, type FakeDeclarations, type FakeDossiers, type Harness } from "./_sheets-harness.js";
import type { InMemoryCustomsUow } from "../test/in-memory-customs-uow.js";

let h: Harness;
let uow: InMemoryCustomsUow;
let decls: FakeDeclarations;
let dossiers: FakeDossiers;
let deps: CustomsDeps;
beforeEach(() => {
  h = makeHarness();
  ({ uow, decls, dossiers, deps } = h);
});
const lot = (...stages: string[]) => lotOf(h, ...stages);
const seed = (branch: number, stage: string) => seedOf(h, branch, stage);
const orderErr = (reason: string, sheet: number, waitFor: number) => ({ ok: false, error: { code: "INVALID_STATE", reason, params: { sheet, waitFor } } });

describe("khai chính thức (IDC/IDE) theo thứ tự tờ – SHEET_ORDER_DECLARE (quyết định D2)", () => {
  it("tờ 1 RECALLED, tờ 2 PRE_DECLARED → IDC tờ 2 bị chặn (chờ tờ 1), không tạo outbox", async () => {
    lot("RECALLED", "PRE_DECLARED", "PRE_DECLARED");
    expect(await performOperation(deps, declarant, D, "IDC", 2)).toMatchObject(orderErr("SHEET_ORDER_DECLARE", 2, 1));
    expect(await performOperation(deps, declarant, D, "IDC", 3)).toMatchObject(orderErr("SHEET_ORDER_DECLARE", 3, 1));
    expect(uow.data.outbox).toHaveLength(0);
  });
  it("tờ 1 AMEND_RECALLED, tờ 2 AMEND_PRE_DECLARED → IDE tờ 2 bị chặn", async () => {
    lot("AMEND_RECALLED", "AMEND_PRE_DECLARED");
    expect(await performOperation(deps, declarant, D, "IDE", 2)).toMatchObject(orderErr("SHEET_ORDER_DECLARE", 2, 1));
    expect(uow.data.outbox).toHaveLength(0);
  });
  it("D2: tờ 1 PRE_DECLARED (chưa IDC), tờ 2 PRE_DECLARED → IDC tờ 2 gửi được", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    unwrap(await performOperation(deps, declarant, D, "IDC", 2));
    expect(uow.data.outbox.map((o) => [o.branch, o.operation])).toEqual([[2, "IDC"]]);
  });
  it("tờ 1 CLEARED / REJECTED (miễn), tờ 2 PRE_DECLARED → IDC tờ 2 gửi được", async () => {
    lot("CLEARED", "PRE_DECLARED");
    unwrap(await performOperation(deps, declarant, D, "IDC", 2));
    expect(uow.data.outbox).toHaveLength(1);
  });
  it("lô một tờ → IDC như cũ", async () => {
    decls.items = lines(10);
    decls.status = "SUBMITTED";
    seed(1, "PRE_DECLARED");
    unwrap(await performOperation(deps, declarant, D, "IDC", 1));
    expect(uow.data.outbox.map((o) => [o.branch, o.operation, o.idempotencyKey])).toEqual([[1, "IDC", `${D}:IDC:n1`]]);
  });
});

describe("getSubmission – dòng nghiệp vụ của tờ đang chờ khóa theo thứ tự tờ", () => {
  const pipelineOf = async (no: number) => unwrap(await getSubmission(deps, declarant, D)).branches[no - 1]!.pipeline;
  it("tờ 1 RECALLED: dòng IDC tờ 2 enabled=false, reasonCode SHEET_ORDER_DECLARE; tờ 1 không bị khóa", async () => {
    lot("RECALLED", "PRE_DECLARED");
    expect((await pipelineOf(2)).find((r) => r.op === "IDC")).toMatchObject({ enabled: false, reasonCode: "SHEET_ORDER_DECLARE", reasonParams: { sheet: 2, waitFor: 1 } });
    expect((await pipelineOf(1)).find((r) => r.op === "IDA")).toMatchObject({ enabled: true });
  });
  it("tờ 1 RECALLED, tờ 2 RECALLED, tờ khai đã duyệt lại: dòng IDA tờ 2 enabled=false, reasonCode SHEET_ORDER", async () => {
    lot("RECALLED", "RECALLED");
    decls.status = "APPROVED";
    expect((await pipelineOf(2)).find((r) => r.op === "IDA")).toMatchObject({ enabled: false, reasonCode: "SHEET_ORDER", reasonParams: { sheet: 2, waitFor: 1 } });
    expect((await pipelineOf(1)).find((r) => r.op === "IDA")).toMatchObject({ enabled: true });
  });
  it("tờ 1 PRE_DECLARED: IDC tờ 2 bấm được", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED");
    expect((await pipelineOf(2)).find((r) => r.op === "IDC")).toMatchObject({ enabled: true });
  });
});
