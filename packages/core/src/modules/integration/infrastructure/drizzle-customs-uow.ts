import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { containerLists, customsInbox, customsMessages, customsOutbox, customsResults, hysSubmissionFiles, hysSubmissions, kvgsSheets, postAmendments } from "../../../db/schema/integration.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { ContainerListRecord, CustomsRepos, CustomsUow, HysFileRow, InboxRow, HysSubmissionRow, KvgsSheetRecord, MessageRow, OutboxRow, PostAmendmentRow, ResultRow } from "../application/customs-ports.js";

function repos(tx: Tx): CustomsRepos {
  const toOutbox = (r: typeof customsOutbox.$inferSelect): OutboxRow => ({ ...r, operation: r.operation as OutboxRow["operation"], status: r.status as OutboxRow["status"] });
  const toMsg = (r: typeof customsMessages.$inferSelect): MessageRow => ({ ...r, operation: r.operation as MessageRow["operation"], direction: r.direction as MessageRow["direction"], result: r.result as MessageRow["result"] });
  const toResult = (r: typeof customsResults.$inferSelect): ResultRow => ({ ...r, channel: r.channel as ResultRow["channel"], clearanceStatus: r.clearanceStatus as ResultRow["clearanceStatus"], state: r.state as ResultRow["state"], raw: r.raw as ResultRow["raw"] });
  const toAmendment = (r: typeof postAmendments.$inferSelect): PostAmendmentRow => {
    const { approvedBy, result, ...rest } = r;
    return {
      ...rest, status: r.status as PostAmendmentRow["status"], header: r.header as PostAmendmentRow["header"], lines: r.lines as PostAmendmentRow["lines"],
      ...(approvedBy ? { approvedBy } : {}), ...(result ? { result: result as NonNullable<PostAmendmentRow["result"]> } : {}),
    };
  };
  const amendmentCols = (row: PostAmendmentRow) => ({ status: row.status, header: row.header, lines: row.lines, approvedBy: row.approvedBy ?? null, approvedAt: row.approvedAt, result: row.result ?? null, updatedAt: row.updatedAt });
  const toHys = (r: typeof hysSubmissions.$inferSelect): HysSubmissionRow => ({ ...r, attachKind: r.attachKind as HysSubmissionRow["attachKind"], purpose: r.purpose as HysSubmissionRow["purpose"], status: r.status as HysSubmissionRow["status"], reject: r.reject as HysSubmissionRow["reject"], fill: r.fill as HysSubmissionRow["fill"] });
  const toContainerList = (r: typeof containerLists.$inferSelect): ContainerListRecord => ({ ...r, rows: r.rows as ContainerListRecord["rows"], status: r.status as ContainerListRecord["status"], errors: r.errors as ContainerListRecord["errors"], sentRows: r.sentRows as ContainerListRecord["sentRows"] });
  const toKvgs = (r: typeof kvgsSheets.$inferSelect): KvgsSheetRecord => ({ ...r, status: r.status as KvgsSheetRecord["status"], errors: r.errors as KvgsSheetRecord["errors"], sheet: r.sheet as KvgsSheetRecord["sheet"] });
  return {
    outbox: {
      get: async (orgId, id) => {
        const r = (await tx.select().from(customsOutbox).where(and(eq(customsOutbox.orgId, orgId), eq(customsOutbox.id, id))).limit(1))[0];
        return r ? toOutbox(r) : null;
      },
      findByKey: async (orgId, key) => {
        const r = (await tx.select().from(customsOutbox).where(and(eq(customsOutbox.orgId, orgId), eq(customsOutbox.idempotencyKey, key))).limit(1))[0];
        return r ? toOutbox(r) : null;
      },
      listForDossier: async (orgId, dossierId) => (await tx.select().from(customsOutbox).where(and(eq(customsOutbox.orgId, orgId), eq(customsOutbox.dossierId, dossierId))).orderBy(customsOutbox.createdAt, customsOutbox.id)).map(toOutbox),
      listUnsentBefore: async (orgId, before) => (await tx.select().from(customsOutbox).where(and(eq(customsOutbox.orgId, orgId), eq(customsOutbox.status, "PENDING"), eq(customsOutbox.attempts, 0), lt(customsOutbox.createdAt, before))).orderBy(customsOutbox.createdAt).limit(200)).map(toOutbox),
      insert: async (row) => void (await tx.insert(customsOutbox).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(customsOutbox).set(patch).where(and(eq(customsOutbox.orgId, orgId), eq(customsOutbox.id, id)))),
    },
    messages: {
      list: async (orgId, dossierId, branch) => (await tx.select().from(customsMessages).where(and(eq(customsMessages.orgId, orgId), eq(customsMessages.dossierId, dossierId), branch === undefined ? undefined : eq(customsMessages.branch, branch))).orderBy(customsMessages.at, customsMessages.id)).map(toMsg),
      listSucceededSince: async (orgId, operations, since) =>
        operations.length
          ? (await tx.select().from(customsMessages).where(and(eq(customsMessages.orgId, orgId), eq(customsMessages.direction, "IN"), eq(customsMessages.result, "OK"), inArray(customsMessages.operation, operations), gte(customsMessages.at, since)))).map(toMsg)
          : [],
      insert: async (row) => void (await tx.insert(customsMessages).values(row)),
    },
    results: {
      get: async (orgId, dossierId, branch = 1) => {
        const r = (await tx.select().from(customsResults).where(and(eq(customsResults.orgId, orgId), eq(customsResults.dossierId, dossierId), eq(customsResults.branch, branch))).limit(1))[0];
        return r ? toResult(r) : null;
      },
      listForDossier: async (orgId, dossierId) => (await tx.select().from(customsResults).where(and(eq(customsResults.orgId, orgId), eq(customsResults.dossierId, dossierId))).orderBy(customsResults.branch)).map(toResult),
      listForDossiers: async (orgId, dossierIds) =>
        dossierIds.length ? (await tx.select().from(customsResults).where(and(eq(customsResults.orgId, orgId), inArray(customsResults.dossierId, dossierIds))).orderBy(customsResults.dossierId, customsResults.branch)).map(toResult) : [],
      listForOrg: async (orgId) => (await tx.select().from(customsResults).where(eq(customsResults.orgId, orgId)).orderBy(desc(customsResults.updatedAt))).map(toResult),
      listNumbered: async (orgId, since) =>
        (
          await tx
            .select()
            .from(customsResults)
            .where(and(eq(customsResults.orgId, orgId), isNotNull(customsResults.declarationNo), since ? gte(customsResults.updatedAt, since) : undefined))
            .orderBy(desc(customsResults.updatedAt))
        ).map(toResult),
      findByNumber: async (orgId, no) => {
        const r = (await tx.select().from(customsResults).where(and(eq(customsResults.orgId, orgId), or(eq(customsResults.declarationNo, no), eq(customsResults.externalId, no)))).orderBy(desc(customsResults.updatedAt)).limit(1))[0];
        return r ? toResult(r) : null;
      },
      deleteUnsentAbove: async (orgId, dossierId, branch) =>
        (await tx.delete(customsResults).where(and(eq(customsResults.orgId, orgId), eq(customsResults.dossierId, dossierId), gt(customsResults.branch, branch), isNull(customsResults.declarationNo), sql`${customsResults.raw}->>'stage' = 'NOT_SENT'`)).returning({ id: customsResults.id })).length,
      upsert: async (row) => {
        await tx
          .insert(customsResults)
          .values(row)
          .onConflictDoUpdate({ target: [customsResults.dossierId, customsResults.branch], set: { externalId: row.externalId, declarationNo: row.declarationNo, channel: row.channel, channelNote: row.channelNote, clearanceStatus: row.clearanceStatus, customsTaxVnd: row.customsTaxVnd, state: row.state, pollCount: row.pollCount, raw: row.raw, updatedAt: row.updatedAt } });
      },
    },
    amendments: {
      listForDossier: async (orgId, dossierId, branch) => (await tx.select().from(postAmendments).where(and(eq(postAmendments.orgId, orgId), eq(postAmendments.dossierId, dossierId), branch === undefined ? undefined : eq(postAmendments.branch, branch))).orderBy(postAmendments.branch, postAmendments.seq)).map(toAmendment),
      findBySyn: async (orgId, syn) => {
        const r = (await tx.select().from(postAmendments).where(and(eq(postAmendments.orgId, orgId), or(sql`${postAmendments.header}->>'TK_SYN' = ${syn}`, sql`${postAmendments.result}->>'TK_SYN' = ${syn}`))).orderBy(desc(postAmendments.updatedAt)).limit(1))[0];
        return r ? toAmendment(r) : null;
      },
      insert: async (row) => void (await tx.insert(postAmendments).values({ id: row.id, orgId: row.orgId, dossierId: row.dossierId, branch: row.branch, seq: row.seq, createdAt: row.createdAt, ...amendmentCols(row) })),
      update: async (row) => void (await tx.update(postAmendments).set(amendmentCols(row)).where(and(eq(postAmendments.orgId, row.orgId), eq(postAmendments.id, row.id)))),
    },
    inbox: {
      insertMany: async (rows) => {
        if (!rows.length) return;
        await tx.insert(customsInbox).values(rows.map((r) => ({ ...r, kind: r.message.kind, code: r.message.code, declarationNo: r.message.declarationNo }))).onConflictDoNothing({ target: [customsInbox.orgId, customsInbox.dedupKey] });
      },
      listPending: async (orgId, limit) =>
        (await tx.select().from(customsInbox).where(and(eq(customsInbox.orgId, orgId), eq(customsInbox.status, "PENDING"))).orderBy(asc(customsInbox.receivedAt), asc(customsInbox.id)).limit(limit)).map(
          (r): InboxRow => ({ id: r.id, orgId: r.orgId, dedupKey: r.dedupKey, message: r.message as InboxRow["message"], status: r.status as InboxRow["status"], attempts: r.attempts, receivedAt: r.receivedAt, appliedAt: r.appliedAt }),
        ),
      update: async (orgId, id, patch) => void (await tx.update(customsInbox).set(patch).where(and(eq(customsInbox.orgId, orgId), eq(customsInbox.id, id), eq(customsInbox.status, "PENDING")))),
      claim: async (orgId, id, at) =>
        (await tx.update(customsInbox).set({ status: "APPLIED", attempts: sql`${customsInbox.attempts} + 1`, appliedAt: at }).where(and(eq(customsInbox.orgId, orgId), eq(customsInbox.id, id), eq(customsInbox.status, "PENDING"))).returning({ id: customsInbox.id })).length > 0,
    },
    hys: {
      list: async (orgId, dossierId) => (await tx.select().from(hysSubmissions).where(and(eq(hysSubmissions.orgId, orgId), eq(hysSubmissions.dossierId, dossierId))).orderBy(hysSubmissions.seq)).map(toHys),
      get: async (orgId, id) => {
        const r = (await tx.select().from(hysSubmissions).where(and(eq(hysSubmissions.orgId, orgId), eq(hysSubmissions.id, id))).limit(1))[0];
        return r ? toHys(r) : null;
      },
      insert: async (row) => void (await tx.insert(hysSubmissions).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(hysSubmissions).set(patch).where(and(eq(hysSubmissions.orgId, orgId), eq(hysSubmissions.id, id)))),
      delete: async (orgId, id) => void (await tx.delete(hysSubmissions).where(and(eq(hysSubmissions.orgId, orgId), eq(hysSubmissions.id, id)))),
      files: async (orgId, submissionId) => await tx.select().from(hysSubmissionFiles).where(and(eq(hysSubmissionFiles.orgId, orgId), eq(hysSubmissionFiles.submissionId, submissionId))).orderBy(hysSubmissionFiles.position, hysSubmissionFiles.id),
      filesForDossier: async (orgId, dossierId) =>
        (await tx.select({ f: hysSubmissionFiles }).from(hysSubmissionFiles).innerJoin(hysSubmissions, eq(hysSubmissions.id, hysSubmissionFiles.submissionId)).where(and(eq(hysSubmissionFiles.orgId, orgId), eq(hysSubmissions.orgId, orgId), eq(hysSubmissions.dossierId, dossierId))).orderBy(hysSubmissions.seq, hysSubmissionFiles.position, hysSubmissionFiles.id)).map((x) => x.f),
      insertFile: async (row) => void (await tx.insert(hysSubmissionFiles).values(row)),
      deleteFile: async (orgId, fileId) => void (await tx.delete(hysSubmissionFiles).where(and(eq(hysSubmissionFiles.orgId, orgId), eq(hysSubmissionFiles.id, fileId)))),
      deleteFiles: async (orgId, submissionId) => void (await tx.delete(hysSubmissionFiles).where(and(eq(hysSubmissionFiles.orgId, orgId), eq(hysSubmissionFiles.submissionId, submissionId)))),
    },
    containerLists: {
      latest: async (orgId, dossierId, branch) => {
        const r = (await tx.select().from(containerLists).where(and(eq(containerLists.orgId, orgId), eq(containerLists.dossierId, dossierId), eq(containerLists.branch, branch))).orderBy(desc(containerLists.attempt)).limit(1))[0];
        return r ? toContainerList(r) : null;
      },
      get: async (orgId, id) => {
        const r = (await tx.select().from(containerLists).where(and(eq(containerLists.orgId, orgId), eq(containerLists.id, id))).limit(1))[0];
        return r ? toContainerList(r) : null;
      },
      insert: async (row) => void (await tx.insert(containerLists).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(containerLists).set(patch).where(and(eq(containerLists.orgId, orgId), eq(containerLists.id, id)))),
    },
    kvgs: {
      latest: async (orgId, dossierId, branch) => {
        const r = (await tx.select().from(kvgsSheets).where(and(eq(kvgsSheets.orgId, orgId), eq(kvgsSheets.dossierId, dossierId), eq(kvgsSheets.branch, branch))).orderBy(desc(kvgsSheets.requestedAt), desc(kvgsSheets.id)).limit(1))[0];
        return r ? toKvgs(r) : null;
      },
      latestOk: async (orgId, dossierId, branch) => {
        const r = (await tx.select().from(kvgsSheets).where(and(eq(kvgsSheets.orgId, orgId), eq(kvgsSheets.dossierId, dossierId), eq(kvgsSheets.branch, branch), eq(kvgsSheets.status, "ACCEPTED"))).orderBy(desc(kvgsSheets.requestedAt), desc(kvgsSheets.id)).limit(1))[0];
        return r ? toKvgs(r) : null;
      },
      get: async (orgId, id) => {
        const r = (await tx.select().from(kvgsSheets).where(and(eq(kvgsSheets.orgId, orgId), eq(kvgsSheets.id, id))).limit(1))[0];
        return r ? toKvgs(r) : null;
      },
      insert: async (row) => void (await tx.insert(kvgsSheets).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(kvgsSheets).set(patch).where(and(eq(kvgsSheets.orgId, orgId), eq(kvgsSheets.id, id)))),
    },
  };
}

export class DrizzleCustomsUow implements CustomsUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: CustomsRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
