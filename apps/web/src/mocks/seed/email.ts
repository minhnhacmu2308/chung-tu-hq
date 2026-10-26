// Email mẫu cho khu Quản trị (bản mock): vài mẫu kéo thả hay dùng, chữ ký chung + chữ ký riêng, một đợt đã gửi.
// Nội dung email là dữ liệu – không dịch theo ngôn ngữ giao diện.
import { renderEmail, type EmailBlock, type EmailCampaignDetail, type EmailSignature, type EmailTemplate, type MailSettings } from "@kb/contracts";

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

const MAINTENANCE: EmailBlock[] = [
  { id: "m1", type: "heading", text: "Lịch bảo trì hệ thống", level: 1, align: "left" },
  { id: "m2", type: "text", text: "Chào {{name}},\nKhaiBáo AI sẽ bảo trì định kỳ vào **[điền ngày giờ]**. Trong thời gian này doanh nghiệp **{{orgName}}** tạm thời không truyền tờ khai được; hồ sơ và chứng từ vẫn an toàn.", align: "left" },
  { id: "m3", type: "button", label: "Xem chi tiết", url: "https://ct-hq.aixuatnhapkhau.cloud", align: "left", tone: "primary" },
];
const FEATURE: EmailBlock[] = [
  { id: "f1", type: "heading", text: "Tính năng mới: hộp thư chứng từ", level: 1, align: "left" },
  { id: "f2", type: "text", text: "Chào {{name}},\nGiờ đây KhaiBáo AI tự lấy file đính kèm từ Gmail / Outlook của doanh nghiệp và gợi ý hồ sơ phù hợp – không phải tải xuống rồi tải lên nữa.", align: "left" },
  { id: "f3", type: "divider" },
  { id: "f4", type: "text", text: "**Bắt đầu trong 1 phút:** vào *Tài khoản & tích hợp → Kết nối hệ thống* và bấm **Kết nối Gmail**.", align: "left" },
  { id: "f5", type: "button", label: "Kết nối hộp thư", url: "https://ct-hq.aixuatnhapkhau.cloud/settings?tab=integrations", align: "center", tone: "primary" },
];
const RENEWAL: EmailBlock[] = [
  { id: "r1", type: "heading", text: "Hợp đồng sắp hết hạn", level: 2, align: "left" },
  { id: "r2", type: "text", text: "Kính gửi {{name}},\nHợp đồng sử dụng KhaiBáo AI của **{{orgName}}** sẽ hết hạn vào **[điền ngày]**. Vui lòng liên hệ để gia hạn, tránh gián đoạn khai báo.", align: "left" },
  { id: "r3", type: "button", label: "Liên hệ gia hạn", url: "mailto:sales@khaibao.ai", align: "left", tone: "neutral" },
];

export const COMPANY_SIGNATURE: EmailBlock[] = [
  { id: "s1", type: "text", text: "**KhaiBáo AI** – Khai báo hải quan bằng AI\nHotline: 1900 0000 · [khaibao.ai](https://khaibao.ai)", align: "left" },
];

export function seedEmail(): { templates: EmailTemplate[]; signatures: (EmailSignature & { ownerId: string | null })[]; campaigns: EmailCampaignDetail[]; settings: MailSettings } {
  const templates: EmailTemplate[] = [
    { id: "etp_maint", name: "Thông báo bảo trì", description: "Báo lịch bảo trì cho mọi doanh nghiệp", subject: "[KhaiBáo AI] Lịch bảo trì hệ thống", preheader: "Truyền tờ khai tạm ngưng trong thời gian bảo trì", blocks: MAINTENANCE, updatedAt: iso(30), updatedByName: "Hoàng Gia Bảo" },
    { id: "etp_feature", name: "Giới thiệu tính năng mới", subject: "Mới: KhaiBáo AI tự lấy chứng từ từ email", blocks: FEATURE, updatedAt: iso(80), updatedByName: "Mai Thị Thu Trang" },
    { id: "etp_renew", name: "Nhắc gia hạn hợp đồng", description: "Gửi Chủ sở hữu doanh nghiệp ký hợp đồng trực tiếp", subject: "Hợp đồng KhaiBáo AI của {{orgName}} sắp hết hạn", blocks: RENEWAL, updatedAt: iso(200), updatedByName: "Hoàng Gia Bảo" },
  ];
  const signatures = [
    { id: "sig_company", name: "Chữ ký KhaiBáo AI", personal: false, isDefault: true, blocks: COMPANY_SIGNATURE, updatedAt: iso(300), ownerId: null },
    {
      id: "sig_bao", name: "Bảo – Chăm sóc khách hàng", personal: true, ownerName: "Hoàng Gia Bảo", isDefault: true, updatedAt: iso(100), ownerId: "stf_bao",
      blocks: [{ id: "b1", type: "text", text: "**Hoàng Gia Bảo**\nChăm sóc khách hàng · KhaiBáo AI\n0912 000 000", align: "left" } as EmailBlock],
    },
  ];
  const sent = renderEmail({ subject: templates[1]!.subject, blocks: FEATURE }, { signature: COMPANY_SIGNATURE, footer: "Bạn nhận email này vì là khách hàng của KhaiBáo AI." });
  const campaigns: EmailCampaignDetail[] = [
    {
      id: "ecp_1", subject: templates[1]!.subject, status: "PARTIAL", total: 3, sent: 2, failed: 1, audienceLabel: "Gói PRO · Chủ sở hữu", sentByName: "Mai Thị Thu Trang",
      createdAt: iso(72), finishedAt: iso(71.9), html: sent.html,
      recipients: [
        { email: "chau.le@anphat-demo.vn", name: "Lê Minh Châu", orgName: "CÔNG TY TNHH THƯƠNG MẠI AN PHÁT", status: "SENT" },
        { email: "giam.doc@hoanggia-demo.vn", name: "Nguyễn Hoàng Gia", orgName: "CÔNG TY CỔ PHẦN DỆT MAY HOÀNG GIA", status: "SENT" },
        { email: "owner@vietuc-demo.vn", name: "Trần Việt Úc", orgName: "CÔNG TY CỔ PHẦN THỰC PHẨM VIỆT ÚC", status: "FAILED", error: "550 Hộp thư không tồn tại" },
      ],
    },
  ];
  const settings: MailSettings = { configured: false, host: "", port: 587, secure: false, username: "", hasPassword: false, fromName: "KhaiBáo AI", fromEmail: "" };
  return { templates, signatures, campaigns, settings };
}
