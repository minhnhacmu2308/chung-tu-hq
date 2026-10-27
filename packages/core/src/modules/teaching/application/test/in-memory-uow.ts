import type { StoredLesson, TeachRepos, TeachSampleRow, TeachUow } from "../ports.js";

/** Kho trong bộ nhớ cho test use case: mọi truy vấn lọc theo org như repo thật (RLS). */
export class InMemoryTeachUow implements TeachUow {
  readonly settings = new Map<string, boolean>();
  readonly samples: TeachSampleRow[] = [];
  readonly lessons: StoredLesson[] = [];
  asOrg<T>(_ctx: unknown, fn: (r: TeachRepos) => Promise<T>): Promise<T> {
    const self = this;
    const repos: TeachRepos = {
      settings: { enabled: async (orgId) => self.settings.get(orgId) ?? false, set: async (orgId, enabled) => void self.settings.set(orgId, enabled) },
      samples: {
        list: async (orgId, limit) => self.samples.filter((s) => s.orgId === orgId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit),
        get: async (orgId, id) => self.samples.find((s) => s.orgId === orgId && s.id === id) ?? null,
        insert: async (row) => void self.samples.push({ ...row }),
        update: async (orgId, id, patch) => {
          const s = self.samples.find((x) => x.orgId === orgId && x.id === id);
          if (s) Object.assign(s, patch);
        },
        delete: async (orgId, id) => {
          const i = self.samples.findIndex((x) => x.orgId === orgId && x.id === id);
          if (i >= 0) self.samples.splice(i, 1);
        },
      },
      lessons: {
        list: async (orgId) => self.lessons.filter((l) => l.orgId === orgId),
        get: async (orgId, id) => self.lessons.find((l) => l.orgId === orgId && l.id === id) ?? null,
        byIdentities: async (orgId, ids) => self.lessons.filter((l) => l.orgId === orgId && ids.includes(l.identity)),
        upsert: async (row) => {
          const i = self.lessons.findIndex((l) => l.orgId === row.orgId && l.identity === row.identity);
          if (i >= 0) self.lessons[i] = { ...row, id: self.lessons[i]!.id };
          else self.lessons.push({ ...row });
        },
        update: async (orgId, id, patch) => {
          const l = self.lessons.find((x) => x.orgId === orgId && x.id === id);
          if (l) Object.assign(l, patch);
        },
      },
    };
    return fn(repos);
  }
}
