import type { CustomsDeclarationExtraction, LessonContext, LessonKind, LessonLineValue, LessonStatus, TeachSampleStatus } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { ObjectStorage } from "../../dossier/index.js";
import type { AiProvider, UsageRecorder } from "../../extraction/index.js";
import type { DocData, DraftField, DraftLine } from "../domain/compare.js";
import type { LessonRow } from "../domain/lessons.js";

export type TeachSampleRow = {
  id: string; orgId: string; storageKey: string; fileName: string; pages: number; sizeBytes: number; status: TeachSampleStatus;
  declarationNo: string | null; read: CustomsDeclarationExtraction | null; dossierId: string | null; dossierCode: string | null;
  comparison: { fields: unknown[]; lines: unknown[] } | null; matched: number | null; total: number | null; lessons: number; error: string | null;
  uploadedBy: string | null; createdAt: Date; updatedAt: Date;
};
export type StoredLesson = LessonRow & { identity: string; reviewedBy: string | null; reviewedAt: Date | null };
export type { LessonContext, LessonKind, LessonLineValue, LessonStatus };

export interface TeachRepos {
  settings: { enabled(orgId: string): Promise<boolean>; set(orgId: string, enabled: boolean, now: Date): Promise<void> };
  samples: {
    list(orgId: string, limit: number): Promise<TeachSampleRow[]>;
    get(orgId: string, id: string): Promise<TeachSampleRow | null>;
    insert(row: TeachSampleRow): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Omit<TeachSampleRow, "id" | "orgId" | "createdAt">>): Promise<void>;
    delete(orgId: string, id: string): Promise<void>;
  };
  lessons: {
    list(orgId: string): Promise<StoredLesson[]>;
    get(orgId: string, id: string): Promise<StoredLesson | null>;
    byIdentities(orgId: string, identities: string[]): Promise<StoredLesson[]>;
    /** Thêm mới hoặc ghi đè theo (org, identity). */
    upsert(row: StoredLesson): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Pick<StoredLesson, "status" | "value" | "hits" | "conflicts" | "reviewedBy" | "reviewedAt" | "updatedAt">>): Promise<void>;
  };
}

export interface TeachUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: TeachRepos) => Promise<T>): Promise<T>;
}

/** Dữ liệu lô hàng trong app (container nối từ dossier + extraction + declaration). */
export interface TeachLotPort {
  /** Hồ sơ cùng lô: số vận đơn trùng (bỏ khoảng trắng, bỏ tiền tố ngày DDMMYY của vận đơn đường biển). */
  findDossier(orgId: string, billNo: string): Promise<{ id: string; code: string } | null>;
  /** Tờ khai nháp hiện tại và dòng hàng của hồ sơ; null khi chưa dựng. */
  draft(orgId: string, dossierId: string): Promise<{ fields: DraftField[]; lines: DraftLine[] } | null>;
  /** Bản đọc mọi chứng từ của hồ sơ + ngữ cảnh (nhà cung cấp, phương thức, chi cục). */
  lot(orgId: string, dossierId: string): Promise<{ docs: DocData[]; sellerName: string | null; mode: string | null; office: string | null } | null>;
  /** Tên chỉ tiêu tờ khai theo mã (hiện ở bài học, file quy tắc). */
  fieldLabels(): Record<string, string>;
  orgName(orgId: string): Promise<string>;
}

export interface TeachFileInspector {
  inspect(bytes: Buffer, mime: string): Promise<{ pages: number; encrypted: boolean }>;
}

export type TeachDeps = {
  uow: TeachUow;
  storage: ObjectStorage;
  queue: JobQueue;
  ai: AiProvider;
  usage: UsageRecorder;
  pdf: TeachFileInspector;
  lots: TeachLotPort;
  clock: Clock;
  idGen: IdGen;
};
