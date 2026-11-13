import type { OrgId, UserId } from "../../../../shared/ids.js";
import { formatItemNo } from "../../domain/item-no.js";
import type { CatalogImportRow, CatalogItemRow, CatalogRepos, CatalogSettingsRow, CatalogUow, CodeSetRow, ItemAliasRow, ItemConversionRow, MatchQueueRow } from "../ports.js";

/** Fake mô phỏng RLS theo org và các unique của schema: (org,item_no), (bộ,code_key) ACTIVE, primary/default mỗi org, (item,unit). */
export class InMemoryCatalogUow implements CatalogUow {
  readonly data = {
    settings: [] as CatalogSettingsRow[],
    items: [] as CatalogItemRow[],
    codeSets: [] as CodeSetRow[],
    owners: [] as { codeSetId: string; userId: string; orgId: string }[],
    aliases: [] as ItemAliasRow[],
    conversions: [] as ItemConversionRow[],
    queue: [] as MatchQueueRow[],
    imports: [] as CatalogImportRow[],
  };

  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: CatalogRepos) => Promise<T>): Promise<T> {
    const d = this.data;
    const org = ctx.orgId as string;
    const deny = (w: string): never => {
      throw new Error(`new row violates row-level security policy (${w})`);
    };
    const dup = (c: string): never => {
      throw new Error(`duplicate key value violates unique constraint ${c}`);
    };
    const clone = <X>(x: X): X => structuredClone(x);
    const mine = <X extends { orgId: string }>(xs: X[], orgId: string) => xs.filter((x) => x.orgId === org && x.orgId === orgId);
    const patchOf = <X extends { orgId: string }>(xs: X[], orgId: string, pred: (x: X) => boolean, patch: object) => {
      if (orgId !== org) deny("update orgId khác ngữ cảnh");
      const x = xs.find((y) => y.orgId === org && pred(y));
      if (x) Object.assign(x, clone(patch));
    };
    const checkSet = (row: CodeSetRow, self?: string) => {
      if (row.isPrimaryDisplay && d.codeSets.some((s) => s.orgId === row.orgId && s.id !== self && s.isPrimaryDisplay)) dup("code_sets_org_primary_uq");
      if (row.isDefault && d.codeSets.some((s) => s.orgId === row.orgId && s.id !== self && s.isDefault)) dup("code_sets_org_default_uq");
    };
    const checkAlias = (row: ItemAliasRow, self?: string) => {
      if (row.status === "ACTIVE" && d.aliases.some((a) => a.id !== self && a.codeSetId === row.codeSetId && a.codeKey === row.codeKey && a.status === "ACTIVE")) dup("item_aliases_set_code_active_uq");
    };

    return fn({
      settings: {
        get: async (orgId) => clone(mine(d.settings, orgId)[0] ?? null),
        upsert: async (orgId, patch, now) => {
          if (orgId !== org) deny("catalog_settings");
          let s = d.settings.find((x) => x.orgId === org);
          if (!s) {
            s = { orgId: org, mode: null, itemNoPrefix: "MH-", itemNoSeq: 0, setupAt: null, createdAt: now, updatedAt: now };
            d.settings.push(s);
          }
          Object.assign(s, clone(patch), { updatedAt: now });
          return clone(s);
        },
        nextItemNo: async (orgId) => {
          if (orgId !== org) deny("catalog_settings");
          let s = d.settings.find((x) => x.orgId === org);
          if (!s) {
            const at = new Date(0);
            s = { orgId: org, mode: null, itemNoPrefix: "MH-", itemNoSeq: 0, setupAt: null, createdAt: at, updatedAt: at };
            d.settings.push(s);
          }
          s.itemNoSeq += 1;
          return formatItemNo(s.itemNoPrefix, s.itemNoSeq);
        },
      },
      items: {
        get: async (orgId, id) => clone(mine(d.items, orgId).find((x) => x.id === id) ?? null),
        getMany: async (orgId, ids) => clone(mine(d.items, orgId).filter((x) => ids.includes(x.id))),
        findByItemNo: async (orgId, itemNo) => clone(mine(d.items, orgId).find((x) => x.itemNo === itemNo) ?? null),
        resolveMerged: async (orgId, id) => {
          const seen = new Set<string>();
          let cur: string | null = id;
          while (cur !== null) {
            if (seen.has(cur)) return null;
            seen.add(cur);
            const row: CatalogItemRow | undefined = mine(d.items, orgId).find((x) => x.id === cur);
            if (!row) return null;
            if (row.status !== "MERGED" || row.mergedIntoId === null) return clone(row);
            cur = row.mergedIntoId;
          }
          return null;
        },
        list: async (orgId, f) => clone(mine(d.items, orgId).filter((x) => !f?.status || x.status === f.status).sort((a, b) => a.itemNo.localeCompare(b.itemNo))),
        insert: async (row) => {
          if (row.orgId !== org) deny("catalog_items");
          if (d.items.some((x) => x.id === row.id)) dup("catalog_items_pkey");
          if (d.items.some((x) => x.orgId === row.orgId && x.itemNo === row.itemNo)) dup("catalog_items_org_item_no_uq");
          d.items.push(clone(row));
        },
        update: async (orgId, id, patch) => patchOf(d.items, orgId, (x) => x.id === id, patch),
        incrementDeclared: async (orgId, id, patch) => {
          const x = mine(d.items, orgId).find((y) => y.id === id);
          if (x) Object.assign(x, patch, { timesDeclared: x.timesDeclared + 1 });
        },
        lockForUpdate: async () => {},
        markMerged: async (orgId, id, intoId, by, at) => {
          if (orgId !== org) deny("update orgId khác ngữ cảnh");
          const x = d.items.find((y) => y.orgId === org && y.id === id && y.status !== "MERGED");
          if (!x) return false;
          Object.assign(x, { status: "MERGED", mergedIntoId: intoId, updatedBy: by, updatedAt: at });
          return true;
        },
      },
      codeSets: {
        get: async (orgId, id) => clone(mine(d.codeSets, orgId).find((x) => x.id === id) ?? null),
        list: async (orgId) => clone(mine(d.codeSets, orgId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))),
        insert: async (row) => {
          if (row.orgId !== org) deny("code_sets");
          checkSet(row);
          d.codeSets.push(clone(row));
        },
        update: async (orgId, id, patch) => {
          const cur = mine(d.codeSets, orgId).find((x) => x.id === id);
          if (cur) checkSet({ ...cur, ...patch }, id);
          patchOf(d.codeSets, orgId, (x) => x.id === id, patch);
        },
      },
      owners: {
        list: async (orgId, setId) => mine(d.owners, orgId).filter((o) => o.codeSetId === setId).map((o) => o.userId).sort(),
        replace: async (orgId, setId, userIds) => {
          if (orgId !== org) deny("code_set_owners");
          d.owners = d.owners.filter((o) => !(o.orgId === org && o.codeSetId === setId));
          for (const userId of new Set(userIds)) d.owners.push({ codeSetId: setId, userId, orgId: org });
        },
        isOwner: async (orgId, setId, userId) => mine(d.owners, orgId).some((o) => o.codeSetId === setId && o.userId === userId),
      },
      aliases: {
        get: async (orgId, id) => clone(mine(d.aliases, orgId).find((x) => x.id === id) ?? null),
        findActive: async (orgId, setId, key) => clone(mine(d.aliases, orgId).find((x) => x.codeSetId === setId && x.codeKey === key && x.status === "ACTIVE") ?? null),
        listActiveByCodeKey: async (orgId, key) => clone(mine(d.aliases, orgId).filter((x) => x.codeKey === key && x.status === "ACTIVE")),
        listForItem: async (orgId, itemId) => clone(mine(d.aliases, orgId).filter((x) => x.itemId === itemId)),
        listForItems: async (orgId, itemIds) => clone(mine(d.aliases, orgId).filter((x) => itemIds.includes(x.itemId))),
        listForCodeSet: async (orgId, setId, f) => clone(mine(d.aliases, orgId).filter((x) => x.codeSetId === setId && (!f?.status || x.status === f.status)).sort((a, b) => a.codeKey.localeCompare(b.codeKey))),
        listByOrg: async (orgId, f) => clone(mine(d.aliases, orgId).filter((x) => !f?.status || x.status === f.status).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))),
        insert: async (row) => {
          if (row.orgId !== org) deny("item_aliases");
          checkAlias(row);
          d.aliases.push(clone(row));
        },
        update: async (orgId, id, patch) => {
          const cur = mine(d.aliases, orgId).find((x) => x.id === id);
          if (cur) checkAlias({ ...cur, ...patch }, id);
          patchOf(d.aliases, orgId, (x) => x.id === id, patch);
        },
      },
      conversions: {
        listForItem: async (orgId, itemId) => clone(mine(d.conversions, orgId).filter((x) => x.itemId === itemId).sort((a, b) => a.unit.localeCompare(b.unit))),
        listForItems: async (orgId, itemIds) => clone(mine(d.conversions, orgId).filter((x) => itemIds.includes(x.itemId)).sort((a, b) => a.unit.localeCompare(b.unit))),
        listByOrg: async (orgId) => clone(mine(d.conversions, orgId).sort((a, b) => a.itemId.localeCompare(b.itemId) || a.unit.localeCompare(b.unit))),
        upsert: async (row) => {
          if (row.orgId !== org) deny("item_unit_conversions");
          const i = d.conversions.findIndex((x) => x.itemId === row.itemId && x.unit === row.unit);
          if (i >= 0) d.conversions[i] = { ...d.conversions[i]!, factor: row.factor, updatedAt: row.updatedAt };
          else d.conversions.push(clone(row));
        },
        delete: async (orgId, itemId, unit) => {
          if (orgId !== org) deny("item_unit_conversions");
          d.conversions = d.conversions.filter((x) => !(x.orgId === org && x.itemId === itemId && x.unit === unit));
        },
      },
      queue: {
        get: async (orgId, id) => clone(mine(d.queue, orgId).find((x) => x.id === id) ?? null),
        list: async (orgId, f) => clone(mine(d.queue, orgId).filter((x) => (!f?.status || x.status === f.status) && (!f?.codeSetId || x.codeSetId === f.codeSetId) && (!f?.importId || x.importId === f.importId))),
        insert: async (row) => {
          if (row.orgId !== org) deny("catalog_match_queue");
          if (row.importId && row.importRow != null && d.queue.some((x) => x.importId === row.importId && x.importRow === row.importRow)) dup("catalog_match_queue_import_row_uq");
          d.queue.push(clone(row));
        },
        update: async (orgId, id, patch) => patchOf(d.queue, orgId, (x) => x.id === id, patch),
        claim: async (orgId, id, patch) => {
          if (orgId !== org) deny("update orgId khác ngữ cảnh");
          const x = d.queue.find((y) => y.orgId === org && y.id === id && y.status === "PENDING");
          if (!x) return false;
          Object.assign(x, clone(patch));
          return true;
        },
      },
      imports: {
        get: async (orgId, id) => clone(mine(d.imports, orgId).find((x) => x.id === id) ?? null),
        getForUpdate: async (orgId, id) => clone(mine(d.imports, orgId).find((x) => x.id === id) ?? null),
        list: async (orgId) => clone(mine(d.imports, orgId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
        insert: async (row) => {
          if (row.orgId !== org) deny("catalog_imports");
          d.imports.push(clone(row));
        },
        update: async (orgId, id, patch) => patchOf(d.imports, orgId, (x) => x.id === id, patch),
        bumpCounts: async (orgId, id, delta, now) => {
          if (orgId !== org) deny("update orgId khác ngữ cảnh");
          const x = d.imports.find((y) => y.orgId === org && y.id === id);
          if (!x) return;
          for (const k of ["created", "matched", "queued", "skipped", "errors"] as const) x.counts[k] = Math.max(0, (x.counts[k] ?? 0) + (delta[k] ?? 0));
          x.updatedAt = now;
        },
      },
    });
  }
}
