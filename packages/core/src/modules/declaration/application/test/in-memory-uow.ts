import type { OrgId, UserId } from "../../../../shared/ids.js";
import type { AgentRunRow, DeclarationRepos, DeclarationRow, DeclarationUow, HsCatalogRow, HsJobRow, HsSuggestionRow, LineItemRow, ProductRow, ProfileRow } from "../ports.js";

/** Fake mô phỏng RLS theo org; catalog_hs/exchange_rates là bảng chung (mọi org đọc). */
export class InMemoryDeclarationUow implements DeclarationUow {
  readonly data = {
    lineItems: [] as LineItemRow[], hsJobs: [] as HsJobRow[], suggestions: [] as HsSuggestionRow[], declarations: [] as DeclarationRow[], agentRuns: [] as AgentRunRow[],
    catalogHs: [] as HsCatalogRow[], exchangeRates: [] as { currency: string; date: string; rate: string; source?: "VCB" | "MANUAL" | "SEED"; snapshotAt?: Date | null }[], profiles: [] as ProfileRow[], products: [] as ProductRow[],
  };

  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: DeclarationRepos) => Promise<T>): Promise<T> {
    const d = this.data;
    const org = ctx.orgId as string;
    const deny = (w: string): never => {
      throw new Error(`new row violates row-level security policy (${w})`);
    };
    const clone = <X>(x: X): X => structuredClone(x);
    const own = (orgId: string) => {
      if (orgId !== org) deny(`orgId ${orgId} khác ngữ cảnh ${org}`);
      return org;
    };
    const repos: DeclarationRepos = {
      lineItems: {
        list: async (orgId, dossierId) => clone(d.lineItems.filter((x) => x.orgId === org && x.orgId === orgId && x.dossierId === dossierId).sort((a, b) => a.lineNo - b.lineNo)),
        get: async (orgId, id) => clone(d.lineItems.find((x) => x.id === id && x.orgId === org && x.orgId === orgId) ?? null),
        upsertForDossier: async (orgId, dossierId, rows) => {
          if (rows.some((r) => r.orgId !== own(orgId))) deny("line_items");
          const out: LineItemRow[] = [];
          for (const r of rows) {
            const ex = d.lineItems.find((x) => x.orgId === org && x.dossierId === dossierId && x.lineNo === r.lineNo);
            if (ex) {
              Object.assign(ex, { description: r.description, quantity: r.quantity, unit: r.unit, unitPrice: r.unitPrice, amount: r.amount, origin: r.origin, invoiceHsCode: r.invoiceHsCode, updatedAt: r.updatedAt });
              out.push(clone(ex));
            } else {
              d.lineItems.push(clone(r));
              out.push(clone(r));
            }
          }
          const keep = new Set(rows.map((r) => r.lineNo));
          d.lineItems = d.lineItems.filter((x) => !(x.orgId === org && x.dossierId === dossierId && !keep.has(x.lineNo)));
          return out.sort((a, b) => a.lineNo - b.lineNo);
        },
        update: async (orgId, id, patch) => {
          const x = d.lineItems.find((y) => y.id === id && y.orgId === own(orgId));
          if (x) Object.assign(x, clone(patch));
        },
        listByHsItem: async (orgId, hsItemId) => clone(d.lineItems.filter((x) => x.hsItemId === hsItemId && x.orgId === org && x.orgId === orgId).sort((a, b) => a.lineNo - b.lineNo)),
      },
      hsJobs: {
        insert: async (row) => {
          if (row.orgId !== org) deny("hs_jobs");
          d.hsJobs.push(clone(row));
        },
        get: async (orgId, id) => clone(d.hsJobs.find((x) => x.id === id && x.orgId === org && x.orgId === orgId) ?? null),
        openForDossier: async (orgId, dossierId) => clone(d.hsJobs.filter((x) => x.orgId === org && x.orgId === orgId && x.dossierId === dossierId && (x.status === "pending" || x.status === "processing" || x.status === "need_info"))),
        update: async (orgId, id, patch) => {
          const x = d.hsJobs.find((y) => y.id === id && y.orgId === own(orgId));
          if (x) Object.assign(x, clone(patch));
        },
      },
      suggestions: {
        listForItems: async (orgId, ids) => clone(d.suggestions.filter((s) => s.orgId === own(orgId) && ids.includes(s.lineItemId)).sort((a, b) => b.confidence - a.confidence)),
        replaceForItem: async (orgId, itemId, rows) => {
          if (rows.some((r) => r.orgId !== own(orgId))) deny("hs_suggestions");
          d.suggestions = d.suggestions.filter((s) => !(s.lineItemId === itemId && s.orgId === org)).concat(rows.map(clone));
        },
      },
      declarations: {
        latest: async (orgId, dossierId) => clone(d.declarations.filter((x) => x.orgId === org && x.orgId === orgId && x.dossierId === dossierId).sort((a, b) => b.version - a.version)[0] ?? null),
        listLatestByStatus: async (orgId, statuses) => {
          const latest = new Map<string, DeclarationRow>();
          for (const x of d.declarations.filter((x) => x.orgId === org && x.orgId === orgId)) if (!latest.has(x.dossierId) || latest.get(x.dossierId)!.version < x.version) latest.set(x.dossierId, x);
          return clone([...latest.values()].filter((x) => statuses.includes(x.status)));
        },
        insert: async (row) => {
          if (row.orgId !== org) deny("declarations");
          if (d.declarations.some((x) => x.dossierId === row.dossierId && x.version === row.version)) throw new Error("duplicate key value violates unique constraint declarations_dossier_version_uq");
          d.declarations.push(clone(row));
        },
        update: async (orgId, id, patch) => {
          const x = d.declarations.find((y) => y.id === id && y.orgId === own(orgId));
          if (x) Object.assign(x, clone(patch));
        },
      },
      agentRuns: {
        latest: async (orgId, dossierId) => clone(d.agentRuns.filter((x) => x.orgId === org && x.orgId === orgId && x.dossierId === dossierId).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null),
        get: async (orgId, id) => clone(d.agentRuns.find((x) => x.id === id && x.orgId === org && x.orgId === orgId) ?? null),
        listRunningBefore: async (orgId, before) => clone(d.agentRuns.filter((x) => x.orgId === org && x.orgId === orgId && x.status === "RUNNING" && x.startedAt < before)),
        insert: async (row) => void (row.orgId === org ? d.agentRuns.push(clone(row)) : deny("agent_runs")),
        update: async (orgId, id, patch) => {
          const x = d.agentRuns.find((y) => y.id === id && y.orgId === own(orgId));
          if (x) Object.assign(x, clone(patch));
        },
      },
      catalogHs: {
        search: async (q, limit) => {
          const needle = (q ?? "").toLowerCase();
          return clone(d.catalogHs.filter((h) => !needle || h.code.includes(needle) || h.description.toLowerCase().includes(needle)).slice(0, limit));
        },
        get: async (code) => clone(d.catalogHs.find((h) => h.code === code) ?? null),
        all: async () => clone(d.catalogHs),
      },
      profiles: {
        get: async (orgId, direction) => clone(d.profiles.find((x) => x.orgId === org && x.orgId === orgId && x.direction === direction) ?? null),
        upsert: async (row) => {
          if (row.orgId !== org) deny("declaration_profiles");
          d.profiles = [...d.profiles.filter((x) => !(x.orgId === row.orgId && x.direction === row.direction)), clone(row)];
        },
      },
      products: {
        list: async (orgId) => clone(d.products.filter((x) => x.orgId === org && x.orgId === orgId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())),
        get: async (orgId, id) => clone(d.products.find((x) => x.orgId === org && x.orgId === orgId && x.id === id) ?? null),
        byKeys: async (orgId, keys) => clone(d.products.filter((x) => x.orgId === org && x.orgId === orgId && keys.includes(x.key))),
        byNameKeys: async (orgId, nameKeys) => clone(d.products.filter((x) => x.orgId === org && x.orgId === orgId && nameKeys.includes(x.nameKey))),
        insert: async (rows) => {
          for (const row of rows) {
            if (row.orgId !== org) deny("product_catalog");
            if (d.products.some((x) => x.orgId === row.orgId && x.key === row.key)) throw new Error("duplicate key value violates unique constraint \"product_catalog_org_key_uq\"");
          }
          d.products = [...d.products, ...rows.map(clone)];
        },
        update: async (row) => {
          if (row.orgId !== org) deny("product_catalog");
          d.products = d.products.map((x) => (x.orgId === org && x.id === row.id ? clone(row) : x));
        },
        remove: async (orgId, ids) => {
          const before = d.products.length;
          d.products = d.products.filter((x) => !(x.orgId === org && x.orgId === orgId && ids.includes(x.id)));
          return before - d.products.length;
        },
      },
      exchangeRates: {
        latest: async (currency, date) => {
          const r = d.exchangeRates.filter((x) => x.currency === currency && x.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0];
          return r ? { rate: r.rate, date: r.date, source: r.source ?? "SEED", snapshotAt: r.snapshotAt ?? null } : null;
        },
      },
    };
    return fn(repos);
  }
}
