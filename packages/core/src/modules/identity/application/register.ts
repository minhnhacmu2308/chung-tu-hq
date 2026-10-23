import type { RegisterInput } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { createLogger } from "../../../shared/log.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { newToken, TOKEN_TTL_MS } from "../domain/token.js";
import { joinRequestMail, verifyEmailMail } from "./_mail-templates.js";
import { createSession } from "./_session.js";
import type { IdentityDeps } from "./ports.js";

export type RegisterOutput = { sessionToken: string; mode: "CREATED_ORG" | "JOIN_REQUESTED" };

const log = createLogger({ name: "core" });

/**
 * Đăng ký: tài khoản mới + (doanh nghiệp mới theo MST | yêu cầu tham gia doanh nghiệp đã có).
 * Mọi dòng (user, org, token, membership OWNER, phiên) ghi trong MỘT transaction – lỗi giữa chừng không để lại doanh nghiệp không có chủ
 * hay MST đã bị chiếm. Email chỉ gửi SAU khi commit (gửi mail không giữ transaction, mail lỗi không làm hỏng đăng ký).
 */
export async function register(deps: IdentityDeps, input: RegisterInput, meta: { ip: string }): Promise<Result<RegisterOutput>> {
  const rl = await deps.rateLimiter.hit(`register:${meta.ip}`, 5, 3600);
  if (!rl.allowed) return err(domainError("RATE_LIMITED", "Bạn đăng ký quá nhiều lần, thử lại sau 1 giờ"));
  const now = deps.clock.now();

  const created = await deps.uow.system(async (r) => {
    if (await r.users.findByEmail(input.email)) return err(domainError("EMAIL_TAKEN", "Email này đã có tài khoản"));
    const existing = await r.orgs.findByTaxCode(input.taxCode);
    if (existing && !input.joinExisting) return err(domainError("TAX_CODE_EXISTS", "Doanh nghiệp đã có trên hệ thống, hãy gửi yêu cầu tham gia"));
    if (!existing && input.joinExisting) return err(domainError("NOT_FOUND", "Doanh nghiệp chưa có trên hệ thống"));

    const userId = deps.idGen.next("usr");
    await r.users.insert({ id: userId, email: input.email, passwordHash: await deps.hasher.hash(input.password), name: input.name, emailVerifiedAt: null, createdAt: now });

    if (existing) {
      await r.joinRequests.insert({ id: deps.idGen.next("job"), orgId: existing.id, userId, status: "PENDING", createdAt: now });
      return ok({ mode: "JOIN_REQUESTED" as const, existingOrgId: existing.id, userId });
    }

    const registry = await deps.taxRegistry.lookup(input.taxCode);
    const orgId = deps.idGen.next("org");
    await r.orgs.insert({
      id: orgId, taxCode: input.taxCode, name: registry.found ? registry.name : `Doanh nghiệp MST ${input.taxCode}`, address: registry.found ? registry.address : "",
      phone: "", planCode: "TRIAL", suspectThreshold: "BALANCED", fourEyes: false, createdAt: now,
    });
    const t = newToken(deps.random);
    await r.authTokens.insert({ id: deps.idGen.next("tok"), userId, orgId, kind: "VERIFY_EMAIL", tokenHash: t.hash, expiresAt: new Date(now.getTime() + TOKEN_TTL_MS.VERIFY_EMAIL), usedAt: null });
    await r.memberships.insert({ id: deps.idGen.next("mem"), orgId, userId, role: "OWNER", status: "ACTIVE", invitedBy: null });
    const sessionToken = await createSession(deps, r, userId, orgId);
    return ok({ mode: "CREATED_ORG" as const, userId, orgId, sessionToken, verifyToken: t.raw });
  });
  if (!created.ok) return created;
  const v = created.value;

  if (v.mode === "JOIN_REQUESTED") {
    // Ngữ cảnh org của doanh nghiệp đã có (RLS memberships/notifications cần org): báo cho OWNER/ADMIN.
    const orgId = asOrgId(v.existingOrgId);
    const managerEmails = await deps.uow.asOrg({ orgId, userId: asUserId(v.userId) }, async (r) => {
      const org = await r.orgs.findById(orgId);
      const managers = (await r.memberships.listByOrg(orgId)).filter((m) => m.status === "ACTIVE" && (m.role === "OWNER" || m.role === "ADMIN"));
      for (const m of managers) {
        await r.notifications.insert({
          id: deps.idGen.next("ntf"), orgId, userId: m.userId, title: `${input.name} xin tham gia doanh nghiệp`,
          body: `${input.email} đã đăng ký với MST ${org?.taxCode ?? input.taxCode}. Vào Tài khoản & tích hợp → Thành viên để duyệt.`, href: "/settings?tab=members", readAt: null, createdAt: now,
        });
      }
      const users = await r.users.findByIds(managers.map((m) => m.userId));
      return { orgName: org?.name ?? "", emails: users.map((u) => u.email) };
    });
    const mail = joinRequestMail(deps.appUrl, managerEmails.orgName, input.name, input.email);
    for (const to of managerEmails.emails) await deps.mailer.send({ to, ...mail });
    return ok({ sessionToken: "", mode: "JOIN_REQUESTED" as const });
  }

  await deps.mailer.send({ to: input.email, ...verifyEmailMail(deps.appUrl, v.verifyToken) });
  if (deps.onOrgCreated) {
    try {
      await deps.onOrgCreated({ orgId: v.orgId, userId: v.userId });
    } catch (e) {
      log.error("onOrgCreated lỗi – doanh nghiệp vẫn tạo xong, skill mẫu sẽ thiếu", { orgId: v.orgId, err: e });
    }
  }
  return ok({ sessionToken: v.sessionToken, mode: "CREATED_ORG" as const });
}
