import type { OrgId, UserId } from "../../../../shared/ids.js";
import type { CustomsRepos, CustomsUow, HysFileRow, HysSubmissionRow, MessageRow, OutboxRow, PostAmendmentRow, ResultRow } from "../customs-ports.js";

/** Fake mô phỏng RLS theo org; outbox unique theo idempotency_key; messages append-only. */
export class InMemoryCustomsUow implements CustomsUow {
  readonly data = { outbox: [] as OutboxRow[], messages: [] as MessageRow[], results: [] as ResultRow[], amendments: [] as PostAmendmentRow[], hys: [] as HysSubmissionRow[], hysFiles: [] as HysFileRow[] };
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: CustomsRepos) => Promise<T>): Promise<T> {
    const d = this.data;
    const org = ctx.orgId as string;
    const deny = (w: string): never => {
      throw new Error(`new row violates row-level security policy (${w})`);
    };
    const clone = <X>(x: X): X => structuredClone(x);
    return fn({
      outbox: {
        get: async (orgId, id) => clone(d.outbox.find((x) => x.id === id && x.orgId === org && x.orgId === orgId) ?? null),
        findByKey: async (orgId, key) => clone(d.outbox.find((x) => x.idempotencyKey === key && x.orgId === org && x.orgId === orgId) ?? null),
        listForDossier: async (orgId, dossierId) => clone(d.outbox.filter((x) => x.orgId === org && x.orgId === orgId && x.dossierId === dossierId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())),
        listUnsentBefore: async (orgId, before) => clone(d.outbox.filter((x) => x.orgId === org && x.orgId === orgId && x.status === "PENDING" && x.attempts === 0 && x.createdAt < before)),
        insert: async (row) => {
          if (row.orgId !== org) deny("customs_outbox");
          if (d.outbox.some((x) => x.idempotencyKey === row.idempotencyKey)) throw new Error("duplicate key value violates unique constraint customs_outbox_key_uq");
          d.outbox.push(clone(row));
        },
        update: async (orgId, id, patch) => {
          if (orgId !== org) deny(`customs_outbox update orgId ${orgId} khác ngữ cảnh`);
          const x = d.outbox.find((y) => y.id === id && y.orgId === org);
          if (x) Object.assign(x, clone(patch));
        },
      },
      messages: {
        list: async (orgId, dossierId, branch) => clone(d.messages.filter((m) => m.orgId === org && m.orgId === orgId && m.dossierId === dossierId && (branch === undefined || m.branch === branch)).sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id))),
        insert: async (row) => void (row.orgId === org ? d.messages.push(clone(row)) : deny("customs_messages")),
      },
      results: {
        get: async (orgId, dossierId, branch = 1) => clone(d.results.find((r) => r.dossierId === dossierId && r.branch === branch && r.orgId === org && r.orgId === orgId) ?? null),
        listForDossiers: async (orgId, ids) => clone(d.results.filter((r) => r.orgId === org && r.orgId === orgId && ids.includes(r.dossierId)).sort((a, b) => a.branch - b.branch)),
        listForOrg: async (orgId) => clone(d.results.filter((r) => r.orgId === org && r.orgId === orgId)),
        listForDossier: async (orgId, dossierId) => clone(d.results.filter((r) => r.orgId === org && r.orgId === orgId && r.dossierId === dossierId).sort((a, b) => a.branch - b.branch)),
        deleteUnsentAbove: async (orgId, dossierId, branch) => {
          const drop = (r: ResultRow) => r.orgId === org && r.orgId === orgId && r.dossierId === dossierId && r.branch > branch && r.declarationNo === null && r.raw?.stage === "NOT_SENT";
          const n = d.results.filter(drop).length;
          d.results = d.results.filter((r) => !drop(r));
          return n;
        },
        upsert: async (row) => {
          if (row.orgId !== org) deny("customs_results");
          const i = d.results.findIndex((r) => r.dossierId === row.dossierId && r.branch === row.branch);
          if (i >= 0) d.results[i] = clone(row);
          else d.results.push(clone(row));
        },
      },
      amendments: {
        listForDossier: async (orgId, dossierId, branch) => clone(d.amendments.filter((a) => a.orgId === org && a.orgId === orgId && a.dossierId === dossierId && (branch === undefined || a.branch === branch)).sort((a, b) => a.branch - b.branch || a.seq - b.seq)),
        insert: async (row) => {
          if (row.orgId !== org) deny("post_amendments");
          if (d.amendments.some((a) => a.dossierId === row.dossierId && a.branch === row.branch && a.seq === row.seq)) throw new Error("duplicate key value violates unique constraint post_amendments_dossier_branch_seq_uq");
          d.amendments.push(clone(row));
        },
        update: async (row) => {
          const i = d.amendments.findIndex((a) => a.id === row.id && a.orgId === org);
          if (i >= 0) d.amendments[i] = clone(row);
        },
      },
      hys: {
        list: async (orgId, dossierId) => clone(d.hys.filter((h) => h.orgId === org && h.orgId === orgId && h.dossierId === dossierId).sort((a, b) => a.seq - b.seq)),
        get: async (orgId, id) => clone(d.hys.find((h) => h.id === id && h.orgId === org && h.orgId === orgId) ?? null),
        insert: async (row) => {
          if (row.orgId !== org) deny("hys_submissions");
          if (d.hys.some((h) => h.dossierId === row.dossierId && h.seq === row.seq)) throw new Error("duplicate key value violates unique constraint hys_submissions_dossier_seq_uq");
          d.hys.push(clone(row));
        },
        update: async (orgId, id, patch) => {
          if (orgId !== org) deny(`hys_submissions update orgId ${orgId} khác ngữ cảnh`);
          const h = d.hys.find((x) => x.id === id && x.orgId === org);
          if (h) Object.assign(h, clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))));
        },
        delete: async (orgId, id) => {
          if (orgId !== org) return;
          d.hys = d.hys.filter((h) => !(h.id === id && h.orgId === org));
          d.hysFiles = d.hysFiles.filter((f) => !(f.submissionId === id && f.orgId === org));
        },
        files: async (orgId, submissionId) => clone(d.hysFiles.filter((f) => f.orgId === org && f.orgId === orgId && f.submissionId === submissionId).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))),
        filesForDossier: async (orgId, dossierId) => {
          const subs = d.hys.filter((h) => h.orgId === org && h.orgId === orgId && h.dossierId === dossierId);
          const seqOf = (sid: string) => subs.find((h) => h.id === sid)?.seq ?? 0;
          return clone(d.hysFiles.filter((f) => f.orgId === org && f.orgId === orgId && subs.some((h) => h.id === f.submissionId)).sort((a, b) => seqOf(a.submissionId) - seqOf(b.submissionId) || a.position - b.position || a.id.localeCompare(b.id)));
        },
        insertFile: async (row) => {
          if (row.orgId !== org) deny("hys_submission_files");
          d.hysFiles.push(clone(row));
        },
        deleteFile: async (orgId, fileId) => {
          if (orgId !== org) return;
          d.hysFiles = d.hysFiles.filter((f) => !(f.id === fileId && f.orgId === org));
        },
        deleteFiles: async (orgId, submissionId) => {
          if (orgId !== org) return;
          d.hysFiles = d.hysFiles.filter((f) => !(f.submissionId === submissionId && f.orgId === org));
        },
      },
    });
  }
}
