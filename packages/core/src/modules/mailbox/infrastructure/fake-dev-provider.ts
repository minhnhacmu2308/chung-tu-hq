// Hộp thư giả lập cho dev/demo (MAILBOX_PROVIDER=fake): không gọi Google/Microsoft. Bấm "Kết nối" → chuyển thẳng về callback
// của mình; lần lấy đầu trả vài email chứng từ mẫu (file PDF thật, đọc được), lần sau không có gì mới (chống trùng theo mã email).
import type { MailProvider } from "@kb/contracts";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { systemClock, type Clock } from "../../../shared/clock.js";
import type { MailProviderAdapter, MailTokens, RemoteMessage } from "../application/ports.js";

type Sample = Omit<RemoteMessage, "id" | "receivedAt"> & { key: string; hoursAgo: number; lines: Record<string, string[]> };

/** Email mẫu: forwarder gửi invoice + packing list, hãng tàu gửi draft B/L, nhà cung cấp gửi invoice + C/O (kèm logo .gif bị bỏ qua). */
const SAMPLES: Sample[] = [
  {
    key: "fwd-hph2610", hoursAgo: 50, fromName: "Sao Viet Logistics – Ops", fromEmail: "ops@saovietlogistics.vn",
    subject: "Bộ chứng từ lô HPH-2610: Invoice + Packing list", snippet: "Gửi anh/chị invoice và packing list lô hàng nhập cảng Hải Phòng, ETA 25/10. Vui lòng kiểm tra và khai báo giúp.",
    attachments: [
      { id: "inv", fileName: "INV-SV2610.pdf", mime: "application/pdf", size: 1800 },
      { id: "pl", fileName: "PL-SV2610.pdf", mime: "application/pdf", size: 1800 },
    ],
    lines: {
      inv: ["COMMERCIAL INVOICE", "Invoice No: SV2610-INV", "Seller: Shenzhen Hongda Electronics Co., Ltd", "Buyer: An Phat Trading JSC", "Bluetooth speaker BT-200  500 PCS  x  12.50 USD = 6,250.00 USD", "Total: 6,250.00 USD  CIF Hai Phong"],
      pl: ["PACKING LIST", "Ref: SV2610-INV", "Bluetooth speaker BT-200  500 PCS  50 CTNS", "Gross weight: 620 KGS   Net weight: 560 KGS", "Measurement: 4.2 CBM"],
    },
  },
  {
    key: "bl-eglv", hoursAgo: 26, fromName: "Evergreen Line Documentation", fromEmail: "doc@evergreen-line.com",
    subject: "Draft B/L EGLV142600123456 – please confirm", snippet: "Please find attached the draft bill of lading for your confirmation before 18:00 today.",
    attachments: [{ id: "bl", fileName: "BL_EGLV142600123456.pdf", mime: "application/pdf", size: 1800 }],
    lines: { bl: ["BILL OF LADING (DRAFT)", "B/L No: EGLV142600123456", "Shipper: Shenzhen Hongda Electronics Co., Ltd", "Consignee: An Phat Trading JSC", "Port of loading: Yantian  Port of discharge: Hai Phong", "Container: EGHU1234567 / 40HC"] },
  },
  {
    key: "supplier-co", hoursAgo: 5, fromName: "Hongda Electronics Sales", fromEmail: "sales@hongda-elec.cn",
    subject: "Commercial invoice & C/O form E – PO 2610-15", snippet: "Dear An Phat, attached are the commercial invoice and certificate of origin form E for PO 2610-15.",
    attachments: [
      { id: "ci", fileName: "CI_HD261015.pdf", mime: "application/pdf", size: 1800 },
      { id: "co", fileName: "CO_FormE_E2610.pdf", mime: "application/pdf", size: 1800 },
      { id: "logo", fileName: "hongda-logo.gif", mime: "image/gif", size: 43 },
    ],
    lines: {
      ci: ["COMMERCIAL INVOICE", "Invoice No: HD261015", "PO: 2610-15", "LED driver LD-30W  2,000 PCS  x  1.85 USD = 3,700.00 USD", "Total: 3,700.00 USD  FOB Shenzhen"],
      co: ["CERTIFICATE OF ORIGIN - FORM E", "Reference No: E2610-0098", "Exporter: Shenzhen Hongda Electronics Co., Ltd", "Importing country: Viet Nam", "HS 8504.40  LED driver LD-30W  2,000 PCS"],
    },
  },
  {
    key: "photos", hoursAgo: 2, fromName: "Kho Sao Viet", fromEmail: "kho@saovietlogistics.vn",
    subject: "Ảnh đóng hàng (packing) lô HPH-2610", snippet: "Gửi ảnh đóng hàng để anh/chị tham khảo.",
    attachments: [{ id: "img", fileName: "anh-dong-hang.gif", mime: "image/gif", size: 43 }],
    lines: {},
  },
];

/** GIF 1×1 trong suốt – loại file hộp thư không nhận (để thấy file bị bỏ qua). */
const GIF_1PX = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export class FakeDevMailProvider implements MailProviderAdapter {
  readonly configured = true;
  /** Mốc cố định lúc khởi động → ngày email ổn định giữa các lần lấy. */
  private anchor: Date;
  constructor(readonly provider: MailProvider, private clock: Clock = systemClock) {
    this.anchor = clock.now();
  }

  authorizeUrl(state: string, redirectUri: string): string {
    return `${redirectUri}?code=fake-${this.provider.toLowerCase()}&state=${encodeURIComponent(state)}`;
  }
  async exchangeCode(_code: string, _redirectUri: string) {
    return { email: `demo.${this.provider.toLowerCase()}@khaibao.local`, tokens: this.tokens() };
  }
  async refresh(_tokens: MailTokens): Promise<MailTokens> {
    return this.tokens();
  }
  private tokens(): MailTokens {
    return { accessToken: "fake-access", refreshToken: "fake-refresh", expiresAt: new Date(this.clock.now().getTime() + 3600_000).toISOString() };
  }

  async listMessages(_tokens: MailTokens, since: Date, limit: number): Promise<RemoteMessage[]> {
    return SAMPLES.map(({ key, hoursAgo, lines: _l, ...m }) => ({ ...m, id: `fake-${this.provider.toLowerCase()}-${key}`, receivedAt: new Date(this.anchor.getTime() - hoursAgo * 3600_000) }))
      .filter((m) => m.receivedAt >= since)
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
      .slice(0, limit);
  }

  async getAttachment(_tokens: MailTokens, messageId: string, attachmentId: string): Promise<Buffer> {
    const s = SAMPLES.find((x) => messageId.endsWith(`-${x.key}`));
    const lines = s?.lines[attachmentId];
    if (!lines) return GIF_1PX;
    return samplePdf(lines);
  }
}

/** PDF 1 trang A4 có chữ (font chuẩn – chỉ ASCII). */
export async function samplePdf(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  lines.forEach((text, i) => page.drawText(text, { x: 50, y: 780 - i * 24, size: i === 0 ? 18 : 11, font }));
  return Buffer.from(await doc.save());
}
