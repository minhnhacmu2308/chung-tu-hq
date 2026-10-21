// Dữ liệu mẫu cốt lõi: doanh nghiệp, thành viên, hồ sơ, chứng từ, thông báo.
// Toàn bộ tên công ty/MST là GIẢ. Ngày tính theo hôm nay để màn hình luôn "sống" (sắp hạn, quá hạn…).
import { DEFAULT_PARTY_CLASS } from "@kb/contracts";
import type { DocKind, Dossier, DossierDocument, DossierStatus, Member, Notification, Organization, StepId } from "../types";

export const DAY = 86_400_000;
export const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
export const isoTime = (offsetHours: number) => new Date(Date.now() + offsetHours * 3_600_000).toISOString();

/** Hồ sơ trình diễn đầy đủ nhất – mở hồ sơ này để xem trọn 6 bước. */
export const SHOWCASE_DOSSIER_ID = "dos_021";

const ORG: Organization = {
  id: "org_anphat",
  name: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT",
  taxCode: "0316789012",
  address: "Lô B4, KCN Tràng Duệ, xã Lê Lợi, huyện An Dương, TP. Hải Phòng",
  phone: "0225 3 888 123",
  postalCode: "180000",
  plan: { code: "PRO", name: "Chuyên nghiệp", dossiersPerMonth: 150, pagesPerDossier: 40, renewsAt: isoDay(19) },
  usage: { dossiersThisMonth: 37, pagesThisMonth: 412, aiCostVnd: "96500" },
  suspectThreshold: "BALANCED",
  fourEyes: false,
};

const MEMBERS: Member[] = [
  { id: "usr_chau", name: "Lê Minh Châu", email: "chau.le@anphat-demo.vn", role: "ADMIN", status: "ACTIVE", lastActiveAt: isoTime(-0.2) },
  { id: "usr_phong", name: "Trần Văn Phong", email: "phong.tran@anphat-demo.vn", role: "OWNER", status: "ACTIVE", lastActiveAt: isoTime(-30) },
  { id: "usr_ha", name: "Nguyễn Thu Hà", email: "ha.nguyen@anphat-demo.vn", role: "DECLARANT", status: "ACTIVE", lastActiveAt: isoTime(-2) },
  { id: "usr_tuan", name: "Phạm Anh Tuấn", email: "tuan.pham@anphat-demo.vn", role: "APPROVER", status: "ACTIVE", lastActiveAt: isoTime(-5) },
  { id: "usr_linh", name: "Đỗ Khánh Linh", email: "linh.do@anphat-demo.vn", role: "DECLARANT", status: "INVITED" },
  { id: "usr_quang", name: "Vũ Đức Quang", email: "quang.vu@anphat-demo.vn", role: "VIEWER", status: "DISABLED", lastActiveAt: isoTime(-24 * 40) },
];

type DossierSeed = {
  n: number;
  dir: "NK" | "XK";
  type: string;
  partner: string;
  status: DossierStatus;
  step: StepId;
  due: number; // ngày so với hôm nay
  created: number; // giờ so với hiện tại
  value: string;
  cur?: string;
  inc: string;
  mode: Dossier["transportMode"];
  bill: string;
  suspect?: number;
  owner?: string;
  decl?: string;
  channel?: "GREEN" | "YELLOW" | "RED";
  note?: string;
};

const OFFICE_HP = "03CE – Chi cục HQ cửa khẩu cảng Hải Phòng KV III";
const OFFICE_NB = "01B1 – Chi cục HQ cửa khẩu sân bay Nội Bài";
const OFFICE_CL = "02CI – Chi cục HQ cửa khẩu cảng Sài Gòn KV I";

const DOSSIERS: DossierSeed[] = [
  { n: 21, dir: "NK", type: "A11", partner: "HANSOL PRECISION CO., LTD.", status: "NEEDS_REVIEW", step: "ocr", due: 1, created: -26, value: "20850.00", inc: "FCA", mode: "SEA_CONTAINER", bill: "HPSEL2610078", suspect: 16, owner: "usr_chau", note: "PO AP-2609-114 · hàng về cảng Tân Vũ" },
  { n: 22, dir: "NK", type: "A11", partner: "MORINAGA BEARING TRADING", status: "PROCESSING", step: "upload", due: 3, created: -3, value: "8340.50", inc: "CIF", mode: "AIR", bill: "618-44021375", owner: "usr_ha" },
  { n: 23, dir: "NK", type: "E21", partner: "SHENZHEN KAIDA MOTOR CO., LTD.", status: "NEEDS_REVIEW", step: "review", due: 0, created: -50, value: "46215.00", inc: "FOB", mode: "SEA_CONTAINER", bill: "COSU6402215870", suspect: 2, owner: "usr_ha" },
  { n: 24, dir: "NK", type: "A12", partner: "ARTEMIDE INDUSTRIALE S.P.A.", status: "APPROVED", step: "submit", due: 2, created: -70, value: "12980.00", cur: "EUR", inc: "EXW", mode: "SEA_CONTAINER", bill: "MEDUJ1182044", owner: "usr_chau" },
  { n: 25, dir: "XK", type: "B11", partner: "NORDIC TOOLING GROUP AB", status: "NEEDS_REVIEW", step: "ocr", due: -1, created: -40, value: "31500.00", inc: "FOB", mode: "SEA_CONTAINER", bill: "ONEYHPHA0921", suspect: 5, owner: "usr_ha" },
  { n: 26, dir: "NK", type: "A11", partner: "TAIWAN HIWIN SUPPLY CO.", status: "PROCESSING", step: "agent", due: 4, created: -20, value: "5620.00", inc: "CIF", mode: "AIR", bill: "297-11820455", owner: "usr_chau" },
  { n: 27, dir: "NK", type: "A11", partner: "DONGGUAN CHANGLI TRADING", status: "DRAFT", step: "upload", due: 6, created: -1, value: "0", inc: "CIF", mode: "SEA_CONTAINER", bill: "", owner: "usr_ha" },
  { n: 18, dir: "NK", type: "A11", partner: "KOREA LINEAR SYSTEM INC.", status: "CLEARED", step: "submit", due: -6, created: -24 * 9, value: "17420.00", inc: "CIF", mode: "SEA_CONTAINER", bill: "HDMUPUSA4471", decl: "107621548840", channel: "GREEN", owner: "usr_chau" },
  { n: 19, dir: "NK", type: "E21", partner: "SHENZHEN KAIDA MOTOR CO., LTD.", status: "SUBMITTED", step: "submit", due: -2, created: -24 * 5, value: "38900.00", inc: "FOB", mode: "SEA_CONTAINER", bill: "COSU6401998211", decl: "107624410320", channel: "YELLOW", owner: "usr_ha" },
  { n: 20, dir: "XK", type: "B11", partner: "PACIFIC MACHINERY PTE. LTD.", status: "CLEARED", step: "submit", due: -4, created: -24 * 7, value: "22750.00", inc: "FOB", mode: "SEA_CONTAINER", bill: "SITGHPSG8812", decl: "307582210050", channel: "GREEN", owner: "usr_tuan" },
  { n: 17, dir: "NK", type: "A11", partner: "ARTEMIDE INDUSTRIALE S.P.A.", status: "CLEARED", step: "submit", due: -9, created: -24 * 12, value: "9310.00", cur: "EUR", inc: "EXW", mode: "AIR", bill: "020-55109843", decl: "107598830110", channel: "RED", owner: "usr_chau" },
  { n: 16, dir: "NK", type: "A11", partner: "HANSOL PRECISION CO., LTD.", status: "CLEARED", step: "submit", due: -12, created: -24 * 15, value: "15880.00", inc: "FCA", mode: "SEA_CONTAINER", bill: "HPSEL2609044", decl: "107571209960", channel: "GREEN", owner: "usr_ha" },
  { n: 15, dir: "XK", type: "B11", partner: "NORDIC TOOLING GROUP AB", status: "CANCELLED", step: "ocr", due: -14, created: -24 * 18, value: "4100.00", inc: "FOB", mode: "AIR", bill: "", owner: "usr_ha", note: "Khách hủy đơn" },
  { n: 14, dir: "NK", type: "A41", partner: "MORINAGA BEARING TRADING", status: "CLEARED", step: "submit", due: -17, created: -24 * 21, value: "6670.00", inc: "CIF", mode: "AIR", bill: "618-43988120", decl: "107549902270", channel: "GREEN", owner: "usr_chau" },
  // Hồ sơ cũ (đã xong) – đủ dữ liệu để thử phân trang, lọc, tìm kiếm.
  { n: 13, dir: "XK", type: "B11", partner: "PACIFIC MACHINERY PTE. LTD.", status: "CLEARED", step: "submit", due: -19, created: -24 * 23, value: "18640.00", inc: "FOB", mode: "SEA_CONTAINER", bill: "SITGHPSG8790", decl: "307561004410", channel: "GREEN", owner: "usr_tuan" },
  { n: 12, dir: "NK", type: "E21", partner: "SHENZHEN KAIDA MOTOR CO., LTD.", status: "CLEARED", step: "submit", due: -21, created: -24 * 25, value: "41230.00", inc: "FOB", mode: "SEA_CONTAINER", bill: "COSU6401770452", decl: "107530118870", channel: "YELLOW", owner: "usr_ha" },
  { n: 11, dir: "NK", type: "A11", partner: "TAIWAN HIWIN SUPPLY CO.", status: "CLEARED", step: "submit", due: -24, created: -24 * 27, value: "7215.00", inc: "CIF", mode: "AIR", bill: "297-11788120", decl: "107512238450", channel: "GREEN", owner: "usr_chau" },
  { n: 10, dir: "NK", type: "A12", partner: "ARTEMIDE INDUSTRIALE S.P.A.", status: "CLEARED", step: "submit", due: -26, created: -24 * 30, value: "11050.00", cur: "EUR", inc: "EXW", mode: "SEA_CONTAINER", bill: "MEDUJ1170932", decl: "107498870120", channel: "GREEN", owner: "usr_chau" },
  { n: 9, dir: "XK", type: "B11", partner: "NORDIC TOOLING GROUP AB", status: "CLEARED", step: "submit", due: -28, created: -24 * 32, value: "26800.00", inc: "FOB", mode: "SEA_CONTAINER", bill: "ONEYHPHA0874", decl: "307540098230", channel: "GREEN", owner: "usr_ha" },
  { n: 8, dir: "NK", type: "A31", partner: "KOREA LINEAR SYSTEM INC.", status: "CLEARED", step: "submit", due: -31, created: -24 * 35, value: "3480.00", inc: "CIF", mode: "AIR", bill: "180-22104536", decl: "107481120340", channel: "RED", owner: "usr_ha" },
  { n: 7, dir: "NK", type: "A11", partner: "DONGGUAN CHANGLI TRADING", status: "CLEARED", step: "submit", due: -33, created: -24 * 37, value: "9920.00", inc: "CIF", mode: "SEA_CONTAINER", bill: "OOLU2741188530", decl: "107470035560", channel: "GREEN", owner: "usr_chau" },
  { n: 6, dir: "XK", type: "B13", partner: "PACIFIC MACHINERY PTE. LTD.", status: "CLEARED", step: "submit", due: -36, created: -24 * 40, value: "1950.00", inc: "EXW", mode: "ROAD", bill: "", decl: "307519987010", channel: "GREEN", owner: "usr_tuan" },
  { n: 5, dir: "NK", type: "G11", partner: "HANSOL PRECISION CO., LTD.", status: "CLEARED", step: "submit", due: -40, created: -24 * 44, value: "5300.00", inc: "FCA", mode: "SEA_CONTAINER", bill: "HPSEL2608102", decl: "107452209980", channel: "YELLOW", owner: "usr_ha" },
  { n: 4, dir: "NK", type: "A11", partner: "MORINAGA BEARING TRADING", status: "CANCELLED", step: "upload", due: -42, created: -24 * 46, value: "0", inc: "CIF", mode: "AIR", bill: "", owner: "usr_chau", note: "Tạo trùng với HS-NK-…-014" },
  { n: 3, dir: "NK", type: "E21", partner: "SHENZHEN KAIDA MOTOR CO., LTD.", status: "CLEARED", step: "submit", due: -45, created: -24 * 49, value: "36475.00", inc: "FOB", mode: "SEA_CONTAINER", bill: "COSU6401502281", decl: "107433370610", channel: "GREEN", owner: "usr_ha" },
];

const PAD = (n: number) => String(n).padStart(3, "0");

function toDossier(s: DossierSeed): Dossier {
  const month = isoDay(s.created / 24).slice(2, 7).replace("-", "");
  return {
    id: `dos_${PAD(s.n)}`,
    code: `HS-${s.dir}-${month}-${PAD(s.n)}`,
    direction: s.dir,
    typeCode: s.type,
    partner: s.partner,
    customsOffice: s.mode === "AIR" ? OFFICE_NB : s.n % 5 === 0 ? OFFICE_CL : OFFICE_HP,
    skillSetId: "default",
    status: s.status,
    step: s.step,
    dueDate: isoDay(s.due),
    createdAt: isoTime(s.created),
    updatedAt: isoTime(Math.min(-0.3, s.created / 3)),
    ownerId: s.owner ?? "usr_chau",
    invoiceValue: s.value,
    currency: s.cur ?? "USD",
    incoterm: s.inc,
    transportMode: s.mode,
    partyClass: DEFAULT_PARTY_CLASS,
    billNo: s.bill,
    suspectFields: s.suspect ?? 0,
    ...(s.note ? { note: s.note } : {}),
    ...(s.decl ? { declarationNo: s.decl } : {}),
    ...(s.channel ? { channel: s.channel } : {}),
  };
}

/** Bộ chứng từ mặc định theo phương thức vận chuyển. */
function docsFor(d: Dossier): DossierDocument[] {
  if (d.status === "DRAFT") return [];
  const code = d.code.split("-").pop();
  const bill: DocKind = d.transportMode === "AIR" ? "AIR_WAYBILL" : "BILL_OF_LADING";
  const set: [DocKind, string, number, number][] = [
    ["INVOICE", `INV_${code}.pdf`, 2, 412_330],
    ["PACKING_LIST", `PL_${code}.pdf`, 1, 188_204],
    [bill, `${bill === "AIR_WAYBILL" ? "AWB" : "BL"}_${d.billNo || code}.pdf`, 2, 655_120],
  ];
  if (d.direction === "NK" && d.id === SHOWCASE_DOSSIER_ID) {
    set.push(["CERT_OF_ORIGIN", "CO_FORM_AK_KR2610-0457.pdf", 1, 301_877]);
    set.push(["ARRIVAL_NOTICE", "ARRIVAL_NOTICE_HPSEL2610078.pdf", 1, 120_440]);
    set.push(["FREIGHT_INVOICE", "HD_GTGT_CUOC_0004512.pdf", 1, 96_310]);
  }
  const uploading = d.status === "PROCESSING" && d.step === "upload";
  return set.map(([kind, fileName, pages, size], i) => ({
    id: `doc_${d.id.slice(4)}_${i + 1}`,
    dossierId: d.id,
    kind,
    fileName,
    pages,
    sizeBytes: size,
    status: uploading ? (i === 0 ? "DONE" : i === 1 ? "READING" : "QUEUED") : "DONE",
    uploadedAt: isoTime(-1),
  }));
}

const notificationsFor = (dossiers: Dossier[]): Notification[] => [
  { id: "ntf_1", title: `${dossiers.find((d) => d.id === SHOWCASE_DOSSIER_ID)?.code} cần kiểm tra`, body: "16 trường nghi ngờ trên 6 chứng từ. Thiếu cước vận chuyển (FCA).", at: isoTime(-0.5), read: false, href: `/dossiers/${SHOWCASE_DOSSIER_ID}` },
  { id: "ntf_2", title: "Phân luồng vàng", body: "Tờ khai 107624410320 được phân luồng vàng – kiểm tra hồ sơ giấy.", at: isoTime(-6), read: false, href: "/dossiers/dos_019" },
  { id: "ntf_3", title: "Đã thông quan", body: "Tờ khai 107621548840 đã được thông quan.", at: isoTime(-30), read: true, href: "/dossiers/dos_018" },
];

export function seedCore() {
  const dossiers = DOSSIERS.map(toDossier).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    currentUserId: "usr_chau",
    org: ORG,
    members: MEMBERS,
    dossiers,
    documents: dossiers.flatMap(docsFor),
    notifications: notificationsFor(dossiers),
  };
}
