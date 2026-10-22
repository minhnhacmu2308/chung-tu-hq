import type { MailboxDeps } from "@kb/core/modules/mailbox";
import { describe, expect, it } from "vitest";
import { mailboxSyncJob } from "./mailbox-sync.js";

describe("mailboxSyncJob", () => {
  it("payload sai hình dạng → lỗi Zod trước khi chạm hạ tầng", async () => {
    await expect(mailboxSyncJob({} as MailboxDeps, { orgId: "org_a" })).rejects.toThrow();
  });
  it("hộp thư không còn (đã gỡ) → bỏ qua, không lỗi", async () => {
    const deps = { uow: { asOrg: async (_c: unknown, fn: (r: unknown) => unknown) => fn({ connections: { get: async () => null } }) }, cipher: null } as unknown as MailboxDeps;
    expect(await mailboxSyncJob(deps, { orgId: "org_a", connectionId: "mcn_1" })).toBe("mcn_1: ERROR, 0 email mới");
  });
});
