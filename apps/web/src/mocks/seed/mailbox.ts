// Hộp thư chứng từ mẫu: một hộp Gmail đã kết nối + vài email chứng từ của forwarder / nhà cung cấp.
// Tên công ty, địa chỉ email, số chứng từ đều GIẢ. Email trỏ tới hồ sơ mẫu qua mã hồ sơ / số vận đơn / tên đối tác
// để màn Hộp thư chứng từ hiện gợi ý hồ sơ.
import { DEFAULT_MAIL_FILTERS, type DocKind, type InboxAttachment, type InboxMessage, type MailConnection } from "@kb/contracts";
import type { Dossier } from "../types";
import { isoTime } from "./core";

/** Kết nối hộp thư trong mock: tên người kết nối lấy từ danh sách thành viên lúc đọc; `syncStartedAt` mô phỏng đang lấy thư. */
export type MockMailConnection = Omit<MailConnection, "connectedByName"> & { syncStartedAt: string | null };
export type MockInboxAttachment = Omit<InboxAttachment, "dossierCode">;
/** Email trong mock: gợi ý hồ sơ tính lại mỗi lần đọc (theo hồ sơ hiện có), giống backend. */
export type MockInboxMessage = Omit<InboxMessage, "attachments" | "suggestion"> & { attachments: MockInboxAttachment[] };

export const SEED_CONNECTION_ID = "mcn_seed_gmail";
const MAILBOX = "chungtu.anphat@gmail.com";

type FileSeed = [fileName: string, kind: DocKind, size: number, dossierId?: string];
type MessageSeed = Omit<MockInboxMessage, "id" | "connectionId" | "provider" | "mailbox" | "attachments" | "receivedAt"> & { hoursAgo: number; files: FileSeed[] };

function build(id: string, s: MessageSeed): MockInboxMessage {
  const { hoursAgo, files, ...rest } = s;
  return {
    ...rest,
    id,
    connectionId: SEED_CONNECTION_ID,
    provider: "GMAIL",
    mailbox: MAILBOX,
    receivedAt: isoTime(-hoursAgo),
    attachments: files.map(([fileName, kindGuess, size, dossierId], i) => ({
      id: `${id}_att${i + 1}`,
      fileName,
      mime: fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : fileName.toLowerCase().endsWith(".zip") ? "application/zip" : "image/jpeg",
      size,
      kindGuess,
      status: dossierId ? "ADDED" : "PENDING",
      dossierId: dossierId ?? null,
    })),
  };
}

const codeOf = (dossiers: Dossier[], id: string) => dossiers.find((d) => d.id === id)?.code ?? id;

export function seedMailbox(dossiers: Dossier[]) {
  const connection: MockMailConnection = {
    id: SEED_CONNECTION_ID,
    provider: "GMAIL",
    email: MAILBOX,
    status: "ACTIVE",
    lastSyncedAt: isoTime(-2),
    lastSyncCount: 3,
    lastError: null,
    connectedBy: "usr_ha",
    createdAt: isoTime(-24 * 12),
    syncStartedAt: null,
    filters: DEFAULT_MAIL_FILTERS,
  };
  const messages: MockInboxMessage[] = [
    // Forwarder gửi bộ chứng từ, tiêu đề có mã hồ sơ → gợi ý "Trùng mã hồ sơ".
    build("imsg_seed_1", {
      fromName: "Sao Việt Logistics – Ops",
      fromEmail: "ops@saovietlogistics.vn",
      subject: `[${codeOf(dossiers, "dos_027")}] Chứng từ lô hàng Dongguan Changli – Invoice, Packing List, HBL`,
      snippet: "Chào chị Hà, bên em gửi bộ chứng từ lô hàng về cảng Hải Phòng dự kiến ngày 28/10. Nhờ chị kiểm tra và lên tờ khai giúp em…",
      status: "NEW",
      hoursAgo: 2.5,
      files: [
        ["INVOICE_DGCL-2610-118.pdf", "INVOICE", 284_310],
        ["PACKING_LIST_DGCL-2610-118.pdf", "PACKING_LIST", 162_904],
        ["HBL_OOLU2741199012.pdf", "BILL_OF_LADING", 401_772],
      ],
    }),
    // Pre-alert hàng air, số vận đơn trùng hồ sơ đang xử lý → gợi ý "Trùng số vận đơn".
    build("imsg_seed_2", {
      fromName: "Sky Bridge Air Cargo",
      fromEmail: "prealert@skybridge-cargo.com",
      subject: "Pre-alert MAWB 618-44021375 / NRT-HAN – revised CI & PL",
      snippet: "Dear team, please find attached the revised commercial invoice and packing list for shipment MAWB 618-44021375, ETA Noi Bai 24 Oct…",
      status: "NEW",
      hoursAgo: 6,
      files: [
        ["MAWB_618-44021375.pdf", "AIR_WAYBILL", 233_120],
        ["CI_MBT-26-0915_revised.pdf", "INVOICE", 198_440],
        ["PL_MBT-26-0915_revised.pdf", "PACKING_LIST", 121_006],
      ],
    }),
    // Nhà cung cấp gửi trực tiếp, tên khớp đối tác của hồ sơ → gợi ý "Cùng đối tác".
    build("imsg_seed_3", {
      fromName: "Hiwin Supply – Export Dept.",
      fromEmail: "export@hiwin-supply.com.tw",
      subject: "Shipping documents for PO AP-2610-087 (linear guides)",
      snippet: "Dear Ms. Chau, attached are the commercial invoice and C/O Form E for PO AP-2610-087. The goods were handed over to the airline yesterday…",
      status: "NEW",
      hoursAgo: 20,
      files: [
        ["Commercial_Invoice_HW26-1043.pdf", "INVOICE", 176_552],
        ["CO_FORM_E_E26TW-0081932.pdf", "CERT_OF_ORIGIN", 254_018],
      ],
    }),
    // Đã xếp hết file vào hồ sơ.
    build("imsg_seed_4", {
      fromName: "Shenzhen Kaida Motor – Sales",
      fromEmail: "sales@kaidamotor.cn",
      subject: "Documents for B/L COSU6402215870",
      snippet: "Dear customer, the original documents for B/L COSU6402215870 have been couriered. Scanned copies are attached for your customs clearance…",
      status: "DONE",
      hoursAgo: 24 * 3,
      files: [
        ["INV_023.pdf", "INVOICE", 412_330, "dos_023"],
        ["PL_023.pdf", "PACKING_LIST", 188_204, "dos_023"],
        ["BL_COSU6402215870.pdf", "BILL_OF_LADING", 655_120, "dos_023"],
      ],
    }),
    // Không phải chứng từ của lô hàng nào → người dùng đã bỏ qua.
    build("imsg_seed_5", {
      fromName: "Sao Việt Logistics – Sales",
      fromEmail: "sales@saovietlogistics.vn",
      subject: "Bảng giá cước tháng 11/2026",
      snippet: "Kính gửi Quý khách, Sao Việt Logistics trân trọng gửi bảng giá cước biển và hàng air áp dụng từ 01/11/2026…",
      status: "IGNORED",
      hoursAgo: 30,
      files: [["Rate_sheet_Nov2026.pdf", "OTHER", 98_220]],
    }),
    // Nhà cung cấp mới, chưa có hồ sơ khớp → không có gợi ý.
    build("imsg_seed_6", {
      fromName: "Ningbo Ever-Bright Industrial",
      fromEmail: "lily.zhang@nb-everbright.cn",
      subject: "Proforma invoice PI-NB-24117 – deep groove ball bearings",
      snippet: "Hello, as discussed please see our proforma invoice and sales contract for 12,000 pcs bearings. Kindly arrange the deposit…",
      status: "NEW",
      hoursAgo: 46,
      files: [
        ["PI-NB-24117.pdf", "INVOICE", 142_660],
        ["Sales_Contract_NB-24117.pdf", "SALES_CONTRACT", 310_404],
      ],
    }),
  ];
  return { mailConnections: [connection], inboxMessages: messages, inboxDemoBatchDelivered: false };
}

/** Email mới "lấy về" ở lần bấm lấy thư đầu tiên trong mock (cố định để demo lặp lại được). */
export function demoSyncBatch(conn: Pick<MockMailConnection, "id" | "provider" | "email">, startedAt: number): MockInboxMessage[] {
  const at = (minutesAgo: number) => new Date(startedAt - minutesAgo * 60_000).toISOString();
  const base = { connectionId: conn.id, provider: conn.provider, mailbox: conn.email, status: "NEW" as const };
  const att = (id: string, i: number, fileName: string, kindGuess: DocKind, size: number): MockInboxAttachment => ({
    id: `${id}_att${i}`, fileName, mime: "application/pdf", size, kindGuess, status: "PENDING", dossierId: null,
  });
  return [
    {
      ...base,
      id: "imsg_demo_1",
      fromName: "ONE Line – Booking Hai Phong",
      fromEmail: "booking.hph@one-line-demo.com",
      subject: "Booking confirmation & draft B/L ONEYHPHA0921",
      snippet: "Dear shipper, please check the draft B/L for booking ONEYHPHA0921 and confirm before the cut-off time on Friday…",
      receivedAt: at(12),
      attachments: [att("imsg_demo_1", 1, "Draft_BL_ONEYHPHA0921.pdf", "BILL_OF_LADING", 288_904), att("imsg_demo_1", 2, "Booking_ONEYHPHA0921.pdf", "OTHER", 96_120)],
    },
    {
      ...base,
      id: "imsg_demo_2",
      fromName: "Shenzhen Kaida Motor – Sales",
      fromEmail: "sales@kaidamotor.cn",
      subject: "Invoice & packing list – next shipment of AC motors",
      snippet: "Dear customer, attached please find the invoice and packing list for the next shipment. Vessel ETD Shekou 26 Oct…",
      receivedAt: at(40),
      attachments: [att("imsg_demo_2", 1, "INV_KD2610-552.pdf", "INVOICE", 201_334), att("imsg_demo_2", 2, "PL_KD2610-552.pdf", "PACKING_LIST", 133_870)],
    },
  ];
}
