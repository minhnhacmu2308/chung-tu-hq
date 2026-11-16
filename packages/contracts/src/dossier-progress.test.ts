import { describe, expect, it } from "vitest";
import type { CustomsChannel, DossierStatus } from "./common.js";
import type { SubmissionState } from "./api/customs.js";
import type { CustomsStage } from "./customs-flow.js";
import type { SheetBrief } from "./dto/dossier.js";
import { dossierProgressOf, sheetStatusOf } from "./dossier-progress.js";

let n = 0;
const sh = (stage: CustomsStage, o: Partial<{ state: SubmissionState; channel: CustomsChannel | null; amendments: number; postAmendments: number }> = {}): SheetBrief =>
  ({ no: ++n, stage, state: "DECLARED", channel: null, amendments: 0, postAmendments: 0, ...o });
const prog = (status: DossierStatus, sheets: SheetBrief[]) => dossierProgressOf(status, sheets);

describe("sheetStatusOf", () => {
  it("sheet_maps_each_stage", () => {
    const t = (s: SheetBrief) => sheetStatusOf(s);
    expect(t(sh("NOT_SENT"))).toMatchObject({ declaration: "NOT_DECLARED", cleared: false, sub: null });
    expect(t(sh("PRE_DECLARED"))).toMatchObject({ declaration: "PRE_DECLARED", sub: null });
    expect(t(sh("RECALLED"))).toMatchObject({ declaration: "PRE_DECLARED", sub: "RECALLING" });
    expect(t(sh("DECLARED"))).toMatchObject({ declaration: "DECLARED" });
    expect(t(sh("DECLARED", { amendments: 1 }))).toMatchObject({ declaration: "AMENDED" });
    expect(t(sh("AMEND_RECALLED"))).toMatchObject({ declaration: "AMEND_RECALLED" });
    expect(t(sh("AMEND_PRE_DECLARED"))).toMatchObject({ declaration: "AMEND_PRE_DECLARED" });
    expect(t(sh("CLEARED"))).toMatchObject({ declaration: "DECLARED", cleared: true });
    expect(t(sh("CLEARED", { amendments: 1, postAmendments: 0 }))).toMatchObject({ declaration: "AMENDED", cleared: true });
    expect(t(sh("CLEARED", { amendments: 1, postAmendments: 1 }))).toMatchObject({ declaration: "POST_AMENDED", cleared: true });
    expect(t(sh("POST_PRE_DECLARED"))).toMatchObject({ cleared: true, sub: "POST_EDITING" });
    expect(t(sh("POST_EDITING"))).toMatchObject({ cleared: true, sub: "POST_EDITING" });
    expect(t(sh("POST_RECALLED"))).toMatchObject({ cleared: true, sub: "POST_EDITING" });
    expect(t(sh("CANCELLED"))).toMatchObject({ declaration: "CANCELLED" });
    expect(t(sh("REJECTED"))).toMatchObject({ declaration: "REJECTED" });
    expect(t(sh("DECLARED", { state: "SEND_FAILED", channel: "RED" }))).toMatchObject({ sub: "SEND_FAILED", channel: "RED" });
  });
});

describe("dossierProgressOf", () => {
  it("progress_not_declared_sub_by_status", () => {
    expect(prog("DRAFT", [])).toMatchObject({ progress: "NOT_DECLARED", sub: "PROCESSING", done: 0, of: 1 });
    expect(prog("NEEDS_REVIEW", [])).toMatchObject({ progress: "NOT_DECLARED", sub: "NEEDS_REVIEW" });
    expect(prog("APPROVED", [])).toMatchObject({ progress: "NOT_DECLARED", sub: "APPROVED_WAITING" });
    expect(prog("SUBMITTED", [sh("NOT_SENT", { state: "APPROVED" })])).toMatchObject({ progress: "NOT_DECLARED", sub: "SENDING", flags: [] });
    expect(prog("SUBMITTED", [sh("NOT_SENT", { state: "SEND_FAILED" })])).toMatchObject({ progress: "NOT_DECLARED", sub: "SEND_FAILED", flags: ["SEND_FAILED"] });
  });
  it("progress_cleared_and_post", () => {
    expect(prog("CLEARED", [sh("CLEARED")])).toMatchObject({ progress: "CLEARED", channel: null, done: 1, of: 1 });
    expect(prog("CLEARED", [sh("CLEARED", { postAmendments: 1 })])).toMatchObject({ progress: "POST_AMENDED" });
    expect(prog("CLEARED", [sh("POST_EDITING")])).toMatchObject({ progress: "CLEARED", sub: "POST_EDITING" });
  });
  it("progress_channel_only_before_clearance", () => {
    expect(prog("SUBMITTED", [sh("DECLARED", { channel: "RED" })])).toMatchObject({ progress: "DECLARED", channel: "RED" });
    expect(prog("SUBMITTED", [sh("DECLARED", { channel: "GREEN" }), sh("DECLARED", { channel: "RED" })])).toMatchObject({ progress: "DECLARED", channel: "RED", done: 2, of: 2 });
    expect(prog("CLEARED", [sh("CLEARED", { channel: "RED" })])).toMatchObject({ channel: null });
    expect(prog("SUBMITTED", [sh("PRE_DECLARED", { channel: "RED" })])).toMatchObject({ channel: null });
  });
  it("lot_slowest_with_count", () => {
    expect(prog("SUBMITTED", [sh("CLEARED"), sh("DECLARED"), sh("CLEARED")])).toMatchObject({ progress: "DECLARED", ahead: "CLEARED", done: 2, of: 3 });
    expect(prog("SUBMITTED", [sh("CLEARED"), sh("PRE_DECLARED")])).toMatchObject({ progress: "PRE_DECLARED", ahead: "CLEARED", done: 1, of: 2 });
    expect(prog("SUBMITTED", [sh("CLEARED"), sh("CANCELLED")])).toMatchObject({ progress: "CLEARED", ahead: null, done: 1, of: 1 });
    expect(prog("SUBMITTED", [sh("DECLARED"), sh("DECLARED")])).toMatchObject({ ahead: null, done: 2, of: 2 });
    expect(prog("SUBMITTED", [sh("DECLARED"), sh("RECALLED")])).toMatchObject({ progress: "PRE_DECLARED", sub: "RECALLING" });
    expect(prog("SUBMITTED", [sh("CLEARED"), sh("DECLARED", { state: "SEND_FAILED" })])).toMatchObject({ flags: ["SEND_FAILED"] });
  });
  it("all_cancelled_or_rejected", () => {
    expect(prog("SUBMITTED", [sh("CANCELLED")])).toMatchObject({ progress: "CANCELLED", done: 0, of: 1 });
    expect(prog("SUBMITTED", [sh("REJECTED")])).toMatchObject({ progress: "REJECTED", flags: ["REJECTED"] });
    expect(prog("SUBMITTED", [sh("REJECTED"), sh("CANCELLED")])).toMatchObject({ progress: "REJECTED" });
    expect(prog("SUBMITTED", [sh("REJECTED"), sh("DECLARED")])).toMatchObject({ progress: "DECLARED", flags: ["REJECTED"], of: 1 });
    expect(prog("CANCELLED", [sh("DECLARED")])).toMatchObject({ progress: "DOSSIER_CANCELLED" });
    expect(prog("CANCELLED", [sh("DECLARED", { state: "SEND_FAILED" }), sh("REJECTED")])).toMatchObject({ progress: "DOSSIER_CANCELLED", flags: [] });
  });
});

describe("final review fixes", () => {
  it("sheet_channel_only_when_channeled", () => {
    expect(sheetStatusOf(sh("CANCELLED", { channel: "RED" })).channel).toBeNull();
    expect(sheetStatusOf(sh("REJECTED", { channel: "YELLOW" })).channel).toBeNull();
    expect(sheetStatusOf(sh("RECALLED", { channel: "GREEN" })).channel).toBeNull();
    expect(sheetStatusOf(sh("PRE_DECLARED", { channel: "GREEN" })).channel).toBeNull();
    expect(sheetStatusOf(sh("DECLARED", { channel: "YELLOW" })).channel).toBe("YELLOW");
    expect(sheetStatusOf(sh("CLEARED", { channel: "GREEN" })).channel).toBe("GREEN");
  });
  it("progress_cleared_without_sheets", () => {
    expect(prog("CLEARED", [])).toMatchObject({ progress: "CLEARED", sub: null, done: 1, of: 1, flags: [] });
    expect(prog("SUBMITTED", [])).toMatchObject({ progress: "NOT_DECLARED", sub: "SENDING" });
  });
});
