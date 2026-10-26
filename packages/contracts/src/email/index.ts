// Mẫu email dạng khối (soạn kéo thả ở khu Quản trị) + bộ dựng HTML dùng chung cho xem trước (trình duyệt) và lúc gửi (worker).
// Mẫu là dữ liệu (JSON khối), không phải code: thêm mẫu mới không cần sửa mã nguồn.
// HTML theo kiểu email: bảng + style inline (Gmail/Outlook bỏ <style> và CSS biến), mọi chữ đều được escape,
// liên kết chỉ nhận http(s)/mailto.
import { z } from "zod";

/* ---------------- Khối ---------------- */

export const EMAIL_BLOCK_TYPES = ["heading", "text", "button", "image", "divider", "spacer"] as const;
export type EmailBlockType = (typeof EMAIL_BLOCK_TYPES)[number];

const AlignSchema = z.enum(["left", "center", "right"]);
const BlockId = z.string().min(1).max(40);
/** Liên kết an toàn trong email: http(s) hoặc mailto, hoặc chứa biến {{…}} (vd {{loginUrl}}). */
export const EmailUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => /^(https?:\/\/|mailto:)/i.test(u) || /^\{\{\w+\}\}/.test(u), "Liên kết phải bắt đầu bằng https://, http:// hoặc mailto:");

export const EmailBlockSchema = z.discriminatedUnion("type", [
  z.object({ id: BlockId, type: z.literal("heading"), text: z.string().max(300), level: z.union([z.literal(1), z.literal(2)]), align: AlignSchema }),
  /** Đoạn văn: **đậm**, *nghiêng*, [chữ](liên kết), xuống dòng giữ nguyên. */
  z.object({ id: BlockId, type: z.literal("text"), text: z.string().max(5000), align: AlignSchema }),
  z.object({ id: BlockId, type: z.literal("button"), label: z.string().max(80), url: EmailUrlSchema, align: AlignSchema, tone: z.enum(["primary", "neutral"]) }),
  z.object({ id: BlockId, type: z.literal("image"), url: EmailUrlSchema, alt: z.string().max(200), width: z.number().int().min(40).max(600), align: AlignSchema }),
  z.object({ id: BlockId, type: z.literal("divider") }),
  z.object({ id: BlockId, type: z.literal("spacer"), size: z.enum(["sm", "md", "lg"]) }),
]);
export type EmailBlock = z.infer<typeof EmailBlockSchema>;

export const EmailBlocksSchema = z.array(EmailBlockSchema).max(80, "Tối đa 80 khối");

/** Nội dung một email: tiêu đề + dòng xem trước (hộp thư hiện cạnh tiêu đề) + các khối. */
export const EmailContentSchema = z.object({
  subject: z.string().trim().min(1, "Nhập tiêu đề email").max(200),
  preheader: z.string().trim().max(200).optional(),
  blocks: EmailBlocksSchema.min(1, "Thêm ít nhất một khối nội dung"),
});
export type EmailContent = z.infer<typeof EmailContentSchema>;

/** Biến cá nhân hóa theo từng người nhận. */
export const EMAIL_VARIABLES = ["name", "email", "orgName"] as const;
export type EmailVariable = (typeof EMAIL_VARIABLES)[number];
export type EmailVars = Partial<Record<EmailVariable, string>>;

/** Khối mới với nội dung mặc định (trình soạn thêm vào). `id` do nơi gọi cấp. */
export function newEmailBlock(type: EmailBlockType, id: string): EmailBlock {
  switch (type) {
    case "heading": return { id, type, text: "", level: 1, align: "left" };
    case "text": return { id, type, text: "", align: "left" };
    case "button": return { id, type, label: "", url: "https://", align: "left", tone: "primary" };
    case "image": return { id, type, url: "https://", alt: "", width: 560, align: "center" };
    case "divider": return { id, type };
    case "spacer": return { id, type, size: "md" };
  }
}

/* ---------------- Dựng HTML ---------------- */

// kb-allow-raw: HTML email cần màu inline (Gmail/Outlook bỏ CSS biến) – bảng màu khớp token primary / fg / border của @kb/ui (sáng)
const C = { brand: "#0F6B55", ink: "#1B2420", muted: "#5B6762", line: "#E1E6E3", page: "#F3F5F4", white: "#FFFFFF" } as const;
const BRAND = C.brand;
const INK = C.ink;
const MUTED = C.muted;
const LINE = C.line;
const PAGE = C.page;
const FONT = "Arial, Helvetica, sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeUrl = (u: string) => (/^(https?:\/\/|mailto:)/i.test(u.trim()) ? u.trim() : "#");

/** Thay {{biến}}; biến không biết giữ nguyên để người soạn thấy mình gõ sai. */
export function fillEmailVars(s: string, vars: EmailVars): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars && vars[k as EmailVariable] !== undefined ? vars[k as EmailVariable]! : m));
}

/** **đậm**, *nghiêng*, [chữ](url), xuống dòng → HTML (đã escape trước). */
function inline(text: string): string {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => `<a href="${esc(safeUrl(url.replace(/&amp;/g, "&")))}" style="color:${BRAND};text-decoration:underline">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}
const plain = (text: string) => text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");

function blockHtml(b: EmailBlock): string {
  const cell = (inner: string, align = "left", pad = "8px 0") => `<tr><td align="${align}" style="padding:${pad};font-family:${FONT};text-align:${align}">${inner}</td></tr>`;
  switch (b.type) {
    case "heading": {
      const size = b.level === 1 ? 24 : 18;
      return cell(`<h${b.level} style="margin:0;font-size:${size}px;line-height:1.3;font-weight:700;color:${INK}">${inline(b.text)}</h${b.level}>`, b.align, "12px 0 4px");
    }
    case "text":
      return cell(`<p style="margin:0;font-size:15px;line-height:1.6;color:${INK}">${inline(b.text)}</p>`, b.align);
    case "button": {
      const bg = b.tone === "primary" ? BRAND : C.white;
      const fg = b.tone === "primary" ? C.white : BRAND;
      return cell(
        `<a href="${esc(safeUrl(b.url))}" style="display:inline-block;padding:12px 22px;border-radius:6px;border:1px solid ${BRAND};background:${bg};color:${fg};font-size:15px;font-weight:700;text-decoration:none">${esc(b.label)}</a>`,
        b.align,
        "14px 0",
      );
    }
    case "image":
      return cell(`<img src="${esc(safeUrl(b.url))}" alt="${esc(b.alt)}" width="${b.width}" style="display:inline-block;max-width:100%;height:auto;border:0">`, b.align);
    case "divider":
      return `<tr><td style="padding:14px 0"><div style="border-top:1px solid ${LINE};height:0;line-height:0;font-size:0">&nbsp;</div></td></tr>`;
    case "spacer": {
      const h = { sm: 8, md: 20, lg: 40 }[b.size];
      return `<tr><td style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</td></tr>`;
    }
  }
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case "heading": return b.text.toUpperCase();
    case "text": return plain(b.text);
    case "button": return `${b.label}: ${b.url}`;
    case "image": return b.alt ? `[${b.alt}]` : "";
    case "divider": return "----";
    case "spacer": return "";
  }
}

/** Thay biến trong mọi chữ / liên kết của các khối. */
function withVars(blocks: readonly EmailBlock[], vars: EmailVars): EmailBlock[] {
  const f = (s: string) => fillEmailVars(s, vars);
  return blocks.map((b) => {
    switch (b.type) {
      case "heading": case "text": return { ...b, text: f(b.text) };
      case "button": return { ...b, label: f(b.label), url: f(b.url) };
      case "image": return { ...b, url: f(b.url), alt: f(b.alt) };
      default: return b;
    }
  });
}

export type RenderedEmail = { subject: string; html: string; text: string };

/**
 * Dựng email hoàn chỉnh: khung + các khối + chữ ký (khối, ngăn cách bằng đường kẻ) + dòng chân (`footer`, vd lý do nhận email).
 * Dùng cho cả xem trước và lúc gửi → khách nhận đúng như người soạn thấy.
 */
export function renderEmail(content: { subject: string; preheader?: string | undefined; blocks: readonly EmailBlock[] }, opts: { vars?: EmailVars; signature?: readonly EmailBlock[]; footer?: string } = {}): RenderedEmail {
  const vars = opts.vars ?? {};
  const blocks = withVars(content.blocks, vars);
  const signature = opts.signature?.length ? withVars(opts.signature, vars) : [];
  const subject = fillEmailVars(content.subject, vars);
  const pre = content.preheader ? fillEmailVars(content.preheader, vars) : "";
  const body = blocks.map(blockHtml).join("");
  const sig = signature.length ? `<tr><td style="padding:18px 0 4px"><div style="border-top:1px solid ${LINE};height:0;line-height:0;font-size:0">&nbsp;</div></td></tr>${signature.map(blockHtml).join("")}` : "";
  const footer = opts.footer ? `<tr><td align="center" style="padding:16px 8px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};text-align:center">${inline(opts.footer)}</td></tr>` : "";
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:${PAGE}">`
    + (pre ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</div>` : "")
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.white};border:1px solid ${LINE};border-radius:8px"><tr><td style="padding:24px 28px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}${sig}</table>`
    + `</td></tr></table>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">${footer}</table>`
    + `</td></tr></table></body></html>`;
  const text = [...blocks, ...(signature.length ? [{ id: "_", type: "divider" } as const, ...signature] : [])].map(blockText).filter(Boolean).join("\n\n") + (opts.footer ? `\n\n${plain(opts.footer)}` : "");
  return { subject, html, text };
}

/* ---------------- Mẫu, chữ ký, người nhận, đợt gửi, cấu hình gửi mail ---------------- */

export const EmailTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  subject: z.string(),
  preheader: z.string().optional(),
  blocks: EmailBlocksSchema,
  updatedAt: z.string(),
  updatedByName: z.string(),
});
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

export const SaveEmailTemplateInputSchema = EmailContentSchema.extend({
  name: z.string().trim().min(1, "Đặt tên mẫu").max(120),
  description: z.string().trim().max(500).optional(),
});
export type SaveEmailTemplateInput = z.infer<typeof SaveEmailTemplateInputSchema>;

/** Chữ ký: chung của công ty (`personal = false`, quyền PLATFORM sửa) hoặc riêng của từng quản trị viên. */
export const EmailSignatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  personal: z.boolean(),
  ownerName: z.string().optional(),
  isDefault: z.boolean(),
  blocks: EmailBlocksSchema,
  updatedAt: z.string(),
});
export type EmailSignature = z.infer<typeof EmailSignatureSchema>;

export const SaveEmailSignatureInputSchema = z.object({
  name: z.string().trim().min(1, "Đặt tên chữ ký").max(80),
  personal: z.boolean(),
  isDefault: z.boolean(),
  blocks: EmailBlocksSchema.min(1, "Chữ ký cần ít nhất một khối"),
});
export type SaveEmailSignatureInput = z.infer<typeof SaveEmailSignatureInputSchema>;

const ROLE = z.enum(["OWNER", "ADMIN", "DECLARANT", "APPROVER", "VIEWER"]);
/**
 * Người nhận: nhóm doanh nghiệp (mọi / theo gói / chọn từng doanh nghiệp) × vai trò (rỗng = mọi vai trò),
 * cộng thêm người dùng cụ thể và email ngoài hệ thống. Chỉ thành viên đang hoạt động của doanh nghiệp đang hoạt động.
 */
export const EmailAudienceSchema = z
  .object({
    orgs: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("NONE") }),
      z.object({ mode: z.literal("ALL") }),
      z.object({ mode: z.literal("PLANS"), plans: z.array(z.string()).min(1, "Chọn ít nhất một gói") }),
      z.object({ mode: z.literal("PICK"), orgIds: z.array(z.string()).min(1, "Chọn ít nhất một doanh nghiệp").max(1000) }),
    ]),
    roles: z.array(ROLE),
    userIds: z.array(z.string()).max(1000),
    extraEmails: z.array(z.string().trim().toLowerCase().pipe(z.email("Email không hợp lệ"))).max(1000),
  })
  .refine((a) => a.orgs.mode !== "NONE" || a.userIds.length > 0 || a.extraEmails.length > 0, { path: ["orgs"], message: "Chọn người nhận" });
export type EmailAudience = z.infer<typeof EmailAudienceSchema>;

export const EmailRecipientSchema = z.object({ email: z.string(), name: z.string(), orgName: z.string().optional() });
export type EmailRecipient = z.infer<typeof EmailRecipientSchema>;
export const EmailAudiencePreviewSchema = z.object({ total: z.number().int().nonnegative(), sample: z.array(EmailRecipientSchema) });
export type EmailAudiencePreview = z.infer<typeof EmailAudiencePreviewSchema>;

export const SendEmailInputSchema = EmailContentSchema.extend({
  templateId: z.string().optional(),
  signatureId: z.string().optional(),
  audience: EmailAudienceSchema,
});
export type SendEmailInput = z.infer<typeof SendEmailInputSchema>;
/** Gửi thử cho chính quản trị viên đang soạn (biến lấy theo người đó). */
export const SendTestEmailInputSchema = EmailContentSchema.extend({ signatureId: z.string().optional() });
export type SendTestEmailInput = z.infer<typeof SendTestEmailInputSchema>;

export const EmailCampaignStatusSchema = z.enum(["QUEUED", "SENDING", "SENT", "PARTIAL", "FAILED"]);
export const EmailCampaignSchema = z.object({
  id: z.string(),
  subject: z.string(),
  status: EmailCampaignStatusSchema,
  total: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  audienceLabel: z.string(),
  sentByName: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
});
export type EmailCampaign = z.infer<typeof EmailCampaignSchema>;
export const EmailCampaignDetailSchema = EmailCampaignSchema.extend({
  html: z.string(),
  recipients: z.array(EmailRecipientSchema.extend({ status: z.enum(["PENDING", "SENT", "FAILED"]), error: z.string().optional() })),
});
export type EmailCampaignDetail = z.infer<typeof EmailCampaignDetailSchema>;

/** Máy chủ gửi mail (SMTP). Mật khẩu không bao giờ trả về – chỉ biết đã có hay chưa. */
export const MailSettingsSchema = z.object({
  configured: z.boolean(),
  host: z.string(),
  port: z.number().int(),
  secure: z.boolean(),
  username: z.string(),
  hasPassword: z.boolean(),
  fromName: z.string(),
  fromEmail: z.string(),
  replyTo: z.string().optional(),
  updatedAt: z.string().optional(),
  lastTest: z.object({ ok: z.boolean(), detail: z.string().optional(), at: z.string() }).optional(),
});
export type MailSettings = z.infer<typeof MailSettingsSchema>;
export const UpdateMailSettingsInputSchema = z.object({
  host: z.string().trim().min(1, "Nhập máy chủ SMTP").max(200),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().max(200),
  /** Bỏ trống = giữ mật khẩu đã lưu. */
  password: z.string().max(500).optional(),
  fromName: z.string().trim().min(1, "Nhập tên người gửi").max(120),
  fromEmail: z.string().trim().toLowerCase().pipe(z.email("Email người gửi không hợp lệ")),
  replyTo: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("Email trả lời không hợp lệ"))]).optional(),
});
export type UpdateMailSettingsInput = z.infer<typeof UpdateMailSettingsInputSchema>;

/** Nhờ AI soạn mẫu theo mô tả. Không gửi dữ liệu khách hàng – chỉ mô tả người soạn gõ. */
export const DraftEmailInputSchema = z.object({
  description: z.string().trim().min(10, "Mô tả ít nhất 10 ký tự").max(2000),
  tone: z.enum(["FORMAL", "FRIENDLY", "SHORT"]),
  language: z.enum(["vi", "en", "zh"]),
});
export type DraftEmailInput = z.infer<typeof DraftEmailInputSchema>;
export const DraftEmailResultSchema = EmailContentSchema;
