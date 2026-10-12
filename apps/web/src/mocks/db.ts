// "Cơ sở dữ liệu" giả trong trình duyệt: seed → bộ nhớ → lưu localStorage để F5 không mất thao tác.
// Chỉ src/api/* được import file này. Màn hình KHÔNG import trực tiếp mocks/db.
import type {
  AgentRun, CrossCheck, CustomsMessage, CustomsResult, Declaration, DigitalCertificate, Dossier, DossierDocument,
  ExtractedField, Integration, LineItem, Member, Notification, Organization, Skill,
} from "./types";
import { seedCore } from "./seed/core";
import { seedOcr } from "./seed/ocr";
import { seedDeclaration } from "./seed/declaration";
import { seedCustoms } from "./seed/customs";
import { seedSkills } from "./seed/skills";
import { seedSettings } from "./seed/settings";

export type MockDb = {
  version: number;
  currentUserId: string;
  org: Organization;
  members: Member[];
  dossiers: Dossier[];
  documents: DossierDocument[];
  fields: ExtractedField[];
  checks: CrossCheck[];
  lineItems: LineItem[];
  agentRuns: AgentRun[];
  declarations: Declaration[];
  customsMessages: CustomsMessage[];
  customsResults: CustomsResult[];
  skills: Skill[];
  integrations: Integration[];
  certificates: DigitalCertificate[];
  notifications: Notification[];
};

/** Tăng khi đổi cấu trúc seed → dữ liệu cũ trong localStorage tự bị bỏ. */
const DB_VERSION = 2;
const STORAGE_KEY = "kb-mock-db";

function createSeed(): MockDb {
  const core = seedCore();
  const ocr = seedOcr(core.dossiers, core.documents);
  return {
    version: DB_VERSION,
    ...core,
    ...ocr,
    ...seedDeclaration(core.dossiers),
    ...seedCustoms(core.dossiers),
    ...seedSkills(),
    ...seedSettings(),
  };
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
