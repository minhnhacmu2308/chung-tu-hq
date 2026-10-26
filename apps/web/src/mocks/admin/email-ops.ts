// Email của khu Quản trị trong bản mock – cùng quy tắc với backend (packages/core/src/modules/admin/application/email.ts):
// quyền, chữ ký chung/riêng, chọn người nhận, đợt gửi (bản mock "gửi" ngay, không có máy chủ thư thật).
import {
  DraftEmailInputSchema, EmailAudienceSchema, renderEmail, SaveEmailSignatureInputSchema, SaveEmailTemplateInputSchema, SendEmailInputSchema, SendTestEmailInputSchema,
  UpdateMailSettingsInputSchema,
  type EmailAudience, type EmailAudiencePreview, type EmailBlock, type EmailCampaign, type EmailCampaignDetail, type EmailContent, type EmailSignature, type EmailTemplate,
  type MailSettings,
} from "@kb/contracts";
import { ApiError } from "@/lib/api-error";
import { actor, allUsers, log, orgRefs, parse, type AdminScope } from "./ops";

const FOOTER = "Bạn nhận email này vì là khách hàng của KhaiBáo AI. Cần hỗ trợ, trả lời trực tiếp email này.";
const now = () => new Date().toISOString();
const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const ROLE_VI: Record<string, string> = { OWNER: "Chủ sở hữu", ADMIN: "Quản trị", DECLARANT: "Người khai", APPROVER: "Người duyệt", VIEWER: "Người xem" };

/* ---------------- Mẫu ---------------- */

export function listTemplates(db: AdminScope): EmailTemplate[] {
  actor(db, "VIEW");
  return [...db.admin.email.templates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveTemplate(db: AdminScope, id: string | null, input: unknown): EmailTemplate {
  const staff = actor(db, "SUPPORT");
  const v = parse(SaveEmailTemplateInputSchema, input);
  const row: EmailTemplate = {
    id: id ?? newId("etp"), name: v.name, subject: v.subject, blocks: v.blocks, updatedAt: now(), updatedByName: staff.name,
    ...(v.description ? { description: v.description } : {}), ...(v.preheader ? { preheader: v.preheader } : {}),
  };
  const list = db.admin.email.templates;
  const i = list.findIndex((t) => t.id === id);
  if (id && i < 0) throw new ApiError("NOT_FOUND", "Không tìm thấy mẫu email", 404);
  if (i >= 0) list[i] = row;
  else list.unshift(row);
  log(db, staff, "EMAIL_TEMPLATE_SAVED", { type: "EMAIL", id: row.id, label: row.name }, id ? "Sửa mẫu email" : "Tạo mẫu email");
  return row;
}

export function deleteTemplate(db: AdminScope, id: string): { id: string } {
  const staff = actor(db, "SUPPORT");
  const t = db.admin.email.templates.find((x) => x.id === id);
  if (!t) throw new ApiError("NOT_FOUND", "Không tìm thấy mẫu email", 404);
  db.admin.email.templates = db.admin.email.templates.filter((x) => x.id !== id);
  log(db, staff, "EMAIL_TEMPLATE_DELETED", { type: "EMAIL", id, label: t.name }, "Xóa mẫu email");
  return { id };
}

/* ---------------- Chữ ký ---------------- */

const strip = ({ ownerId: _o, ...s }: EmailSignature & { ownerId: string | null }): EmailSignature => s;

export function listSignatures(db: AdminScope): EmailSignature[] {
  const staff = actor(db, "VIEW");
  return db.admin.email.signatures.filter((s) => s.ownerId === null || s.ownerId === staff.id).map(strip);
}

export function saveSignature(db: AdminScope, id: string | null, input: unknown): EmailSignature {
  const v = parse(SaveEmailSignatureInputSchema, input);
  const staff = actor(db, v.personal ? "SUPPORT" : "PLATFORM");
  const owner = v.personal ? staff.id : null;
  const list = db.admin.email.signatures;
  const i = list.findIndex((s) => s.id === id && s.ownerId === owner);
  if (id && i < 0) throw new ApiError("NOT_FOUND", "Không tìm thấy chữ ký", 404);
  if (v.isDefault) list.forEach((s) => s.ownerId === owner && (s.isDefault = false));
  const row = { id: id ?? newId("sig"), name: v.name, personal: v.personal, isDefault: v.isDefault, blocks: v.blocks, updatedAt: now(), ownerId: owner, ...(v.personal ? { ownerName: staff.name } : {}) };
  if (i >= 0) list[i] = row;
  else list.push(row);
  log(db, staff, "EMAIL_SIGNATURE_SAVED", { type: "EMAIL", id: row.id, label: row.name }, v.personal ? "Chữ ký riêng" : "Chữ ký chung của công ty");
  return strip(row);
}

export function deleteSignature(db: AdminScope, id: string): { id: string } {
  const s = db.admin.email.signatures.find((x) => x.id === id);
  const viewer = actor(db, "VIEW");
  if (!s || (s.ownerId !== null && s.ownerId !== viewer.id)) throw new ApiError("NOT_FOUND", "Không tìm thấy chữ ký", 404);
  const staff = actor(db, s.ownerId ? "SUPPORT" : "PLATFORM");
  db.admin.email.signatures = db.admin.email.signatures.filter((x) => x.id !== id);
  log(db, staff, "EMAIL_SIGNATURE_DELETED", { type: "EMAIL", id, label: s.name }, "Xóa chữ ký");
  return { id };
}

/* ---------------- Người nhận + gửi ---------------- */

type Person = { email: string; name: string; orgName?: string };

function resolve(db: AdminScope, a: EmailAudience): Person[] {
  const orgs = new Map(orgRefs(db).filter((r) => r.meta.status === "ACTIVE").map((r) => [r.org.id, r.org]));
  const inFilter = (orgId: string) => {
    const o = orgs.get(orgId);
    if (!o) return false;
    if (a.orgs.mode === "ALL") return true;
    if (a.orgs.mode === "PLANS") return a.orgs.plans.includes(o.plan.code);
    if (a.orgs.mode === "PICK") return a.orgs.orgIds.includes(o.id);
    return false;
  };
  const out = new Map<string, Person>();
  for (const u of allUsers(db)) {
    if (u.status !== "ACTIVE" || !u.orgId || !orgs.has(u.orgId)) continue;
    if (a.userIds.includes(u.id) || (inFilter(u.orgId) && (a.roles.length === 0 || a.roles.includes(u.role)))) {
      if (!out.has(u.email)) out.set(u.email, { email: u.email, name: u.name, orgName: orgs.get(u.orgId)!.name });
    }
  }
  for (const e of a.extraEmails) if (!out.has(e)) out.set(e, { email: e, name: e.split("@")[0]! });
  return [...out.values()];
}

function label(db: AdminScope, a: EmailAudience): string {
  const names = new Map(orgRefs(db).map((r) => [r.org.id, r.org.name]));
  const parts: string[] = [];
  if (a.orgs.mode === "ALL") parts.push("Mọi doanh nghiệp");
  if (a.orgs.mode === "PLANS") parts.push(`Gói ${a.orgs.plans.join(", ")}`);
  if (a.orgs.mode === "PICK") parts.push(a.orgs.orgIds.length <= 2 ? a.orgs.orgIds.map((id) => names.get(id) ?? id).join(", ") : `${a.orgs.orgIds.length} doanh nghiệp`);
  if (a.orgs.mode !== "NONE" && a.roles.length) parts.push(a.roles.map((r) => ROLE_VI[r] ?? r).join(", "));
  if (a.userIds.length) parts.push(`${a.userIds.length} người chọn riêng`);
  if (a.extraEmails.length) parts.push(`${a.extraEmails.length} email ngoài`);
  return parts.join(" · ");
}

export function previewAudience(db: AdminScope, input: unknown): EmailAudiencePreview {
  actor(db, "SUPPORT");
  const people = resolve(db, parse(EmailAudienceSchema, input));
  return { total: people.length, sample: people.slice(0, 20) };
}

function signatureBlocks(db: AdminScope, staffId: string, id: string | undefined): EmailBlock[] {
  if (!id) return [];
  const s = db.admin.email.signatures.find((x) => x.id === id && (x.ownerId === null || x.ownerId === staffId));
  if (!s) throw new ApiError("NOT_FOUND", "Không tìm thấy chữ ký", 404);
  return s.blocks;
}

const requireMail = (db: AdminScope) => {
  if (!db.admin.email.settings.configured) throw new ApiError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình máy chủ gửi mail – vào Email › Cấu hình gửi mail", 409);
};

export function sendTest(db: AdminScope, input: unknown): { to: string } {
  const staff = actor(db, "SUPPORT");
  const v = parse(SendTestEmailInputSchema, input);
  requireMail(db);
  signatureBlocks(db, staff.id, v.signatureId);
  return { to: staff.email };
}

/** Bản mock: "gửi" ngay – email có chữ "khong-ton-tai" thất bại để thấy trạng thái lỗi. */
export function send(db: AdminScope, input: unknown): EmailCampaign {
  const staff = actor(db, "SUPPORT");
  const v = parse(SendEmailInputSchema, input);
  requireMail(db);
  const sig = signatureBlocks(db, staff.id, v.signatureId);
  const people = resolve(db, v.audience);
  if (people.length === 0) throw new ApiError("CONFLICT", "Không có người nhận nào khớp lựa chọn", 409);
  const recipients = people.map((p) => (p.email.includes("khong-ton-tai") ? { ...p, status: "FAILED" as const, error: "550 Hộp thư không tồn tại" } : { ...p, status: "SENT" as const }));
  const failed = recipients.filter((r) => r.status === "FAILED").length;
  const c: EmailCampaignDetail = {
    id: newId("ecp"), subject: v.subject, status: failed === 0 ? "SENT" : failed === people.length ? "FAILED" : "PARTIAL", total: people.length, sent: people.length - failed, failed,
    audienceLabel: label(db, v.audience), sentByName: staff.name, createdAt: now(), finishedAt: now(),
    html: renderEmail(v, { signature: sig, footer: FOOTER }).html, recipients,
  };
  db.admin.email.campaigns.unshift(c);
  log(db, staff, "EMAIL_SENT", { type: "EMAIL", id: c.id, label: c.subject }, "Gửi email theo đợt", `${c.total} người nhận · ${c.audienceLabel}`);
  const { html: _h, recipients: _r, ...summary } = c;
  return summary;
}

export function listCampaigns(db: AdminScope): EmailCampaign[] {
  actor(db, "VIEW");
  return db.admin.email.campaigns.map(({ html: _h, recipients: _r, ...c }) => c);
}

export function getCampaign(db: AdminScope, id: string): EmailCampaignDetail {
  actor(db, "VIEW");
  const c = db.admin.email.campaigns.find((x) => x.id === id);
  if (!c) throw new ApiError("NOT_FOUND", "Không tìm thấy đợt gửi", 404);
  return c;
}

/** Bản mock không gọi AI: dựng mẫu đơn giản từ mô tả để thử luồng "nhờ AI soạn". */
export function draft(db: AdminScope, input: unknown): EmailContent {
  actor(db, "SUPPORT");
  const v = parse(DraftEmailInputSchema, input);
  const first = v.description.split(/[.\n]/)[0]!.trim().slice(0, 80);
  return {
    subject: first,
    preheader: v.description.slice(0, 120),
    blocks: [
      { id: newId("blk"), type: "heading", text: first, level: 1, align: "left" },
      { id: newId("blk"), type: "text", text: `Chào {{name}},\n${v.description}`, align: "left" },
      { id: newId("blk"), type: "button", label: "Mở KhaiBáo AI", url: "https://ct-hq.aixuatnhapkhau.cloud", align: "left", tone: "primary" },
    ],
  };
}

/* ---------------- Máy chủ gửi mail ---------------- */

export function getSettings(db: AdminScope): MailSettings {
  actor(db, "PLATFORM");
  return db.admin.email.settings;
}

export function updateSettings(db: AdminScope, input: unknown): MailSettings {
  const staff = actor(db, "PLATFORM");
  const v = parse(UpdateMailSettingsInputSchema, input);
  const prev = db.admin.email.settings;
  const hasPassword = !!v.password || prev.hasPassword;
  // Mô phỏng thử đăng nhập: thiếu mật khẩu khi có tên đăng nhập → lỗi như Gmail.
  const ok = !v.username || hasPassword;
  db.admin.email.settings = {
    configured: true, host: v.host, port: v.port, secure: v.secure, username: v.username, hasPassword, fromName: v.fromName, fromEmail: v.fromEmail,
    ...(v.replyTo ? { replyTo: v.replyTo } : {}), updatedAt: now(),
    lastTest: { ok, at: now(), detail: ok ? "Đăng nhập máy chủ gửi mail thành công" : "Sai tên đăng nhập hoặc mật khẩu SMTP (Gmail cần Mật khẩu ứng dụng, không phải mật khẩu tài khoản)" },
  };
  log(db, staff, "MAIL_SETTINGS_UPDATED", { type: "EMAIL", id: "mail-settings", label: `${v.host}:${v.port}` }, "Cập nhật máy chủ gửi mail");
  return db.admin.email.settings;
}

export function testSettings(db: AdminScope): MailSettings {
  const staff = actor(db, "PLATFORM");
  requireMail(db);
  db.admin.email.settings.lastTest = { ok: true, at: now(), detail: `Đã gửi email thử tới ${staff.email}` };
  return db.admin.email.settings;
}
