import type { DocKind, RuleResult, RuleSeverity } from "@kb/contracts";
import type { OrgId, UserId } from "../../../shared/ids.js";

export type ValidationRow = { id: string; orgId: string; dossierId: string; shipmentVersion: string; ruleCode: string; title: string; detail: string; result: RuleResult; severity: RuleSeverity; documentKinds: DocKind[]; fields: string[]; createdAt: Date };

export interface ValidationRepos {
  validations: {
    replaceForDossier(dossierId: string, rows: ValidationRow[]): Promise<void>;
    listLatest(dossierId: string): Promise<ValidationRow[]>;
  };
}
export interface ValidationUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: ValidationRepos) => Promise<T>): Promise<T>;
}
export type ValidationDeps = { uow: ValidationUow; idGen: { next(prefix: "chk"): string }; clock: { now(): Date } };
