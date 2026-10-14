import { describe, expect, it } from "vitest";
import { asOrgId, asUserId } from "./ids.js";
import { requireRole, type Ctx } from "./ctx.js";

const ctx = (role: Ctx["role"]): Ctx => ({ orgId: asOrgId("org_a"), userId: asUserId("usr_a"), role });

describe("requireRole", () => {
  it("cho phép khi vai trò nằm trong danh sách", () => {
    expect(requireRole(ctx("APPROVER"), "APPROVER", "OWNER").ok).toBe(true);
  });
  it("OWNER luôn được phép", () => {
    expect(requireRole(ctx("OWNER"), "ADMIN").ok).toBe(true);
  });
  it("VIEWER bị từ chối với code FORBIDDEN", () => {
    const r = requireRole(ctx("VIEWER"), "DECLARANT");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
  });
});
