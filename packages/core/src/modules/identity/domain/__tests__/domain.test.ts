import { describe, expect, it } from "vitest";
import { displayNameFromEmail, normalizeEmail } from "../email.js";
import { isPasswordAcceptable } from "../password.js";
import { canChangeRole, canDisable, canInvite, canManageOrg, canTransferOwnership } from "../role-rules.js";
import { SESSION_TTL_MS, sessionExpiry, shouldExtend, shouldTouch } from "../session-policy.js";
import { normalizeTaxCode } from "../tax-code.js";
import { hashToken, newToken } from "../token.js";

describe("email", () => {
  it("normalizeEmail trim + lowercase", () => expect(normalizeEmail("  A.B@X.VN ")).toBe("a.b@x.vn"));
  it("displayNameFromEmail: chau.le → Chau Le", () => expect(displayNameFromEmail("chau.le@anphat-demo.vn")).toBe("Chau Le"));
});

describe("tax-code", () => {
  it.each([
    ["0316789012", "0316789012"],
    ["0316 789 012-001", "0316789012001"],
  ])("%s → %s", (i, o) => expect(normalizeTaxCode(i)).toBe(o));
  it("9 số hoặc 11 số → null", () => {
    expect(normalizeTaxCode("031678901")).toBeNull();
    expect(normalizeTaxCode("03167890123")).toBeNull();
  });
});

describe("password", () => {
  it("≥ 8 ký tự mới chấp nhận", () => {
    expect(isPasswordAcceptable("1234567")).toBe(false);
    expect(isPasswordAcceptable("12345678")).toBe(true);
  });
});

describe("token", () => {
  it("raw khác hash, hash ổn định và không chứa raw", () => {
    const t = newToken(() => Buffer.alloc(32, 7));
    expect(t.raw).not.toBe(t.hash);
    expect(hashToken(t.raw)).toBe(t.hash);
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("session-policy", () => {
  const now = new Date("2026-10-13T00:00:00Z");
  it("hết hạn sau 30 ngày", () => expect(sessionExpiry(now).getTime() - now.getTime()).toBe(SESSION_TTL_MS));
  it("gia hạn khi còn < 15 ngày", () => {
    expect(shouldExtend({ expiresAt: new Date(now.getTime() + 10 * 86_400_000) }, now)).toBe(true);
    expect(shouldExtend({ expiresAt: new Date(now.getTime() + 20 * 86_400_000) }, now)).toBe(false);
  });
  it("ghi lần hoạt động tối đa mỗi phút, trừ khi cần gia hạn", () => {
    const far = new Date(now.getTime() + 20 * 86_400_000);
    expect(shouldTouch({ expiresAt: far, lastSeenAt: new Date(now.getTime() - 30_000) }, now)).toBe(false);
    expect(shouldTouch({ expiresAt: far, lastSeenAt: new Date(now.getTime() - 60_000) }, now)).toBe(true);
    expect(shouldTouch({ expiresAt: new Date(now.getTime() + 10 * 86_400_000), lastSeenAt: now }, now)).toBe(true);
  });
});

describe("role-rules", () => {
  it("ADMIN đổi DECLARANT → APPROVER được", () => expect(canChangeRole("ADMIN", { role: "DECLARANT", isSelf: false }, "APPROVER").ok).toBe(true));
  it("không đổi vai trò của OWNER", () => expect(canChangeRole("ADMIN", { role: "OWNER", isSelf: false }, "ADMIN").ok).toBe(false));
  it("không gán OWNER qua đổi vai trò", () => expect(canChangeRole("OWNER", { role: "ADMIN", isSelf: false }, "OWNER").ok).toBe(false));
  it("VIEWER/DECLARANT/APPROVER không được đổi vai trò người khác", () => {
    for (const r of ["VIEWER", "DECLARANT", "APPROVER"] as const) expect(canChangeRole(r, { role: "VIEWER", isSelf: false }, "DECLARANT").ok).toBe(false);
  });
  it("không tự hạ vai trò của mình", () => expect(canChangeRole("ADMIN", { role: "ADMIN", isSelf: true }, "VIEWER").ok).toBe(false));
  it("canDisable: không tự khóa, không khóa OWNER, ADMIN khóa người khác được", () => {
    expect(canDisable("ADMIN", { role: "DECLARANT", isSelf: true }).ok).toBe(false);
    expect(canDisable("ADMIN", { role: "OWNER", isSelf: false }).ok).toBe(false);
    expect(canDisable("ADMIN", { role: "DECLARANT", isSelf: false }).ok).toBe(true);
    expect(canDisable("APPROVER", { role: "DECLARANT", isSelf: false }).ok).toBe(false);
  });
  it("canInvite/canManageOrg: ADMIN và OWNER", () => {
    expect(canInvite("OWNER").ok).toBe(true);
    expect(canInvite("ADMIN").ok).toBe(true);
    expect(canInvite("DECLARANT").ok).toBe(false);
    expect(canManageOrg("VIEWER").ok).toBe(false);
  });
  it("canTransferOwnership: chỉ OWNER; người nhận đang hoạt động, không phải mình", () => {
    const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error?.code);
    expect(code(canTransferOwnership("OWNER", { role: "ADMIN", status: "ACTIVE", isSelf: false }))).toBe("OK");
    expect(code(canTransferOwnership("OWNER", { role: "VIEWER", status: "ACTIVE", isSelf: false }))).toBe("OK");
    expect(code(canTransferOwnership("ADMIN", { role: "DECLARANT", status: "ACTIVE", isSelf: false }))).toBe("FORBIDDEN");
    expect(code(canTransferOwnership("OWNER", { role: "OWNER", status: "ACTIVE", isSelf: true }))).toBe("FORBIDDEN");
    expect(code(canTransferOwnership("OWNER", { role: "DECLARANT", status: "INVITED", isSelf: false }))).toBe("INVALID_STATE");
    expect(code(canTransferOwnership("OWNER", { role: "DECLARANT", status: "DISABLED", isSelf: false }))).toBe("INVALID_STATE");
  });
});
