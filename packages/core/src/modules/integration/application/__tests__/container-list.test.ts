import { beforeEach, describe, expect, it } from "vitest";
import { getKvgs } from "../kvgs.js";
import { refillContainerList, saveContainerList, sendContainerList } from "../container-list.js";
import { D, declarant, makeHarness, ORG, other, seed, viewer, type Harness } from "./_sheets-harness.js";

let h: Harness;
let audits: { key: string; oldValue: string; newValue: string; source: string }[];
const row = (containerNo: string, sealNo = "S1", billNo = "HBL1") => ({ billNo, containerNo, sealNo, note: "", source: "USER" as const });
const val = <T>(r: { ok: boolean; value?: T; error?: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value as T;
};
beforeEach(() => {
  h = makeHarness();
  // field_audit ghi qua repo của transaction (uow in-memory), không qua port riêng.
  audits = h.uow.fieldAudit.rows;
  h.deps.containerSources = async () => [{ id: "doc_bl", kind: "BILL_OF_LADING", billNo: "HBL1", containers: [{ no: "fbiu 580242-9", sealNo: null }, { no: "CSQU 305438-3", sealNo: "SL2" }] }];
  seed(h, 1, "DECLARED");
});

describe("getKvgs", () => {
  it("lần đầu NK container: tạo DRAFT từ OCR, số đã chuẩn hóa; gọi lại không tạo thêm", async () => {
    const v = val(await getKvgs(h.deps, declarant, D, 1));
    expect(v.applies).toEqual({ containerList: true, kvgs: true });
    expect(v.containerList).toMatchObject({ attempt: 1, status: "DRAFT" });
    expect(v.containerList!.rows.map((r) => r.containerNo)).toEqual(["FBIU5802429", "CSQU3054383"]);
    await getKvgs(h.deps, declarant, D, 1);
    expect(h.uow.data.containerLists).toHaveLength(1);
    expect(v.header).toMatchObject({ declarationNo: "104000000001", companyName: "AN PHÁT", customsOffice: "03CE", typeCode: "A11" });
  });
  it("VIEWER xem được nhưng không lưu bản nháp", async () => {
    const v = val(await getKvgs(h.deps, viewer, D, 1));
    expect(v.containerList!.rows).toHaveLength(2);
    expect(h.uow.data.containerLists).toHaveLength(0);
  });
  it("hai lần xem đầu đồng thời: insert đụng unique → đọc lại bản của bên kia, không lỗi", async () => {
    const real = h.uow;
    let raced = false;
    h.deps.uow = { asOrg: (c, fn) => real.asOrg(c, (r) => fn({ ...r, containerLists: { ...r.containerLists, insert: async (row) => {
      if (raced) return r.containerLists.insert(row);
      raced = true;
      await r.containerLists.insert({ ...row, id: "cls_other" });
      throw new Error("duplicate key value violates unique constraint container_lists_dossier_branch_attempt_uq");
    } } })) };
    const v = val(await getKvgs(h.deps, declarant, D, 1));
    expect(v.containerList).toMatchObject({ attempt: 1, status: "DRAFT" });
    expect(h.uow.data.containerLists.map((l) => l.id)).toEqual(["cls_other"]);
  });
  it("org khác → NOT_FOUND", async () => {
    expect(await getKvgs(h.deps, other, D, 1)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("saveContainerList / refill", () => {
  it("ghi audit đúng số ô đổi (khóa cont:<nhánh>:<dòng>:<trường>)", async () => {
    await getKvgs(h.deps, declarant, D, 1);
    const v = val(await saveContainerList(h.deps, declarant, D, 1, { rows: [row("FBIU5802429", "NEW", "HBL1"), row("csqu 3054383", "SL2", "HBL1")] }));
    expect(v.containerList!.rows[1]!.containerNo).toBe("CSQU3054383");
    expect(audits).toMatchObject([{ key: "cont:1:1:sealNo", oldValue: "", newValue: "NEW", source: "CONT_LIST_EDIT" }]);
  });
  it("refill ghi đè bằng OCR và audit", async () => {
    await getKvgs(h.deps, declarant, D, 1);
    await saveContainerList(h.deps, declarant, D, 1, { rows: [row("AAAU0000001")] });
    audits.length = 0;
    const v = val(await refillContainerList(h.deps, declarant, D, 1));
    expect(v.containerList!.rows.map((r) => r.containerNo)).toEqual(["FBIU5802429", "CSQU3054383"]);
    expect(audits.length).toBeGreaterThan(0);
  });
  it("đang SENDING → CONT_LIST_LOCKED; ACCEPTED → lần khai mới attempt 2", async () => {
    await getKvgs(h.deps, declarant, D, 1);
    h.uow.data.containerLists[0]!.status = "SENDING";
    expect(await saveContainerList(h.deps, declarant, D, 1, { rows: [row("AAAU0000001")] })).toMatchObject({ ok: false, error: { reason: "CONT_LIST_LOCKED" } });
    h.uow.data.containerLists[0]!.status = "ACCEPTED";
    const v = val(await saveContainerList(h.deps, declarant, D, 1, { rows: [row("AAAU0000001")] }));
    expect(v.containerList).toMatchObject({ attempt: 2, status: "DRAFT" });
    expect(h.uow.data.containerLists).toHaveLength(2);
  });
  it("VIEWER → FORBIDDEN; org khác → NOT_FOUND", async () => {
    expect(await saveContainerList(h.deps, viewer, D, 1, { rows: [] })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await saveContainerList(h.deps, other, D, 1, { rows: [] })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("sendContainerList", () => {
  const valid = async () => {
    await getKvgs(h.deps, declarant, D, 1);
    await saveContainerList(h.deps, declarant, D, 1, { rows: [row("FBIU5802429"), row("CSQU3054383", "SL2")] });
  };
  it("hợp lệ → SENDING, sentRows, một outbox cont:<id>:a1, job customs-send", async () => {
    await valid();
    const v = val(await sendContainerList(h.deps, declarant, D, 1));
    expect(v.containerList).toMatchObject({ status: "SENDING", attempt: 1 });
    const l = h.uow.data.containerLists[0]!;
    expect(l.sentRows).toHaveLength(2);
    expect(h.uow.data.outbox).toEqual([expect.objectContaining({ operation: "CONT_LIST", idempotencyKey: `cont:${l.id}:a1`, branch: 1, status: "PENDING" })]);
    expect(h.queue.jobs).toEqual([expect.objectContaining({ name: "customs-send", payload: expect.objectContaining({ orgId: ORG }) })]);
  });
  it("gửi hai lần → lần 2 KVGS_ALREADY_SENDING, chỉ 1 outbox", async () => {
    await valid();
    val(await sendContainerList(h.deps, declarant, D, 1));
    expect(await sendContainerList(h.deps, declarant, D, 1)).toMatchObject({ ok: false, error: { reason: "KVGS_ALREADY_SENDING" } });
    expect(h.uow.data.outbox).toHaveLength(1);
    expect(h.queue.jobs).toHaveLength(1);
  });
  it("seal rỗng → CONT_LIST_INVALID kèm issues; không outbox", async () => {
    await getKvgs(h.deps, declarant, D, 1);
    const r = await sendContainerList(h.deps, declarant, D, 1);
    expect(r).toMatchObject({ ok: false, error: { reason: "CONT_LIST_INVALID", details: { issues: expect.arrayContaining([expect.objectContaining({ row: 1, field: "sealNo", code: "REQUIRED" })]) } } });
    expect(h.uow.data.outbox).toHaveLength(0);
  });
  it("tờ khai chưa có số → CONT_LIST_REQUIRES_DECLARATION_NUMBER", async () => {
    h.uow.data.results.length = 0;
    expect(await sendContainerList(h.deps, declarant, D, 1)).toMatchObject({ ok: false, error: { reason: "CONT_LIST_REQUIRES_DECLARATION_NUMBER" } });
  });
  it("không phải NK container → CONT_LIST_NOT_APPLICABLE", async () => {
    h.dossiers.rows[0]!.transportMode = "AIR";
    expect(await sendContainerList(h.deps, declarant, D, 1)).toMatchObject({ ok: false, error: { reason: "CONT_LIST_NOT_APPLICABLE" } });
  });
  it("bị từ chối rồi gửi lại → lần khai mới attempt 2 (khóa outbox không trùng)", async () => {
    await valid();
    val(await sendContainerList(h.deps, declarant, D, 1));
    h.uow.data.containerLists[0]!.status = "REJECTED";
    h.uow.data.outbox[0]!.status = "SENT";
    const v = val(await sendContainerList(h.deps, declarant, D, 1));
    expect(v.containerList).toMatchObject({ attempt: 2, status: "SENDING" });
    expect(h.uow.data.outbox).toHaveLength(2);
  });
  it("VIEWER → FORBIDDEN; org khác → NOT_FOUND", async () => {
    expect(await sendContainerList(h.deps, viewer, D, 1)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await sendContainerList(h.deps, other, D, 1)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
