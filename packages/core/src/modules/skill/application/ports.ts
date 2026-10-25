import type { OrgAuditWriter } from "../../../shared/audit.js";
import type { DocKind, SkillField, SkillKind } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { Ctx } from "../../../shared/ctx.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { ObjectStorage } from "../../dossier/index.js";
import type { AiProvider, UsageRecorder } from "../../extraction/index.js";

export type SkillRow = {
  id: string; orgId: string; code: string; name: string; kind: SkillKind; docKind: DocKind | null; supplier: string | null; language: string;
  enabled: boolean; isTemplate: boolean; templateId: string | null; currentVersion: number; labeledSamples: number;
  /** Tỷ lệ 0–1 dạng chuỗi (numeric), null khi chưa đo. */
  accuracy: string | null; createdAt: Date; updatedAt: Date;
};
export type SkillVersionRow = { id: string; orgId: string; skillId: string; version: number; fields: SkillField[]; promptNotes: string | null; createdBy: string | null; createdAt: Date };
export type SampleRow = {
  id: string; orgId: string; skillId: string; documentId: string | null; storageKey: string; fileName: string; pages: number; sizeBytes: number;
  status: "PENDING" | "LABELED";
  /** UPLOAD = tải lên ở trang skill; REVIEW = tự học từ chứng từ đã kiểm tra ở bước OCR. */
  source: "UPLOAD" | "REVIEW";
  supplier: string | null;
  /** Giá trị đúng theo key trường của skill; null khi chưa đọc/gắn nhãn. */
  expected: Record<string, unknown> | null; labeledBy: string | null; labeledAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type SuggestionRow = {
  id: string; orgId: string; skillId: string; fieldKey: string; alias: string; hits: number; status: "PENDING" | "ACCEPTED" | "DISMISSED";
  supplier: string | null; documentId: string | null; createdAt: Date; updatedAt: Date;
};
export type PerFieldAccuracy = { key: string; label: string; accuracy: number; errors: number };
export type EvaluationRow = { id: string; orgId: string; skillId: string; version: number; accuracy: string; previousAccuracy: string | null; perField: PerFieldAccuracy[]; samples: number; finishedAt: Date };

export interface SkillRepos {
  skills: {
    list(orgId: string, kind?: SkillKind | undefined): Promise<SkillRow[]>;
    get(orgId: string, id: string): Promise<SkillRow | null>;
    /** Skill mẫu của org hệ thống (policy cho mọi org đọc). */
    /** Skill mẫu đã phát hành (khu Quản trị hệ thống bật/tắt) – bản sao cấp cho doanh nghiệp mới. */
    listTemplates(): Promise<SkillRow[]>;
    insert(row: SkillRow): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Pick<SkillRow, "name" | "enabled" | "currentVersion" | "labeledSamples" | "accuracy" | "updatedAt">>): Promise<void>;
  };
  versions: {
    get(skillId: string, version: number): Promise<SkillVersionRow | null>;
    insert(row: SkillVersionRow): Promise<void>;
  };
  samples: {
    list(orgId: string, skillId: string): Promise<SampleRow[]>;
    get(orgId: string, id: string): Promise<SampleRow | null>;
    insert(row: SampleRow): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Pick<SampleRow, "status" | "expected" | "labeledBy" | "labeledAt" | "pages" | "updatedAt">>): Promise<void>;
  };
  suggestions: {
    /** Gợi ý của org (lọc theo skill/trạng thái), nhiều lần gặp trước. */
    list(orgId: string, f: { skillId?: string | undefined; status?: SuggestionRow["status"] | undefined }): Promise<SuggestionRow[]>;
    get(orgId: string, id: string): Promise<SuggestionRow | null>;
    find(orgId: string, skillId: string, fieldKey: string, alias: string): Promise<SuggestionRow | null>;
    insert(row: SuggestionRow): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Pick<SuggestionRow, "hits" | "status" | "supplier" | "documentId" | "updatedAt">>): Promise<void>;
  };
  evaluations: {
    latest(orgId: string, skillId: string): Promise<EvaluationRow | null>;
    insert(row: EvaluationRow): Promise<void>;
  };
}

export interface SkillUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: SkillRepos) => Promise<T>): Promise<T>;
}

/** Tên người dùng để hiển thị "người gắn nhãn" (identity cung cấp qua composition root). */
export interface UserNames {
  names(orgId: string, userIds: string[]): Promise<Map<string, string>>;
}

export interface SampleFileInspector {
  inspect(bytes: Buffer, mime: string): Promise<{ pages: number; encrypted: boolean }>;
}

/** Chứng từ trong hồ sơ còn ở bước kiểm tra + lần đọc mới nhất (container nối từ dossier + extraction). */
export type OpenRead = { documentId: string; dossierId: string; dossierCode: string; kind: DocKind; fileName: string; skillVersionId: string | null; supplier: string | null };
export interface SkillReadsPort {
  open(orgId: string): Promise<OpenRead[]>;
  /** Đọc lại các chứng từ (AI đọc bằng cấu hình skill hiện tại); trả số chứng từ đã đưa vào hàng đợi. */
  reread(ctx: Ctx, documentIds: string[]): Promise<number>;
}

export type SkillDeps = {
  uow: SkillUow;
  /** Nhật ký hoạt động doanh nghiệp (bật/tắt skill); container nối từ identity. */
  audit?: OrgAuditWriter;
  storage: ObjectStorage;
  queue: JobQueue;
  ai: AiProvider;
  usage: UsageRecorder;
  users: UserNames;
  pdf: SampleFileInspector;
  /** Chứng từ đang mở để gợi ý đọc lại sau khi skill đổi; không nối = không có gợi ý đọc lại. */
  reads?: SkillReadsPort;
  clock: Clock;
  idGen: IdGen;
};
