// Luồng identity chạy use case thật trên Postgres thật (RLS thật) – bắt lỗi "dùng sai ngữ cảnh withSystem/withUser/withCtx".
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { systemClock } from "../../../shared/clock.js";
import { sequentialIdGen } from "../../../shared/ids.js";
import { unwrap } from "../../../shared/result.js";
import { acceptInvite } from "../application/accept-invite.js";
import { approveJoinRequest } from "../application/approve-join-request.js";
import { changeMemberRole } from "../application/change-member-role.js";
import { getSession } from "../application/get-session.js";
import { inviteMember } from "../application/invite-member.js";
import { listJoinRequests } from "../application/list-join-requests.js";
import { listMembers } from "../application/list-members.js";
import { listNotifications } from "../application/list-notifications.js";
import { login } from "../application/login.js";
import { logout } from "../application/logout.js";
import type { IdentityDeps } from "../application/ports.js";
import { register } from "../application/register.js";
import { requestPasswordReset } from "../application/request-password-reset.js";
import { resetPassword } from "../application/reset-password.js";
import { FakeHasher, FakeTaxRegistry, InMemoryRateLimiter, RecordingMailer } from "../application/test/fakes.js";
import { verifyEmail } from "../application/verify-email.js";
import { DrizzlePlansReader } from "./drizzle-plans-reader.js";
import { DrizzleIdentityUow } from "./drizzle-uow.js";

let t: TestDb;
let db: Db;
let deps: IdentityDeps;
let mailer: RecordingMailer;
const META = { ip: "127.0.0.1" };
const tokenFrom = (text: string) => text.match(/token=([A-Za-z0-9_-]+)/)![1]!;

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl); // mật khẩu demo hash Argon2 thật → test này dùng FakeHasher nên tạo user riêng
  db = createDb(t.appUrl, { max: 3 });
  mailer = new RecordingMailer();
  deps = { uow: new DrizzleIdentityUow(db), plans: new DrizzlePlansReader(db), hasher: new FakeHasher(), rateLimiter: new InMemoryRateLimiter(systemClock), mailer, taxRegistry: new FakeTaxRegistry(), clock: systemClock, idGen: sequentialIdGen(), appUrl: "http://localhost:3100" };
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

describe("luồng identity trên Postgres thật", () => {
  it("đăng ký MST mới → session → mời → nhận lời mời → đổi vai trò → xin tham gia → duyệt → quên mật khẩu → logout", async () => {
    const reg = unwrap(await register(deps, { email: "an@minhkhang.vn", name: "Nguyễn Văn An", password: "matkhau123", taxCode: "0101234567", joinExisting: false }, META));
    expect(reg.mode).toBe("CREATED_ORG");
    const s1 = unwrap(await getSession(deps, reg.sessionToken));
    expect(s1.ctx.role).toBe("OWNER");
    expect(s1.session.org.taxCode).toBe("0101234567");

    // xác thực email bằng token trong mail
    unwrap(await verifyEmail(deps, tokenFrom(mailer.sent[0]!.text)));

    // đăng nhập lại
    const { sessionToken } = unwrap(await login(deps, { email: "an@minhkhang.vn", password: "matkhau123" }, META));
    const { ctx } = unwrap(await getSession(deps, sessionToken));

    // mời
    const invited = unwrap(await inviteMember(deps, ctx, { email: "binh@minhkhang.vn", role: "DECLARANT" }));
    expect(invited.status).toBe("INVITED");
    const inviteToken = tokenFrom(mailer.sent.find((m) => m.to === "binh@minhkhang.vn")!.text);
    const acc = unwrap(await acceptInvite(deps, { token: inviteToken, name: "Trần Bình", password: "matkhau456" }));
    const sBinh = unwrap(await getSession(deps, acc.sessionToken));
    expect(sBinh.session.user.name).toBe("Trần Bình");
    expect(sBinh.ctx.role).toBe("DECLARANT");
    expect(unwrap(await listMembers(deps, ctx)).map((m) => m.email).sort()).toEqual(["an@minhkhang.vn", "binh@minhkhang.vn"]);

    // đổi vai trò
    expect(unwrap(await changeMemberRole(deps, ctx, sBinh.ctx.userId, "APPROVER")).role).toBe("APPROVER");

    // người thứ ba xin tham gia → chủ sở hữu có thông báo → duyệt
    const jr = unwrap(await register(deps, { email: "cuong@minhkhang.vn", name: "Lê Cường", password: "matkhau789", joinExisting: true, taxCode: "0101234567" }, META));
    expect(jr.mode).toBe("JOIN_REQUESTED");
    expect(unwrap(await listNotifications(deps, ctx)).some((n) => n.title.includes("Lê Cường"))).toBe(true);
    const pending = unwrap(await listJoinRequests(deps, ctx));
    expect(pending).toHaveLength(1);
    const pendingLogin = await login(deps, { email: "cuong@minhkhang.vn", password: "matkhau789" }, META);
    expect(pendingLogin.ok).toBe(false);
    unwrap(await approveJoinRequest(deps, ctx, pending[0]!.id));
    expect((await login(deps, { email: "cuong@minhkhang.vn", password: "matkhau789" }, META)).ok).toBe(true);

    // quên mật khẩu
    unwrap(await requestPasswordReset(deps, "binh@minhkhang.vn", META));
    const resetToken = tokenFrom(mailer.sent.filter((m) => m.to === "binh@minhkhang.vn").at(-1)!.text);
    unwrap(await resetPassword(deps, { token: resetToken, password: "matkhaumoi9" }));
    expect((await login(deps, { email: "binh@minhkhang.vn", password: "matkhaumoi9" }, META)).ok).toBe(true);

    // logout
    unwrap(await logout(deps, sessionToken));
    expect((await getSession(deps, sessionToken)).ok).toBe(false);
  });
  it("org demo seed không bị org mới nhìn thấy", async () => {
    const { sessionToken } = unwrap(await login(deps, { email: "an@minhkhang.vn", password: "matkhau123" }, META));
    const { ctx } = unwrap(await getSession(deps, sessionToken));
    expect(unwrap(await listMembers(deps, ctx)).some((m) => m.email.endsWith("anphat-demo.vn"))).toBe(false);
  });
});
