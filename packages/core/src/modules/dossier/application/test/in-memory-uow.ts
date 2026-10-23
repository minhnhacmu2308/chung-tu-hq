import type { OrgId, UserId } from "../../../../shared/ids.js";
import type { DocumentRow, DossierRepos, DossierRow, DossierUow, ProgressRow } from "../ports.js";

/** Fake mô phỏng RLS: mọi truy vấn lọc theo org của ngữ cảnh; ghi sai org → ném lỗi như Postgres. */
export class InMemoryDossierUow implements DossierUow {
  readonly data = { dossiers: [] as DossierRow[], documents: [] as DocumentRow[], progress: [] as ProgressRow[] };

  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: DossierRepos) => Promise<T>): Promise<T> {
    const d = this.data;
    const org = ctx.orgId as string;
    const deny = (w: string): never => {
      throw new Error(`new row violates row-level security policy (${w})`);
    };
    const clone = <X>(x: X): X => structuredClone(x);
    const matchDossiers = (orgId: string, f: { direction?: string | undefined; status?: string | undefined; step?: string | undefined; q?: string | undefined }) => {
      const q = f.q?.trim().toLowerCase();
      return d.dossiers
        .filter((x) => x.orgId === org && x.orgId === orgId && (!f.direction || x.direction === f.direction) && (!f.status || x.status === f.status) && (!f.step || x.step === f.step))
        .filter((x) => !q || [x.code, x.partner, x.billNo].some((v) => v.toLowerCase().includes(q)))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1));
    };
    const repos: DossierRepos = {
      dossiers: {
        list: async (orgId, f, page) => clone(matchDossiers(orgId, f).slice(page.offset, page.offset + page.limit)),
        count: async (orgId, f) => matchDossiers(orgId, f).length,
        get: async (orgId, id) => clone(d.dossiers.find((x) => x.id === id && x.orgId === org && x.orgId === orgId) ?? null),
        codesInMonth: async (orgId, direction, prefix) => d.dossiers.filter((x) => x.orgId === org && x.orgId === orgId && x.direction === direction && x.code.startsWith(prefix)).map((x) => x.code),
        insert: async (row) => void (row.orgId === org ? d.dossiers.push(clone(row)) : deny("dossiers insert")),
        update: async (id, patch) => {
          const x = d.dossiers.find((y) => y.id === id && y.orgId === org);
          if (x) Object.assign(x, patch);
        },
        statsInRange: async (orgId, from, to) => {
          const mine = d.dossiers.filter((x) => x.orgId === org && x.orgId === orgId && x.createdAt >= from && x.createdAt < to);
          const ids = new Set(mine.map((x) => x.id));
          return { dossiers: mine.length, pages: d.documents.filter((x) => ids.has(x.dossierId)).reduce((n, x) => n + x.pages, 0) };
        },
      },
      documents: {
        list: async (orgId, dossierId) => clone(d.documents.filter((x) => x.orgId === org && x.orgId === orgId && x.dossierId === dossierId)),
        get: async (orgId, id) => clone(d.documents.find((x) => x.id === id && x.orgId === org && x.orgId === orgId) ?? null),
        insert: async (row) => void (row.orgId === org ? d.documents.push(clone(row)) : deny("documents insert")),
        update: async (id, patch) => {
          const x = d.documents.find((y) => y.id === id && y.orgId === org);
          // Như adapter Drizzle: mỗi lần cập nhật làm mới updated_at.
          if (x) Object.assign(x, patch, { updatedAt: new Date() });
        },
        delete: async (id) => void (d.documents = d.documents.filter((x) => !(x.id === id && x.orgId === org))),
        listStuckQueued: async (orgId, before) => clone(d.documents.filter((x) => x.orgId === org && x.orgId === orgId && x.status === "QUEUED" && x.updatedAt < before)),
      },
      progress: {
        upsert: async (row) => {
          if (row.orgId !== org) deny("job_progress insert");
          const i = d.progress.findIndex((x) => x.jobId === row.jobId && x.jobKind === row.jobKind);
          if (i >= 0) d.progress[i] = clone(row);
          else d.progress.push(clone(row));
        },
        list: async (orgId, dossierId) => clone(d.progress.filter((x) => x.orgId === org && x.orgId === orgId && x.dossierId === dossierId)),
      },
    };
    return fn(repos);
  }
}
