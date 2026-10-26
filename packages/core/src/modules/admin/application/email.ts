// Email của khu Quản trị: mẫu kéo thả (JSON khối), chữ ký (chung + riêng từng quản trị viên), chọn người nhận, gửi theo đợt qua
// hàng đợi, AI soạn mẫu theo mô tả (ADR 0008), máy chủ gửi mail (SMTP, mật khẩu mã hóa).
import {
  EmailBlocksSchema, EmailContentSchema, renderEmail,
  type DraftEmailInput, type EmailAudience, type EmailAudiencePreview, type EmailBlock, type EmailCampaign, type EmailCampaignDetail, type EmailContent,
  type EmailRecipient, type EmailSignature, type EmailTemplate, type EmailVars, type MailSettings, type SaveEmailSignatureInput, type SaveEmailTemplateInput,
  type SendEmailInput, type SendTestEmailInput, type UpdateMailSettingsInput,
} from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { audit, guarded, type StaffActor } from "./_shared.js";
import type { AdminDeps, AdminRepos, EmailCampaignRow, EmailSignatureRow, EmailTemplateRow, MailSettingsRow } from "./ports.js";

/** Dòng chân mọi email gửi theo đợt: lý do người nhận nhận được thư. */
export const EMAIL_FOOTER = "Bạn nhận email này vì là khách hàng của KhaiBáo AI. Cần hỗ trợ, trả lời trực tiếp email này.";
const BATCH = 25;
const NOT_CONFIGURED = () => err(domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình máy chủ gửi mail – vào Email › Cấu hình gửi mail"));
const ROLE_VI: Record<string, string> = { OWNER: "Chủ sở hữu", ADMIN: "Quản trị", DECLARANT: "Người khai", APPROVER: "Người duyệt", VIEWER: "Người xem" };

const blocksOf = (raw: unknown[]): EmailBlock[] => EmailBlocksSchema.parse(raw);

const toTemplate = (t: EmailTemplateRow): EmailTemplate => ({
  id: t.id, name: t.name, subject: t.subject, blocks: blocksOf(t.blocks), updatedAt: t.updatedAt.toISOString(), updatedByName: t.updatedByName,
  ...(t.description ? { description: t.description } : {}), ...(t.preheader ? { preheader: t.preheader } : {}),
});
const toSignature = (s: EmailSignatureRow): EmailSignature => ({
  id: s.id, name: s.name, personal: s.ownerUserId !== null, isDefault: s.isDefault, blocks: blocksOf(s.blocks), updatedAt: s.updatedAt.toISOString(),
  ...(s.ownerName ? { ownerName: s.ownerName } : {}),
});
const toCampaign = (c: EmailCampaignRow): EmailCampaign => ({
  id: c.id, subject: c.subject, status: c.status, total: c.total, sent: c.sent, failed: c.failed, audienceLabel: c.audienceLabel, sentByName: c.sentByName,
  createdAt: c.createdAt.toISOString(), ...(c.finishedAt ? { finishedAt: c.finishedAt.toISOString() } : {}),
});

/* ---------------- Mẫu ---------------- */

export async function listEmailTemplates(deps: AdminDeps, actor: StaffActor): Promise<Result<EmailTemplate[]>> {
  return guarded(actor, "VIEW", () => deps.uow.run(async (r) => ok((await r.emailTemplates.list()).map(toTemplate))));
}

/** `id` null = tạo mới. */
export async function saveEmailTemplate(deps: AdminDeps, actor: StaffActor, id: string | null, input: SaveEmailTemplateInput): Promise<Result<EmailTemplate>> {
  return guarded(actor, "SUPPORT", () =>
    deps.uow.run(async (r) => {
      const now = deps.clock.now();
      const fields = { name: input.name, description: input.description || null, subject: input.subject, preheader: input.preheader || null, blocks: input.blocks as unknown[] };
      let templateId = id;
      if (id) {
        if (!(await r.emailTemplates.get(id))) return err(domainError("NOT_FOUND", "Không tìm thấy mẫu email"));
        await r.emailTemplates.update(id, { ...fields, updatedBy: actor.userId, updatedAt: now });
      } else {
        templateId = deps.idGen.next("etp");
        await r.emailTemplates.insert({ id: templateId, ...fields, createdBy: actor.userId, updatedBy: actor.userId, createdAt: now, updatedAt: now });
      }
      await audit(deps, r, actor, "EMAIL_TEMPLATE_SAVED", { type: "EMAIL", id: templateId!, label: input.name }, id ? "Sửa mẫu email" : "Tạo mẫu email");
      return ok(toTemplate((await r.emailTemplates.get(templateId!))!));
    }),
  );
}

export async function deleteEmailTemplate(deps: AdminDeps, actor: StaffActor, id: string): Promise<Result<{ id: string }>> {
  return guarded(actor, "SUPPORT", () =>
    deps.uow.run(async (r) => {
      const t = await r.emailTemplates.get(id);
      if (!t) return err(domainError("NOT_FOUND", "Không tìm thấy mẫu email"));
      await r.emailTemplates.delete(id);
      await audit(deps, r, actor, "EMAIL_TEMPLATE_DELETED", { type: "EMAIL", id, label: t.name }, "Xóa mẫu email");
      return ok({ id });
    }),
  );
}

/* ---------------- Chữ ký ---------------- */

/** Chữ ký chung + chữ ký riêng của CHÍNH người xem (không thấy chữ ký riêng của người khác). */
export async function listEmailSignatures(deps: AdminDeps, actor: StaffActor): Promise<Result<EmailSignature[]>> {
  return guarded(actor, "VIEW", () =>
    deps.uow.run(async (r) => ok((await r.emailSignatures.list()).filter((s) => s.ownerUserId === null || s.ownerUserId === actor.userId).map(toSignature))),
  );
}

/** Chữ ký chung: quyền PLATFORM. Chữ ký riêng: chủ của nó (quyền SUPPORT). `id` null = tạo mới. */
export async function saveEmailSignature(deps: AdminDeps, actor: StaffActor, id: string | null, input: SaveEmailSignatureInput): Promise<Result<EmailSignature>> {
  return guarded(actor, input.personal ? "SUPPORT" : "PLATFORM", () =>
    deps.uow.run(async (r) => {
      const owner = input.personal ? actor.userId : null;
      const now = deps.clock.now();
      if (id) {
        const s = await r.emailSignatures.get(id);
        if (!s || s.ownerUserId !== owner) return err(domainError("NOT_FOUND", "Không tìm thấy chữ ký"));
      }
      if (input.isDefault) await r.emailSignatures.clearDefault(owner);
      const sigId = id ?? deps.idGen.next("sig");
      if (id) await r.emailSignatures.update(id, { name: input.name, isDefault: input.isDefault, blocks: input.blocks as unknown[], updatedAt: now });
      else await r.emailSignatures.insert({ id: sigId, name: input.name, ownerUserId: owner, isDefault: input.isDefault, blocks: input.blocks as unknown[], updatedAt: now });
      await audit(deps, r, actor, "EMAIL_SIGNATURE_SAVED", { type: "EMAIL", id: sigId, label: input.name }, input.personal ? "Chữ ký riêng" : "Chữ ký chung của công ty");
      return ok(toSignature((await r.emailSignatures.get(sigId))!));
    }),
  );
}

export async function deleteEmailSignature(deps: AdminDeps, actor: StaffActor, id: string): Promise<Result<{ id: string }>> {
  return deps.uow.run(async (r) => {
    const s = await r.emailSignatures.get(id);
    if (!s || (s.ownerUserId !== null && s.ownerUserId !== actor.userId)) return err(domainError("NOT_FOUND", "Không tìm thấy chữ ký"));
    return guarded(actor, s.ownerUserId ? "SUPPORT" : "PLATFORM", async () => {
      await r.emailSignatures.delete(id);
      await audit(deps, r, actor, "EMAIL_SIGNATURE_DELETED", { type: "EMAIL", id, label: s.name }, "Xóa chữ ký");
      return ok({ id });
    });
  });
}

/* ---------------- Người nhận ---------------- */

type Resolved = EmailRecipient & { vars: EmailVars };

/** Danh sách người nhận (đã bỏ trùng email): thành viên đang hoạt động của doanh nghiệp đang hoạt động theo bộ lọc + người cụ thể + email ngoài. */
async function resolveAudience(r: AdminRepos, a: EmailAudience): Promise<Resolved[]> {
  const [orgs, members] = await Promise.all([r.orgs.list(), r.members.list()]);
  const activeOrgs = new Map(orgs.filter((o) => o.status === "ACTIVE").map((o) => [o.id, o]));
  const inOrgFilter = (orgId: string) => {
    const o = activeOrgs.get(orgId);
    if (!o) return false;
    switch (a.orgs.mode) {
      case "NONE": return false;
      case "ALL": return true;
      case "PLANS": return a.orgs.plans.includes(o.planCode);
      case "PICK": return a.orgs.orgIds.includes(o.id);
    }
  };
  const out = new Map<string, Resolved>();
  const add = (email: string, name: string, orgName?: string) => {
    const key = email.toLowerCase();
    if (!out.has(key)) out.set(key, { email: key, name, ...(orgName ? { orgName } : {}), vars: { name, email: key, ...(orgName ? { orgName } : {}) } });
  };
  for (const m of members) {
    if (m.status !== "ACTIVE" || !activeOrgs.has(m.orgId)) continue;
    const picked = a.userIds.includes(m.userId);
    if (picked || (inOrgFilter(m.orgId) && (a.roles.length === 0 || a.roles.includes(m.role)))) add(m.email, m.name, activeOrgs.get(m.orgId)!.name);
  }
  for (const e of a.extraEmails) add(e, e.split("@")[0]!);
  return [...out.values()];
}

function audienceLabel(a: EmailAudience, orgNames: Map<string, string>): string {
  const parts: string[] = [];
  if (a.orgs.mode === "ALL") parts.push("Mọi doanh nghiệp");
  if (a.orgs.mode === "PLANS") parts.push(`Gói ${a.orgs.plans.join(", ")}`);
  if (a.orgs.mode === "PICK") parts.push(a.orgs.orgIds.length <= 2 ? a.orgs.orgIds.map((id) => orgNames.get(id) ?? id).join(", ") : `${a.orgs.orgIds.length} doanh nghiệp`);
  if (a.orgs.mode !== "NONE" && a.roles.length) parts.push(a.roles.map((x) => ROLE_VI[x] ?? x).join(", "));
  if (a.userIds.length) parts.push(`${a.userIds.length} người chọn riêng`);
  if (a.extraEmails.length) parts.push(`${a.extraEmails.length} email ngoài`);
  return parts.join(" · ");
}

export async function previewEmailAudience(deps: AdminDeps, actor: StaffActor, audience: EmailAudience): Promise<Result<EmailAudiencePreview>> {
  return guarded(actor, "SUPPORT", () =>
    deps.uow.run(async (r) => {
      const list = await resolveAudience(r, audience);
      return ok({ total: list.length, sample: list.slice(0, 20).map(({ vars: _v, ...x }) => x) });
    }),
  );
}

/* ---------------- Gửi ---------------- */

async function signatureBlocks(r: AdminRepos, actor: StaffActor, signatureId: string | undefined): Promise<Result<EmailBlock[]>> {
  if (!signatureId) return ok([]);
  const s = await r.emailSignatures.get(signatureId);
  if (!s || (s.ownerUserId !== null && s.ownerUserId !== actor.userId)) return err(domainError("NOT_FOUND", "Không tìm thấy chữ ký"));
  return ok(blocksOf(s.blocks));
}

/** Gửi thử cho chính người soạn (biến theo người đó) – xem email thật trong hộp thư trước khi gửi cho khách. */
export async function sendTestEmail(deps: AdminDeps, actor: StaffActor, input: SendTestEmailInput): Promise<Result<{ to: string }>> {
  return guarded(actor, "SUPPORT", async () => {
    if (!deps.mail) return NOT_CONFIGURED();
    const sig = await deps.uow.run((r) => signatureBlocks(r, actor, input.signatureId));
    if (!sig.ok) return sig;
    const m = renderEmail(input, { vars: { name: actor.name, email: actor.email, orgName: "Doanh nghiệp mẫu" }, signature: sig.value, footer: EMAIL_FOOTER });
    try {
      await deps.mail.send({ to: actor.email, subject: `[Thử] ${m.subject}`, html: m.html, text: m.text });
    } catch (e) {
      return err(domainError("GATEWAY_ERROR", e instanceof Error ? e.message : "Không gửi được email"));
    }
    return ok({ to: actor.email });
  });
}

/** Tạo đợt gửi (ảnh chụp nội dung + danh sách người nhận) rồi giao cho worker gửi dần. */
export async function sendEmail(deps: AdminDeps, actor: StaffActor, input: SendEmailInput): Promise<Result<EmailCampaign>> {
  return guarded(actor, "SUPPORT", async () => {
    if (!deps.mail || !deps.queue) return NOT_CONFIGURED();
    const created = await deps.uow.run(async (r) => {
      const sig = await signatureBlocks(r, actor, input.signatureId);
      if (!sig.ok) return sig;
      const people = await resolveAudience(r, input.audience);
      if (people.length === 0) return err(domainError("CONFLICT", "Không có người nhận nào khớp lựa chọn"));
      const orgNames = new Map((await r.orgs.list()).map((o) => [o.id, o.name]));
      const now = deps.clock.now();
      const row: EmailCampaignRow = {
        id: deps.idGen.next("ecp"), templateId: input.templateId ?? null, subject: input.subject, preheader: input.preheader || null, blocks: input.blocks as unknown[],
        signatureBlocks: sig.value as unknown[], audience: input.audience, audienceLabel: audienceLabel(input.audience, orgNames), status: "QUEUED",
        total: people.length, sent: 0, failed: 0, sentBy: actor.userId, sentByName: actor.name, createdAt: now, finishedAt: null,
      };
      await r.emailCampaigns.insert(row, people.map((p) => ({ id: deps.idGen.next("erc"), email: p.email, name: p.name, orgName: p.orgName ?? null, status: "PENDING" as const, error: null, sentAt: null })));
      await audit(deps, r, actor, "EMAIL_SENT", { type: "EMAIL", id: row.id, label: input.subject }, "Gửi email theo đợt", `${people.length} người nhận · ${row.audienceLabel}`);
      return ok(row);
    });
    if (!created.ok) return created;
    await deps.queue!.enqueue("email-campaign", { campaignId: created.value.id }, { jobId: `email-campaign:${created.value.id}` });
    return ok(toCampaign(created.value));
  });
}

/**
 * Worker: gửi các người nhận còn PENDING theo lô, ghi kết quả từng người. Chạy lại (job thử lại) chỉ gửi phần còn thiếu – không gửi trùng.
 * Một người lỗi không dừng cả đợt; hết người nhận → SENT / PARTIAL / FAILED.
 */
export async function processEmailCampaign(deps: Pick<AdminDeps, "uow" | "mail" | "clock">, campaignId: string): Promise<Result<EmailCampaign>> {
  const c = await deps.uow.run((r) => r.emailCampaigns.get(campaignId));
  if (!c) return err(domainError("NOT_FOUND", "Không tìm thấy đợt gửi"));
  if (c.status === "SENT" || c.status === "PARTIAL" || c.status === "FAILED") return ok(toCampaign(c));
  await deps.uow.run((r) => r.emailCampaigns.update(campaignId, { status: "SENDING" }));
  const content = { subject: c.subject, preheader: c.preheader ?? undefined, blocks: blocksOf(c.blocks) };
  const signature = blocksOf(c.signatureBlocks);
  for (;;) {
    const batch = await deps.uow.run((r) => r.emailCampaigns.pending(campaignId, BATCH));
    if (batch.length === 0) break;
    for (const p of batch) {
      let error: string | null = null;
      if (!deps.mail) error = "Chưa cấu hình máy chủ gửi mail";
      else {
        try {
          const m = renderEmail(content, { vars: { name: p.name, email: p.email, ...(p.orgName ? { orgName: p.orgName } : {}) }, signature, footer: EMAIL_FOOTER });
          await deps.mail.send({ to: p.email, subject: m.subject, html: m.html, text: m.text });
        } catch (e) {
          error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        }
      }
      await deps.uow.run((r) => r.emailCampaigns.markRecipient(p.id, error ? "FAILED" : "SENT", error, deps.clock.now()));
    }
  }
  return deps.uow.run(async (r) => {
    const all = await r.emailCampaigns.recipients(campaignId);
    const sent = all.filter((x) => x.status === "SENT").length;
    const failed = all.filter((x) => x.status === "FAILED").length;
    const status = failed === 0 ? "SENT" : sent === 0 ? "FAILED" : "PARTIAL";
    await r.emailCampaigns.update(campaignId, { status, sent, failed, finishedAt: deps.clock.now() });
    return ok(toCampaign((await r.emailCampaigns.get(campaignId))!));
  });
}

export async function listEmailCampaigns(deps: AdminDeps, actor: StaffActor): Promise<Result<EmailCampaign[]>> {
  return guarded(actor, "VIEW", () => deps.uow.run(async (r) => ok((await r.emailCampaigns.list(200)).map(toCampaign))));
}

export async function getEmailCampaign(deps: AdminDeps, actor: StaffActor, id: string): Promise<Result<EmailCampaignDetail>> {
  return guarded(actor, "VIEW", () =>
    deps.uow.run(async (r) => {
      const c = await r.emailCampaigns.get(id);
      if (!c) return err(domainError("NOT_FOUND", "Không tìm thấy đợt gửi"));
      const recipients = await r.emailCampaigns.recipients(id);
      // Bản xem lại giữ nguyên biến {{…}} – mỗi người nhận đã thấy tên của chính mình.
      const m = renderEmail({ subject: c.subject, preheader: c.preheader ?? undefined, blocks: blocksOf(c.blocks) }, { signature: blocksOf(c.signatureBlocks), footer: EMAIL_FOOTER });
      return ok({
        ...toCampaign(c),
        html: m.html,
        recipients: recipients.map((x) => ({ email: x.email, name: x.name, status: x.status, ...(x.orgName ? { orgName: x.orgName } : {}), ...(x.error ? { error: x.error } : {}) })),
      });
    }),
  );
}

/* ---------------- AI soạn mẫu (ADR 0008) ---------------- */

export async function draftEmailWithAi(deps: AdminDeps, actor: StaffActor, input: DraftEmailInput): Promise<Result<EmailContent>> {
  return guarded(actor, "SUPPORT", async () => {
    if (!deps.emailAi) return err(domainError("INTEGRATION_NOT_CONFIGURED", "Chưa bật AI soạn email"));
    const limit = await deps.limiter.hit(`email-ai:${actor.userId}`, 20, 3600);
    if (!limit.allowed) return err(domainError("RATE_LIMITED", "Đã nhờ AI quá nhiều lần trong 1 giờ"));
    let raw: Awaited<ReturnType<NonNullable<AdminDeps["emailAi"]>["draft"]>>;
    try {
      raw = await deps.emailAi.draft(input);
    } catch (e) {
      return err(domainError("GATEWAY_ERROR", e instanceof Error ? e.message : "AI không soạn được mẫu"));
    }
    await deps.recordAiUsage?.({ kind: "AI_EMAIL_DRAFT", ...raw.usage });
    // Khối của AI được cấp id mới và kiểm lại bằng schema – AI trả sai định dạng thì báo lỗi, không đưa thẳng vào trình soạn.
    const blocks = (Array.isArray(raw.blocks) ? raw.blocks : []).map((b) => ({ ...(b as object), id: deps.idGen.next("blk") }));
    const parsed = EmailContentSchema.safeParse({ subject: raw.subject, ...(raw.preheader ? { preheader: raw.preheader } : {}), blocks });
    if (!parsed.success) return err(domainError("GATEWAY_ERROR", "AI trả về mẫu không hợp lệ – thử mô tả lại"));
    return ok(parsed.data);
  });
}

/* ---------------- Máy chủ gửi mail ---------------- */

const toSettings = (s: MailSettingsRow | null): MailSettings =>
  s
    ? {
        configured: true, host: s.host, port: s.port, secure: s.secure, username: s.username, hasPassword: !!s.passwordCiphertext, fromName: s.fromName, fromEmail: s.fromEmail,
        ...(s.replyTo ? { replyTo: s.replyTo } : {}), updatedAt: s.updatedAt.toISOString(),
        ...(s.lastTestAt ? { lastTest: { ok: !!s.lastTestOk, at: s.lastTestAt.toISOString(), ...(s.lastTestDetail ? { detail: s.lastTestDetail } : {}) } } : {}),
      }
    : { configured: false, host: "", port: 587, secure: false, username: "", hasPassword: false, fromName: "KhaiBáo AI", fromEmail: "" };

export async function getMailSettings(deps: AdminDeps, actor: StaffActor): Promise<Result<MailSettings>> {
  return guarded(actor, "PLATFORM", () => deps.uow.run(async (r) => ok(toSettings(await r.mailSettings.get()))));
}

/** Lưu cấu hình SMTP (mật khẩu mã hóa; bỏ trống = giữ mật khẩu cũ) rồi thử đăng nhập ngay – kết quả hiện trên màn hình. */
export async function updateMailSettings(deps: AdminDeps, actor: StaffActor, input: UpdateMailSettingsInput): Promise<Result<MailSettings>> {
  return guarded(actor, "PLATFORM", async () => {
    const now = deps.clock.now();
    const prev = await deps.uow.run((r) => r.mailSettings.get());
    const enc = input.password ? deps.vault.encrypt(input.password) : null;
    const password = input.password || (prev?.passwordCiphertext ? deps.vault.decrypt(prev.passwordCiphertext, prev.keyVersion) : null);
    await deps.uow.run(async (r) => {
      await r.mailSettings.save({
        host: input.host, port: input.port, secure: input.secure, username: input.username,
        passwordCiphertext: enc ? enc.ciphertext : (prev?.passwordCiphertext ?? null), keyVersion: enc ? enc.keyVersion : (prev?.keyVersion ?? 1),
        fromName: input.fromName, fromEmail: input.fromEmail, replyTo: input.replyTo || null, updatedBy: actor.userId, updatedAt: now,
      });
      await audit(deps, r, actor, "MAIL_SETTINGS_UPDATED", { type: "EMAIL", id: "mail-settings", label: `${input.host}:${input.port}` }, "Cập nhật máy chủ gửi mail", input.password ? "Đổi mật khẩu SMTP" : undefined);
    });
    deps.mail?.invalidate();
    let ok_ = true;
    let detail: string | null = "Đăng nhập máy chủ gửi mail thành công";
    try {
      if (deps.mail) await deps.mail.verify({ host: input.host, port: input.port, secure: input.secure, username: input.username, password });
    } catch (e) {
      ok_ = false;
      detail = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    }
    return deps.uow.run(async (r) => {
      await r.mailSettings.setTest(ok_, detail, deps.clock.now());
      return ok(toSettings(await r.mailSettings.get()));
    });
  });
}

/** Gửi một email thử tới chính quản trị viên bằng cấu hình đang lưu. */
export async function testMailSettings(deps: AdminDeps, actor: StaffActor): Promise<Result<MailSettings>> {
  return guarded(actor, "PLATFORM", async () => {
    if (!deps.mail) return NOT_CONFIGURED();
    let ok_ = true;
    let detail: string | null = `Đã gửi email thử tới ${actor.email}`;
    try {
      const m = renderEmail({ subject: "Email thử từ KhaiBáo AI", blocks: [{ id: "t", type: "text", text: "Máy chủ gửi mail đã cấu hình đúng – email hệ thống và email theo đợt sẽ gửi qua đây.", align: "left" }] });
      await deps.mail.send({ to: actor.email, subject: m.subject, html: m.html, text: m.text });
    } catch (e) {
      ok_ = false;
      detail = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    }
    return deps.uow.run(async (r) => {
      await r.mailSettings.setTest(ok_, detail, deps.clock.now());
      return ok(toSettings(await r.mailSettings.get()));
    });
  });
}
