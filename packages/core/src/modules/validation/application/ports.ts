import type { DocKind, RuleResult, RuleSeverity, ValueCharges } from "@kb/contracts";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { DossierProfile } from "../domain/helpers.js";

export type ValidationRow = { id: string; orgId: string; dossierId: string; shipmentVersion: string; ruleCode: string; title: string; detail: string; result: RuleResult; severity: RuleSeverity; documentKinds: DocKind[]; fields: string[]; createdAt: Date };

export interface ValidationRepos {
  validations: {
    replaceForDossier(orgId: string, dossierId: string, rows: ValidationRow[]): Promise<void>;
    listLatest(orgId: string, dossierId: string): Promise<ValidationRow[]>;
  };
}
export interface ValidationUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: ValidationRepos) => Promise<T>): Promise<T>;
}
/** Đọc hồ sơ (nhập/xuất, loại hình, phương thức vận chuyển) – composition root nối từ module dossier. */
export interface DossierProfileReader {
  profile(orgId: string, dossierId: string): Promise<DossierProfile | null>;
}
/** Chi phí người khai nhập (module declaration) – composition root nối; vắng = luật chỉ theo chứng từ. */
export type ChargesReader = (orgId: string, dossierId: string) => Promise<ValueCharges | null>;
export type ValidationDeps = { uow: ValidationUow; idGen: { next(prefix: "chk"): string }; clock: { now(): Date }; dossiers?: DossierProfileReader; charges?: ChargesReader };
