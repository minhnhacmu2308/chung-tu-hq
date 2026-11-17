import { describe, expect, it, vi } from "vitest";
import { customsMessagesJob, type CustomsMessagesDeps } from "./customs-messages.js";

const pulled: string[] = [];
vi.mock("@kb/core/modules/identity", () => ({
  listActiveOrganizationIds: async () => ["org_a", "org_nocreds", "org_err", "org_c"],
  readVnaccsCredentials: async (_d: unknown, orgId: string) => (orgId === "org_nocreds" ? null : { userId: "u" }),
}));
vi.mock("@kb/core/modules/integration", () => ({
  pullCustomsMessages: async (_d: unknown, ctx: { orgId: string }) => {
    if (ctx.orgId === "org_err") throw new Error("db down");
    pulled.push(ctx.orgId);
    return ctx.orgId === "org_c" ? 2 : 0;
  },
}));

describe("customsMessagesJob", () => {
  it("kéo thông điệp cho mọi doanh nghiệp có tài khoản VNACCS, bỏ qua org chưa nhập tài khoản, lỗi một org không chặn org khác", async () => {
    const r = await customsMessagesJob({} as CustomsMessagesDeps);
    expect(pulled).toEqual(["org_a", "org_c"]);
    expect(r).toEqual({ orgs: 3, applied: 2 });
  });
});
