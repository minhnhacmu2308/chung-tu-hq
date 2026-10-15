import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import type { IdentityDeps } from "../ports.js";
import { FakeHasher, FakeSecretStore, FakeTaxRegistry, InMemoryRateLimiter, RecordingMailer } from "../test/fakes.js";
import { InMemoryIdentityUow } from "../test/in-memory-uow.js";
import { getVnaccsAccount, readVnaccsCredentials, removeVnaccsAccount, saveVnaccsAccount } from "../vnaccs-account.js";

const T0 = "2026-10-14T08:00:00.000Z";
const ctx = (role: Ctx["role"], orgId = "org_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId(`usr_${orgId}`), role });
const INPUT = { userId: "BI820001", password: "12345678", terminalId: "Z9999M", terminalAccessKey: "MOCKTERMINALKEY9" };
const expectErr = (r: { ok: boolean; error?: { code: string } }, code: string) => {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error?.code).toBe(code);
};

let uow: InMemoryIdentityUow;
let deps: IdentityDeps;
beforeEach(() => {
  uow = new InMemoryIdentityUow();
  const clock = fixedClock(T0);
  deps = {
    uow, plans: uow, hasher: new FakeHasher(), rateLimiter: new InMemoryRateLimiter(clock), mailer: new RecordingMailer(), taxRegistry: new FakeTaxRegistry(),
    clock, idGen: sequentialIdGen(), appUrl: "http://localhost:3100", secrets: new FakeSecretStore(),
  };
});

describe("tài khoản VNACCS", () => {
  it("chưa nhập → configured false", async () => {
    expect(unwrap(await getVnaccsAccount(deps, ctx("DECLARANT")))).toEqual({ configured: false, userId: null, terminalId: null, updatedAt: null });
  });

  it("ADMIN lưu → trả User ID/Terminal ID, KHÔNG trả mật khẩu/terminal key; DB chỉ giữ bản mã hóa", async () => {
    const saved = unwrap(await saveVnaccsAccount(deps, ctx("ADMIN"), INPUT));
    expect(saved).toEqual({ configured: true, userId: "BI820001", terminalId: "Z9999M", updatedAt: T0 });
    expect(JSON.stringify(saved)).not.toContain("12345678");
    expect(uow.data.secrets).toHaveLength(1);
    expect(uow.data.secrets[0]!.ciphertext).not.toContain("BI820001");
    expect(unwrap(await getVnaccsAccount(deps, ctx("VIEWER")))).toEqual(saved);
  });

  it("lưu lần hai ghi đè (một bản ghi mỗi org), readVnaccsCredentials giải mã đúng bản mới", async () => {
    unwrap(await saveVnaccsAccount(deps, ctx("OWNER"), INPUT));
    unwrap(await saveVnaccsAccount(deps, ctx("OWNER"), { ...INPUT, password: "moi-12345" }));
    expect(uow.data.secrets).toHaveLength(1);
    expect(await readVnaccsCredentials(deps, "org_a")).toEqual({ ...INPUT, password: "moi-12345" });
  });

  it("cắt khoảng trắng User ID/Terminal; thiếu trường → VALIDATION, không ghi", async () => {
    expect(unwrap(await saveVnaccsAccount(deps, ctx("ADMIN"), { ...INPUT, userId: "  BI820001 " })).userId).toBe("BI820001");
    expectErr(await saveVnaccsAccount(deps, ctx("ADMIN"), { ...INPUT, terminalAccessKey: "" }), "VALIDATION");
    expect((await readVnaccsCredentials(deps, "org_a"))?.terminalAccessKey).toBe(INPUT.terminalAccessKey);
  });

  it.each(["DECLARANT", "APPROVER", "VIEWER"] as const)("%s không lưu/gỡ được → FORBIDDEN", async (role) => {
    expectErr(await saveVnaccsAccount(deps, ctx(role), INPUT), "FORBIDDEN");
    unwrap(await saveVnaccsAccount(deps, ctx("ADMIN"), INPUT));
    expectErr(await removeVnaccsAccount(deps, ctx(role)), "FORBIDDEN");
    expect(uow.data.secrets).toHaveLength(1);
  });

  it("gỡ → configured false, gateway không còn tài khoản", async () => {
    unwrap(await saveVnaccsAccount(deps, ctx("ADMIN"), INPUT));
    expect(unwrap(await removeVnaccsAccount(deps, ctx("ADMIN"))).configured).toBe(false);
    expect(await readVnaccsCredentials(deps, "org_a")).toBeNull();
  });

  it("org B không thấy và không gỡ được tài khoản của org A", async () => {
    unwrap(await saveVnaccsAccount(deps, ctx("ADMIN", "org_a"), INPUT));
    expect(unwrap(await getVnaccsAccount(deps, ctx("OWNER", "org_b"))).configured).toBe(false);
    unwrap(await removeVnaccsAccount(deps, ctx("OWNER", "org_b")));
    expect(await readVnaccsCredentials(deps, "org_b")).toBeNull();
    expect(await readVnaccsCredentials(deps, "org_a")).toEqual(INPUT);
  });

  it("máy chủ thiếu khóa mã hóa → INTEGRATION_NOT_CONFIGURED", async () => {
    const { secrets: _s, ...noSecrets } = deps;
    expectErr(await saveVnaccsAccount(noSecrets, ctx("ADMIN"), INPUT), "INTEGRATION_NOT_CONFIGURED");
    expect(await readVnaccsCredentials(noSecrets, "org_a")).toBeNull();
  });
});
