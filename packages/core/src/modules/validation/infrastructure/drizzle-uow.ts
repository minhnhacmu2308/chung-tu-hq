import { and, eq } from "drizzle-orm";
import type { DocKind, RuleResult, RuleSeverity } from "@kb/contracts";
import type { Db, Tx } from "../../../db/client.js";
import { validations } from "../../../db/schema/validation.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { ValidationRepos, ValidationRow, ValidationUow } from "../application/ports.js";

function repos(tx: Tx): ValidationRepos {
  return {
    validations: {
      replaceForDossier: async (orgId, dossierId, rows) => {
        await tx.delete(validations).where(and(eq(validations.orgId, orgId), eq(validations.dossierId, dossierId)));
        if (rows.length) await tx.insert(validations).values(rows);
      },
      listLatest: async (orgId, dossierId) =>
        (await tx.select().from(validations).where(and(eq(validations.orgId, orgId), eq(validations.dossierId, dossierId))).orderBy(validations.createdAt, validations.id)).map((r) => ({
          ...r, result: r.result as RuleResult, severity: r.severity as RuleSeverity, documentKinds: r.documentKinds as DocKind[],
        })),
    },
  };
}

export class DrizzleValidationUow implements ValidationUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: ValidationRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
