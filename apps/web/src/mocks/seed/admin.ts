// Dữ liệu mẫu back-office. Toàn bộ tên công ty, MST, người, email, IP là GIẢ (IP thuộc dải dành cho tài liệu).
import type { AdminUserSession, PlanCode, Role } from "@kb/contracts";
import type { AdminDb, StoredOrg, StoredPlan, StoredUser } from "../admin/types";
import { isoDay, isoTime } from "./core";

export const DEMO_ORG_ID = "org_anphat";

const PLANS: StoredPlan[] = [
  { code: "TRIAL", name: "Dùng thử", dossiersPerMonth: 10, pagesPerDossier: 20, priceVnd: "0", customPricing: false },
  { code: "BASIC", name: "Cơ bản", dossiersPerMonth: 50, pagesPerDossier: 20, priceVnd: "1490000", customPricing: false },
  { code: "PRO", name: "Chuyên nghiệp", dossiersPerMonth: 150, pagesPerDossier: 40, priceVnd: "3990000", customPricing: false },
  { code: "ENTERPRISE", name: "Doanh nghiệp", dossiersPerMonth: 1000, pagesPerDossier: 80, priceVnd: "12000000", customPricing: true },
];

type OrgSeed = {
  id: string;
  name: string;
  mst: string;
  city: string;
  plan: PlanCode;
  dossiers: number;
  pages: number;
  cost: string;
  createdDays: number;
  renewsIn: number;
  bonus?: number;
  suspended?: string;
  domain: string;
  /** [họ tên, phần trước @, vai trò, giờ từ lần hoạt động cuối (null = chưa đăng nhập), trạng thái] */
  people: [string, string, Role, number | null, StoredUser["status"]?][];
};

const ORGS: OrgSeed[] = [
  {
    id: "org_hoanggia", name: "CÔNG TY CỔ PHẦN DỆT MAY HOÀNG GIA", mst: "0101234567", city: "KCN Phố Nối A, huyện Văn Lâm, tỉnh Hưng Yên",
    plan: "PRO", dossiers: 142, pages: 1630, cost: "412000", createdDays: 210, renewsIn: 11, domain: "hoanggia-demo.vn",
    people: [["Bùi Thị Ngọc Ánh", "anh.bui", "OWNER", 3], ["Đặng Văn Hùng", "hung.dang", "ADMIN", 1], ["Lương Thị Mai", "mai.luong", "DECLARANT", 0.5], ["Tạ Quang Huy", "huy.ta", "APPROVER", 20]],
  },
  {
    id: "org_minhkhang", name: "CÔNG TY CỔ PHẦN XUẤT NHẬP KHẨU MINH KHANG", mst: "0201987654", city: "Số 18 Lê Hồng Phong, quận Ngô Quyền, TP. Hải Phòng",
    plan: "BASIC", dossiers: 51, pages: 498, cost: "131500", createdDays: 95, renewsIn: 4, domain: "minhkhang-demo.vn",
    people: [["Phan Minh Khang", "khang.phan", "OWNER", 6], ["Vũ Thị Hồng Nhung", "nhung.vu", "DECLARANT", 2]],
  },
  {
    id: "org_tanviet", name: "CÔNG TY TNHH LINH KIỆN ĐIỆN TỬ TÂN VIỆT", mst: "0312456789", city: "Khu Công nghệ cao, TP. Thủ Đức, TP. Hồ Chí Minh",
    plan: "ENTERPRISE", dossiers: 388, pages: 5120, cost: "1284000", createdDays: 300, renewsIn: 160, domain: "tanviet-demo.vn",
    people: [["Trịnh Quốc Tân", "tan.trinh", "OWNER", 30], ["Hồ Thị Bích Vân", "van.ho", "ADMIN", 0.3], ["Dương Văn Lộc", "loc.duong", "DECLARANT", 0.2], ["Châu Ngọc Diệp", "diep.chau", "DECLARANT", 4], ["Lâm Thanh Tùng", "tung.lam", "APPROVER", 1], ["Kiều Thị Oanh", "oanh.kieu", "VIEWER", 200]],
  },
  {
    id: "org_songhong", name: "CÔNG TY TNHH THỦY SẢN SÔNG HỒNG", mst: "0801122334", city: "Cụm CN An Đồng, huyện Nam Sách, tỉnh Hải Dương",
    plan: "BASIC", dossiers: 18, pages: 150, cost: "39800", createdDays: 60, renewsIn: 22, domain: "songhong-demo.vn",
    people: [["Ngô Văn Sơn", "son.ngo", "OWNER", 50], ["Trương Thị Yến", "yen.truong", "DECLARANT", 26]],
  },
  {
    id: "org_dailoc", name: "CÔNG TY TNHH NỘI THẤT ĐẠI LỘC", mst: "3702233445", city: "KCN Sóng Thần 2, TP. Dĩ An, tỉnh Bình Dương",
    plan: "TRIAL", dossiers: 7, pages: 61, cost: "16400", createdDays: 9, renewsIn: 5, domain: "dailoc-demo.vn",
    people: [["Huỳnh Đại Lộc", "loc.huynh", "OWNER", 5], ["Mạc Thị Thu", "thu.mac", "DECLARANT", null, "INVITED"]],
  },
  {
    id: "org_phuongnam", name: "CÔNG TY CỔ PHẦN NHỰA PHƯƠNG NAM", mst: "0304455667", city: "KCN Tân Tạo, quận Bình Tân, TP. Hồ Chí Minh",
    plan: "PRO", dossiers: 64, pages: 702, cost: "171000", createdDays: 150, renewsIn: 27, domain: "phuongnam-demo.vn",
    people: [["Lý Phương Nam", "nam.ly", "OWNER", 12], ["Cao Thị Thanh Hằng", "hang.cao", "DECLARANT", 1.5], ["Đoàn Minh Trí", "tri.doan", "APPROVER", 9]],
  },
  {
    id: "org_baotin", name: "CÔNG TY TNHH THƯƠNG MẠI BẢO TÍN", mst: "0105566778", city: "Số 205 Giải Phóng, quận Đống Đa, TP. Hà Nội",
    plan: "BASIC", dossiers: 0, pages: 0, cost: "0", createdDays: 240, renewsIn: -12, suspended: "Quá hạn thanh toán 2 kỳ liên tiếp", domain: "baotin-demo.vn",
    people: [["Tô Bảo Tín", "tin.to", "OWNER", 24 * 16], ["Giang Thị Lan", "lan.giang", "DECLARANT", 24 * 18]],
  },
  {
    id: "org_kimlong", name: "CÔNG TY TNHH CƠ KHÍ KIM LONG", mst: "0700667788", city: "KCN Đồng Văn, thị xã Duy Tiên, tỉnh Hà Nam",
    plan: "TRIAL", dossiers: 2, pages: 14, cost: "4100", createdDays: 3, renewsIn: 11, domain: "kimlong-demo.vn",
    people: [["Thái Kim Long", "long.thai", "OWNER", 8]],
  },
  {
    id: "org_vietuc", name: "CÔNG TY CỔ PHẦN THỰC PHẨM VIỆT ÚC", mst: "0309988776", city: "KCN Vĩnh Lộc, huyện Bình Chánh, TP. Hồ Chí Minh",
    plan: "PRO", dossiers: 97, pages: 1011, cost: "262000", createdDays: 180, renewsIn: 15, bonus: 20, domain: "vietuc-demo.vn",
    people: [["Quách Việt Úc", "uc.quach", "OWNER", 40], ["La Thị Kim Ngân", "ngan.la", "ADMIN", 0.8], ["Từ Hoàng Phúc", "phuc.tu", "DECLARANT", 3]],
  },
  {
    id: "org_thanhcong", name: "CÔNG TY TNHH BAO BÌ THÀNH CÔNG", mst: "3600778899", city: "KCN Amata, TP. Biên Hòa, tỉnh Đồng Nai",
    plan: "BASIC", dossiers: 33, pages: 287, cost: "84000", createdDays: 120, renewsIn: 19, domain: "thanhcong-demo.vn",
    people: [["Văn Thành Công", "cong.van", "OWNER", 28], ["Ông Thị Mỹ Duyên", "duyen.ong", "DECLARANT", 7, "DISABLED"]],
  },
  {
    id: "org_haian", name: "CÔNG TY TNHH HÓA CHẤT HẢI AN", mst: "0200889900", city: "KCN Đình Vũ, quận Hải An, TP. Hải Phòng",
    plan: "TRIAL", dossiers: 10, pages: 96, cost: "25300", createdDays: 12, renewsIn: 2, domain: "haian-demo.vn",
    people: [["Khúc Hải An", "an.khuc", "OWNER", 2], ["Sầm Văn Đạt", "dat.sam", "DECLARANT", 1]],
  },
];

const DEVICES = ["Chrome · Windows", "Edge · Windows", "Safari · iPhone", "Chrome · macOS"];

/** Người hoạt động trong 48 giờ gần đây có 1–2 phiên đăng nhập còn hiệu lực. */
function sessionsFor(userId: string, n: number, lastHours: number | null): AdminUserSession[] {
  if (lastHours === null || lastHours > 48) return [];
  const count = n % 3 === 0 ? 2 : 1;
  return Array.from({ length: count }, (_, i) => ({
    id: `ses_${userId.slice(4)}_${i + 1}`,
    device: DEVICES[(n + i) % DEVICES.length]!,
    ip: `203.0.113.${20 + ((n * 7 + i * 31) % 200)}`,
    lastSeenAt: isoTime(-(lastHours + i * 9)),
  }));
}

function toStored(seeds: OrgSeed[]): { orgs: StoredOrg[]; users: StoredUser[] } {
  const users: StoredUser[] = [];
  const orgs = seeds.map((s, oi): StoredOrg => {
    const plan = PLANS.find((p) => p.code === s.plan)!;
    s.people.forEach(([name, local, role, last, status = "ACTIVE"], pi) => {
      const id = `usr_${s.id.slice(4)}_${pi + 1}`;
      const n = oi * 5 + pi;
      users.push({
        id,
        name,
        email: `${local}@${s.domain}`,
        orgId: s.id,
        role,
        status,
        emailVerified: status !== "INVITED",
        createdAt: isoTime(-24 * Math.max(1, s.createdDays - pi * 6)),
        ...(last !== null ? { lastActiveAt: isoTime(-last) } : {}),
        sessions: status === "ACTIVE" ? sessionsFor(id, n, last) : [],
      });
    });
    return {
      org: {
        id: s.id,
        name: s.name,
        taxCode: s.mst,
        address: s.city,
        phone: `024 3 ${700 + oi * 37} ${100 + oi * 53}`,
        plan: { code: plan.code, name: plan.name, dossiersPerMonth: plan.dossiersPerMonth, pagesPerDossier: plan.pagesPerDossier, renewsAt: isoDay(s.renewsIn) },
        usage: { dossiersThisMonth: s.dossiers, pagesThisMonth: s.pages, aiCostVnd: s.cost },
        suspectThreshold: "BALANCED",
        fourEyes: false,
      },
      meta: {
        status: s.suspended ? "SUSPENDED" : "ACTIVE",
        ...(s.suspended ? { suspendedReason: s.suspended } : {}),
        quotaBonus: s.bonus ?? 0,
        createdAt: isoTime(-24 * s.createdDays),
      },
    };
  });
  return { orgs, users };
}

/** Người đăng ký theo MST đã có, đang chờ Owner duyệt. */
const PENDING: StoredUser[] = [
  { id: "usr_pending_1", name: "Nghiêm Thị Hà Phương", email: "phuong.nghiem@hoanggia-demo.vn", orgId: "org_hoanggia", role: "VIEWER", status: "PENDING_JOIN", emailVerified: true, createdAt: isoTime(-24 * 5), joinRequestedAt: isoTime(-24 * 5), sessions: [] },
  { id: "usr_pending_2", name: "Âu Dương Khải", email: "khai.au@vietuc-demo.vn", orgId: "org_vietuc", role: "VIEWER", status: "PENDING_JOIN", emailVerified: false, createdAt: isoTime(-24 * 4), joinRequestedAt: isoTime(-24 * 4), sessions: [] },
  { id: "usr_pending_3", name: "Mẫn Đức Thịnh", email: "thinh.man@anphat-demo.vn", orgId: DEMO_ORG_ID, role: "VIEWER", status: "PENDING_JOIN", emailVerified: true, createdAt: isoTime(-20), joinRequestedAt: isoTime(-20), sessions: [] },
];

export function seedAdmin(): { admin: AdminDb } {
  const { orgs, users } = toStored(ORGS);
  const staffName = "Hoàng Gia Bảo";
  return {
    admin: {
      currentStaffId: null,
      staff: [
        { id: "stf_bao", name: staffName, email: "bao.hoang@khaibao-demo.vn", role: "SUPER_ADMIN", status: "ACTIVE", lastActiveAt: isoTime(-0.1) },
        { id: "stf_trang", name: "Mai Thị Thu Trang", email: "trang.mai@khaibao-demo.vn", role: "SUPPORT", status: "ACTIVE", lastActiveAt: isoTime(-3) },
        { id: "stf_viet", name: "Đinh Quốc Việt", email: "viet.dinh@khaibao-demo.vn", role: "READONLY", status: "ACTIVE", lastActiveAt: isoTime(-26) },
        { id: "stf_yen", name: "Lý Hải Yến", email: "yen.ly@khaibao-demo.vn", role: "SUPPORT", status: "INVITED" },
      ],
      demoOrgMeta: { status: "ACTIVE", quotaBonus: 0, createdAt: isoTime(-24 * 130) },
      demoUserMeta: {
        usr_chau: { emailVerified: true, createdAt: isoTime(-24 * 128), sessions: [{ id: "ses_chau_1", device: "Chrome · Windows", ip: "198.51.100.24", lastSeenAt: isoTime(-0.2) }, { id: "ses_chau_2", device: "Safari · iPhone", ip: "198.51.100.77", lastSeenAt: isoTime(-14) }] },
        usr_phong: { emailVerified: true, createdAt: isoTime(-24 * 130), sessions: [{ id: "ses_phong_1", device: "Chrome · macOS", ip: "198.51.100.24", lastSeenAt: isoTime(-30) }] },
        usr_ha: { emailVerified: true, createdAt: isoTime(-24 * 110), sessions: [{ id: "ses_ha_1", device: "Edge · Windows", ip: "198.51.100.25", lastSeenAt: isoTime(-2) }] },
        usr_tuan: { emailVerified: true, createdAt: isoTime(-24 * 96), sessions: [{ id: "ses_tuan_1", device: "Chrome · Windows", ip: "198.51.100.26", lastSeenAt: isoTime(-5) }] },
        usr_linh: { emailVerified: false, createdAt: isoTime(-24 * 2), sessions: [] },
        usr_quang: { emailVerified: true, createdAt: isoTime(-24 * 90), sessions: [] },
      },
      orgs,
      users: [...users, ...PENDING],
      plans: PLANS,
      integrations: [
        { id: "AI_PROVIDER", name: "Nhà cung cấp AI (Claude)", description: "Đọc chứng từ scan/ảnh cho mọi doanh nghiệp. Một khóa của bên vận hành, chi phí tính vào gói.", status: "CONNECTED", environment: "PRODUCTION", keyLast4: "x7Qa", keyUpdatedAt: isoTime(-24 * 41), lastCheckedAt: isoTime(-0.2), detail: "Độ trễ trung bình 2,4 giây/trang · 9.870 trang đã đọc tháng này", orgCount: 12 },
        { id: "HSCODEPRO", name: "hscodepro", description: "Gợi ý mã HS, biểu thuế, chính sách quản lý chuyên ngành.", status: "CONNECTED", environment: "PRODUCTION", keyLast4: "9f2c", keyUpdatedAt: isoTime(-24 * 73), lastCheckedAt: isoTime(-0.5), detail: "API /v1/classify · độ trễ trung bình 820 ms", orgCount: 5 },
        { id: "CUSTOMS_HUB", name: "Customs Hub (VNACCS)", description: "Truyền tờ khai IDA/IDC/EDA/EDC, gửi hồ sơ HYS, tra trạng thái IEX.", status: "ERROR", environment: "SANDBOX", keyLast4: "A41e", keyUpdatedAt: isoTime(-24 * 190), lastCheckedAt: isoTime(-1.5), detail: "401 Unauthorized – khóa đã bị nhà cung cấp thu hồi. Cập nhật khóa mới để truyền tờ khai trở lại.", orgCount: 1 },
        { id: "EINVOICE", name: "Tra cứu hóa đơn điện tử", description: "Lấy XML hóa đơn GTGT cước vận chuyển – rẻ và chính xác hơn đọc PDF.", status: "NOT_CONFIGURED", environment: "SANDBOX", orgCount: 0 },
      ],
      brokenKeys: ["CUSTOMS_HUB"],
      services: [
        { id: "POSTGRES", name: "PostgreSQL", status: "UP", detail: "Kết nối 14/100 · truy vấn chậm nhất 38 ms", checkedAt: isoTime(-0.02) },
        { id: "REDIS", name: "Redis (hàng đợi, giới hạn tần suất)", status: "UP", detail: "Bộ nhớ 212 MB / 1 GB", checkedAt: isoTime(-0.02) },
        { id: "STORAGE", name: "Lưu trữ chứng từ", status: "UP", detail: "Đã dùng 48,2 GB · tải lên trung bình 310 ms", checkedAt: isoTime(-0.02) },
        { id: "WORKER", name: "Worker xử lý nền", status: "DEGRADED", detail: "2/3 tiến trình đang chạy · 1 tiến trình khởi động lại 4 lần trong giờ qua", checkedAt: isoTime(-0.02) },
      ],
      queues: [
        { id: "extraction", name: "Đọc chứng từ", waiting: 6, active: 2, failed: 2, completedToday: 418 },
        { id: "hs-classify", name: "Gợi ý mã HS", waiting: 0, active: 1, failed: 0, completedToday: 96 },
        { id: "customs", name: "Truyền Hải quan", waiting: 1, active: 0, failed: 1, completedToday: 23 },
        { id: "mail", name: "Gửi email", waiting: 0, active: 0, failed: 1, completedToday: 57 },
      ],
      failedJobs: [
        { id: "job_8841", queueId: "extraction", queueName: "Đọc chứng từ", kind: "Đọc 1 chứng từ (6 trang)", orgId: "org_tanviet", orgName: "CÔNG TY TNHH LINH KIỆN ĐIỆN TỬ TÂN VIỆT", error: "Nhà cung cấp AI trả 529 (quá tải) – đã thử lại 3 lần", attempts: 3, failedAt: isoTime(-0.7) },
        { id: "job_8829", queueId: "extraction", queueName: "Đọc chứng từ", kind: "Đọc 1 chứng từ (22 trang)", orgId: "org_hoanggia", orgName: "CÔNG TY CỔ PHẦN DỆT MAY HOÀNG GIA", error: "Hết thời gian chờ 120 giây khi đọc trang 17", attempts: 3, failedAt: isoTime(-2.2) },
        { id: "job_8790", queueId: "customs", queueName: "Truyền Hải quan", kind: "Truyền nghiệp vụ IDA", orgId: "org_tanviet", orgName: "CÔNG TY TNHH LINH KIỆN ĐIỆN TỬ TÂN VIỆT", error: "Customs Hub trả 401 Unauthorized", attempts: 1, failedAt: isoTime(-1.4) },
        { id: "job_8702", queueId: "mail", queueName: "Gửi email", kind: "Email mời thành viên", orgId: "org_dailoc", orgName: "CÔNG TY TNHH NỘI THẤT ĐẠI LỘC", error: "SMTP 421 – máy chủ thư tạm từ chối kết nối", attempts: 5, failedAt: isoTime(-9) },
      ],
      skillTemplates: [
        { id: "tpl_inv", code: "SK-INV-GEN", name: "Commercial Invoice – tổng quát", kind: "DOCUMENT", docKind: "INVOICE", version: 7, fieldCount: 34, published: true, orgCount: 12, updatedAt: isoTime(-24 * 6) },
        { id: "tpl_pl", code: "SK-PL-GEN", name: "Packing List – tổng quát", kind: "DOCUMENT", docKind: "PACKING_LIST", version: 4, fieldCount: 18, published: true, orgCount: 12, updatedAt: isoTime(-24 * 20) },
        { id: "tpl_bl", code: "SK-BL-GEN", name: "Bill of Lading – tổng quát", kind: "DOCUMENT", docKind: "BILL_OF_LADING", version: 5, fieldCount: 26, published: true, orgCount: 12, updatedAt: isoTime(-24 * 14) },
        { id: "tpl_awb", code: "SK-AWB-GEN", name: "Air Waybill – tổng quát", kind: "DOCUMENT", docKind: "AIR_WAYBILL", version: 3, fieldCount: 22, published: true, orgCount: 12, updatedAt: isoTime(-24 * 33) },
        { id: "tpl_co", code: "SK-CO-GEN", name: "C/O – form E, D, AK, VK", kind: "DOCUMENT", docKind: "CERT_OF_ORIGIN", version: 2, fieldCount: 15, published: true, orgCount: 12, updatedAt: isoTime(-24 * 48) },
        { id: "tpl_map_ida", code: "SK-MAP-IDA", name: "Ánh xạ tờ khai nhập (IDA)", kind: "MAPPING", version: 9, fieldCount: 112, published: true, orgCount: 12, updatedAt: isoTime(-24 * 3) },
        { id: "tpl_map_eda", code: "SK-MAP-EDA", name: "Ánh xạ tờ khai xuất (EDA)", kind: "MAPPING", version: 6, fieldCount: 87, published: true, orgCount: 12, updatedAt: isoTime(-24 * 11) },
        { id: "tpl_an", code: "SK-AN-GEN", name: "Arrival Notice – tổng quát", kind: "DOCUMENT", docKind: "ARRIVAL_NOTICE", version: 1, fieldCount: 12, published: false, orgCount: 0, updatedAt: isoTime(-24 * 1) },
      ],
      audit: [
        { id: "aud_12", at: isoTime(-3), staffId: "stf_trang", staffName: "Mai Thị Thu Trang", action: "USER_PASSWORD_RESET_SENT", targetType: "USER", targetId: "usr_minhkhang_2", targetLabel: "Vũ Thị Hồng Nhung", orgId: "org_minhkhang", orgName: "CÔNG TY CỔ PHẦN XUẤT NHẬP KHẨU MINH KHANG", reason: "Khách gọi hotline báo quên mật khẩu, không nhận được email tự gửi" },
        { id: "aud_11", at: isoTime(-20), staffId: "stf_bao", staffName, action: "ORG_QUOTA_ADJUSTED", targetType: "ORG", targetId: "org_vietuc", targetLabel: "CÔNG TY CỔ PHẦN THỰC PHẨM VIỆT ÚC", orgId: "org_vietuc", orgName: "CÔNG TY CỔ PHẦN THỰC PHẨM VIỆT ÚC", reason: "Cao điểm hàng Tết, khách đề nghị nới tạm trong lúc chờ nâng gói", detail: "+20 hồ sơ tháng này" },
        { id: "aud_10", at: isoTime(-24 * 2), staffId: "stf_trang", staffName: "Mai Thị Thu Trang", action: "JOB_RETRIED", targetType: "JOB", targetId: "job_8611", targetLabel: "Đọc chứng từ · job_8611", orgId: "org_phuongnam", orgName: "CÔNG TY CỔ PHẦN NHỰA PHƯƠNG NAM", reason: "Nhà cung cấp AI đã hết quá tải, chạy lại theo yêu cầu của khách" },
        { id: "aud_9", at: isoTime(-24 * 3), staffId: "stf_bao", staffName, action: "SKILL_TEMPLATE_PUBLISHED", targetType: "SKILL_TEMPLATE", targetId: "tpl_map_ida", targetLabel: "SK-MAP-IDA v9", reason: "Bổ sung chỉ tiêu phí ngoài cước theo góp ý từ 3 khách hàng" },
        { id: "aud_8", at: isoTime(-24 * 5), staffId: "stf_bao", staffName, action: "STAFF_INVITED", targetType: "STAFF", targetId: "stf_yen", targetLabel: "Lý Hải Yến", reason: "Mời quản trị viên mới", detail: "Vai trò Hỗ trợ" },
        { id: "aud_7", at: isoTime(-24 * 8), staffId: "stf_trang", staffName: "Mai Thị Thu Trang", action: "USER_DISABLED", targetType: "USER", targetId: "usr_thanhcong_2", targetLabel: "Ông Thị Mỹ Duyên", orgId: "org_thanhcong", orgName: "CÔNG TY TNHH BAO BÌ THÀNH CÔNG", reason: "Chủ doanh nghiệp báo nhân viên đã nghỉ việc, cần khóa ngay" },
        { id: "aud_6", at: isoTime(-24 * 12), staffId: "stf_bao", staffName, action: "ORG_SUSPENDED", targetType: "ORG", targetId: "org_baotin", targetLabel: "CÔNG TY TNHH THƯƠNG MẠI BẢO TÍN", orgId: "org_baotin", orgName: "CÔNG TY TNHH THƯƠNG MẠI BẢO TÍN", reason: "Quá hạn thanh toán 2 kỳ liên tiếp" },
        { id: "aud_5", at: isoTime(-24 * 19), staffId: "stf_bao", staffName, action: "ANNOUNCEMENT_SENT", targetType: "ANNOUNCEMENT", targetId: "ann_1", targetLabel: "Bổ sung đọc Arrival Notice", reason: "Gửi thông báo hệ thống", detail: "Gửi mọi doanh nghiệp" },
        { id: "aud_4", at: isoTime(-24 * 27), staffId: "stf_bao", staffName, action: "ORG_PLAN_CHANGED", targetType: "ORG", targetId: "org_hoanggia", targetLabel: "CÔNG TY CỔ PHẦN DỆT MAY HOÀNG GIA", orgId: "org_hoanggia", orgName: "CÔNG TY CỔ PHẦN DỆT MAY HOÀNG GIA", reason: "Khách ký phụ lục nâng gói", detail: "Cơ bản → Chuyên nghiệp" },
        { id: "aud_3", at: isoTime(-24 * 41), staffId: "stf_bao", staffName, action: "INTEGRATION_KEY_UPDATED", targetType: "INTEGRATION", targetId: "AI_PROVIDER", targetLabel: "Nhà cung cấp AI (Claude)", reason: "Xoay vòng khóa định kỳ theo quy định bảo mật", detail: "Khóa mới kết thúc bằng x7Qa" },
        { id: "aud_2", at: isoTime(-24 * 60), staffId: "stf_bao", staffName, action: "PLAN_UPDATED", targetType: "PLAN", targetId: "BASIC", targetLabel: "Gói Cơ bản", reason: "Điều chỉnh bảng giá quý IV", detail: "Giá 1.290.000 → 1.490.000 VND" },
        { id: "aud_1", at: isoTime(-24 * 90), staffId: "stf_bao", staffName, action: "ORG_TRIAL_EXTENDED", targetType: "ORG", targetId: "org_songhong", targetLabel: "CÔNG TY TNHH THỦY SẢN SÔNG HỒNG", orgId: "org_songhong", orgName: "CÔNG TY TNHH THỦY SẢN SÔNG HỒNG", reason: "Khách chưa kịp thử đủ luồng do nghỉ lễ", detail: "+14 ngày dùng thử" },
      ],
      announcements: [
        { id: "ann_1", title: "Bổ sung đọc Arrival Notice", body: "Từ tuần này hệ thống đọc được Arrival Notice và tự lấy cước, phí nước ngoài để cộng trị giá tính thuế khi điều kiện giao hàng là EXW/FCA/FOB.", kind: "INFO", audience: "ALL", status: "SENT", sentAt: isoTime(-24 * 19), sentByName: staffName, recipients: 11 },
        { id: "ann_0", title: "Bảo trì hệ thống đêm thứ Bảy", body: "Hệ thống tạm ngưng từ 23:00 đến 23:45 để nâng cấp cơ sở dữ liệu. Hồ sơ đang xử lý sẽ tự chạy tiếp sau bảo trì.", kind: "MAINTENANCE", audience: "ALL", maintenanceDate: isoDay(-34), status: "SENT", sentAt: isoTime(-24 * 37), sentByName: staffName, recipients: 10 },
      ],
      announcementNotifications: {},
    },
  };
}
