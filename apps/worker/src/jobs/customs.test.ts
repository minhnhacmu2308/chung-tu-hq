import { describe, expect, it } from "vitest";
import { CustomsPollPayload } from "./customs.js";

describe("customs-poll payload", () => {
  it("giữ `branch` của tờ khai nhánh; job cũ không có branch → vắng (nhánh 1); branch sai → lỗi", () => {
    const base = { orgId: "org_a", userId: "usr_a", dossierId: "dos_1", attempt: 1 };
    expect(CustomsPollPayload.parse({ ...base, branch: 2 })).toEqual({ ...base, branch: 2 });
    expect(CustomsPollPayload.parse(base)).toEqual(base);
    expect(CustomsPollPayload.safeParse({ ...base, branch: 0 }).success).toBe(false);
  });
});

describe("kvgs-poll payload", () => {
  it("chỉ nhận CONT_LIST (KVGS là một lời gọi đồng bộ – không poll), n nguyên dương; sai → lỗi", async () => {
    const { KvgsPollPayload } = await import("./customs.js");
    const base = { orgId: "org_a", userId: "usr_a", kind: "CONT_LIST", id: "cl_1", n: 1 };
    expect(KvgsPollPayload.parse(base)).toEqual(base);
    expect(KvgsPollPayload.safeParse({ ...base, kind: "KVGS" }).success).toBe(false);
    expect(KvgsPollPayload.safeParse({ ...base, kind: "HYS" }).success).toBe(false);
    expect(KvgsPollPayload.safeParse({ ...base, n: 0 }).success).toBe(false);
  });
});

describe("identifier-batch-done payload", () => {
  it("cần orgId + batchId không rỗng", async () => {
    const { IdentifierBatchDonePayload } = await import("./customs.js");
    const base = { orgId: "org_a", batchId: "11111111-1111-4111-8111-111111111111" };
    expect(IdentifierBatchDonePayload.parse(base)).toEqual(base);
    expect(IdentifierBatchDonePayload.safeParse({ ...base, batchId: "" }).success).toBe(false);
    expect(IdentifierBatchDonePayload.safeParse({ batchId: base.batchId }).success).toBe(false);
  });
});

describe("identifier-send / identifier-poll payload", () => {
  it("attempt tùy chọn (job xếp trước khi có trường vẫn parse), nếu có phải nguyên dương", async () => {
    const { IdentifierSendPayload, IdentifierPollPayload } = await import("./customs.js");
    const base = { orgId: "org_a", userId: "usr_a", id: "idn_1" };
    expect(IdentifierSendPayload.parse(base)).toEqual(base);
    expect(IdentifierPollPayload.parse({ ...base, attempt: 2, n: 3 })).toEqual({ ...base, attempt: 2, n: 3 });
    expect(IdentifierSendPayload.safeParse({ ...base, attempt: 0 }).success).toBe(false);
  });
});
