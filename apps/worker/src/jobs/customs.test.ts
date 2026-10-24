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
