import { beforeEach, describe, expect, it } from "vitest";
import { requestKvgsFetch } from "../kvgs-fetch.js";
import { D, declarant, makeHarness, other, seed, viewer, type Harness } from "./_sheets-harness.js";
import type { ContainerListRecord } from "../customs-ports.js";
import { getSubmission } from "../get-submission.js";

let h: Harness;
const accepted = (): ContainerListRecord => ({ id: "cl_1", orgId: "org_a", dossierId: D, branch: 1, attempt: 1, rows: [], status: "ACCEPTED", refId: null, receiptNo: null, receiptDate: null, errors: null, sentRows: null, sentBy: null, sentAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
beforeEach(() => {
  h = makeHarness();
});

describe("requestKvgsFetch", () => {
  it("chưa thông quan → KVGS_REQUIRES_CLEARANCE", async () => {
    seed(h, 1, "DECLARED");
    expect(await requestKvgsFetch(h.deps, declarant, D, 1)).toMatchObject({ ok: false, error: { reason: "KVGS_REQUIRES_CLEARANCE" } });
  });
  it("NK container đã thông quan nhưng danh sách chưa chấp nhận → KVGS_REQUIRES_CONTAINER_LIST", async () => {
    seed(h, 1, "CLEARED");
    expect(await requestKvgsFetch(h.deps, declarant, D, 1)).toMatchObject({ ok: false, error: { reason: "KVGS_REQUIRES_CONTAINER_LIST" } });
  });
  it("đủ điều kiện → bản SENDING, outbox kvgs:<id> (không gửi loại hàng – API quyết), job; gọi lần 2 → KVGS_ALREADY_SENDING, một outbox", async () => {
    seed(h, 1, "CLEARED");
    h.uow.data.containerLists.push(accepted());
    const r = await requestKvgsFetch(h.deps, declarant, D, 1);
    expect(r).toMatchObject({ ok: true, value: { kvgs: { status: "SENDING" } } });
    const k = h.uow.data.kvgs[0]!;
    expect(h.uow.data.outbox).toEqual([expect.objectContaining({ operation: "KVGS", idempotencyKey: `kvgs:${k.id}`, payload: { kvgsId: k.id } })]);
    expect(h.queue.jobs).toHaveLength(1);
    expect(await requestKvgsFetch(h.deps, declarant, D, 1)).toMatchObject({ ok: false, error: { reason: "KVGS_ALREADY_SENDING" } });
    expect(h.uow.data.outbox).toHaveLength(1);
  });
  it("hai yêu cầu song song: chỉ một bản SENDING, một outbox, một job; bản còn lại KVGS_ALREADY_SENDING", async () => {
    seed(h, 1, "CLEARED");
    h.uow.data.containerLists.push(accepted());
    const rs = await Promise.all([requestKvgsFetch(h.deps, declarant, D, 1), requestKvgsFetch(h.deps, declarant, D, 1)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)).toMatchObject({ ok: false, error: { reason: "KVGS_ALREADY_SENDING" } });
    expect(h.uow.data.kvgs.filter((k) => k.status === "SENDING")).toHaveLength(1);
    expect(h.uow.data.outbox).toHaveLength(1);
    expect(h.queue.jobs).toHaveLength(1);
  });
  it("hàng không container → không đòi danh sách container", async () => {
    h.dossiers.rows[0]!.transportMode = "SEA_BULK";
    seed(h, 1, "CLEARED");
    expect((await requestKvgsFetch(h.deps, declarant, D, 1)).ok).toBe(true);
    expect(h.uow.data.outbox[0]!.payload).toEqual({ kvgsId: expect.any(String) });
  });
  it("VIEWER → FORBIDDEN; org khác → NOT_FOUND", async () => {
    seed(h, 1, "CLEARED");
    expect(await requestKvgsFetch(h.deps, viewer, D, 1)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await requestKvgsFetch(h.deps, other, D, 1)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("màn Truyền: KVGS mở theo trạng thái thật của danh sách container", async () => {
    seed(h, 1, "CLEARED");
    const kv = async () => {
      const r = await getSubmission(h.deps, declarant, D);
      if (!r.ok) throw new Error("getSubmission");
      return r.value.pipeline.find((p) => p.op === "KVGS")!.enabled;
    };
    expect(await kv()).toBe(false);
    h.uow.data.containerLists.push(accepted());
    expect(await kv()).toBe(true);
  });
});
