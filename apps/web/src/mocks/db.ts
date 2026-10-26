// "Cơ sở dữ liệu" giả trong trình duyệt: seed → bộ nhớ → lưu localStorage để F5 không mất thao tác.
// Chỉ src/api/* được import file này. Màn hình KHÔNG import trực tiếp mocks/db.
import type {
  AgentRun, CrossCheck, CustomsResult, Declaration, DigitalCertificate, Dossier, DossierDocument,
  ExtractedField, Integration, LineItem, Member, Notification, Organization, Skill,
} from "./types";
import type { DeclarationProfile, JoinRequest, PostAmendment, ProductCatalogItem, ValueCharges } from "@kb/contracts";
import { seedCore } from "./seed/core";
import { seedOcr } from "./seed/ocr";
import { seedDeclaration } from "./seed/declaration";
import { seedCustoms } from "./seed/customs";
import { seedSkills } from "./seed/skills";
import { seedSettings } from "./seed/settings";
import { seedAdmin } from "./seed/admin";
import { seedProducts } from "./seed/products";
import { seedMailbox, type MockInboxMessage, type MockMailConnection } from "./seed/mailbox";
import type { AdminDb } from "./admin/types";
import type { BranchMessage, CustomsFlow } from "./customs-sim";
import type { SkillSuggestion } from "@kb/contracts";

export type MockDb = {
  version: number;
  currentUserId: string;
  org: Organization;
  members: Member[];
  /** Yêu cầu tham gia đang chờ duyệt (duyệt → thành viên; từ chối → bỏ khỏi danh sách). */
  joinRequests: JoinRequest[];
  dossiers: Dossier[];
  documents: DossierDocument[];
  fields: ExtractedField[];
  checks: CrossCheck[];
  lineItems: LineItem[];
  agentRuns: AgentRun[];
  declarations: Declaration[];
  customsMessages: BranchMessage[];
  customsResults: CustomsResult[];
  /** Kết quả Hải quan của tờ khai nhánh k ≥ 2 (khóa `<id hồ sơ>:<k>`); tờ 1 nằm ở customsResults. */
  customsBranchResults: Record<string, CustomsResult>;
  /** Giai đoạn luồng nghiệp vụ Hải quan theo hồ sơ (xem mocks/customs-sim CustomsFlow). */
  customsFlows: Record<string, CustomsFlow>;
  /** Bản khai bổ sung sau thông quan (AMA) – bản riêng, không sửa tờ khai gốc. */
  postAmendments: PostAmendment[];
  skills: Skill[];
  /** Gợi ý thêm nhãn cho trường của skill (sinh khi người dùng chỉ/sửa giá trị trên file). */
  skillSuggestions: SkillSuggestion[];
  /** Skill đã đổi cấu hình sau lần đọc gần nhất của chứng từ đang mở → gợi ý đọc lại. */
  staleSkills: string[];
  /** Danh mục hàng hóa của doanh nghiệp (mặt hàng đã khai). */
  products: ProductCatalogItem[];
  integrations: Integration[];
  /** Hộp thư Gmail / Outlook đã kết nối (Hộp thư chứng từ). */
  mailConnections: MockMailConnection[];
  /** Email chứng từ đã lấy về. */
  inboxMessages: MockInboxMessage[];
  /** Lần lấy thư đầu tiên đã "nhận" lô email mẫu chưa (lần sau không có email mới). */
  inboxDemoBatchDelivered: boolean;
  certificates: DigitalCertificate[];
  /** Tài khoản VNACCS (chỉ phần không bí mật – mật khẩu/terminal key không bao giờ ở trình duyệt). */
  vnaccsAccount: { userId: string; terminalId: string; updatedAt: string } | null;
  /** Mặc định khai báo theo chiều NK/XK. */
  declarationProfiles: Partial<Record<"NK" | "XK", DeclarationProfile>>;
  /** Chi phí và điều chỉnh trị giá người khai nhập (bước OCR & kiểm tra) theo hồ sơ. */
  valueCharges: Record<string, { data: ValueCharges; updatedAt: string; updatedBy: string }>;
  notifications: Notification[];
  /** Back-office của bên vận hành (màn /admin). */
  admin: AdminDb;
};

/** Tăng khi đổi cấu trúc seed → dữ liệu cũ trong localStorage tự bị bỏ. */
const DB_VERSION = 28;
const STORAGE_KEY = "kb-mock-db";

function createSeed(): MockDb {
  const core = seedCore();
  const declaration = seedDeclaration(core.dossiers);
  const ocr = seedOcr(core.dossiers, core.documents, declaration.lineItems);
  // Bản sao sâu: seed dùng hằng số cấp module (doanh nghiệp, thành viên, gói…) – nếu trả thẳng tham chiếu thì
  // thao tác của người dùng sửa luôn hằng số và "Khôi phục dữ liệu mẫu" không còn về đúng dữ liệu ban đầu.
  return structuredClone({
    version: DB_VERSION,
    ...core,
    ...ocr,
    ...declaration,
    ...seedCustoms(core.dossiers),
    customsBranchResults: {},
    postAmendments: [],
    products: seedProducts(),
    ...seedMailbox(core.dossiers),
    valueCharges: {},
    ...seedSkills(),
    ...seedSettings(),
    ...seedAdmin(),
  });
}

let db: MockDb | null = null;

function load(): MockDb {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockDb;
        if (parsed.version === DB_VERSION) return parsed;
      }
    } catch {
      /* localStorage bị chặn hoặc hỏng → dùng seed */
    }
  }
  return createSeed();
}

export function getDb(): MockDb {
  db ??= load();
  return db;
}

export function saveDb() {
  if (typeof window === "undefined" || !db) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* hết dung lượng / bị chặn – bỏ qua, prototype */
  }
}

/** Xóa mọi thao tác, quay về dữ liệu mẫu ban đầu. */
export function resetDb() {
  db = createSeed();
  saveDb();
}
