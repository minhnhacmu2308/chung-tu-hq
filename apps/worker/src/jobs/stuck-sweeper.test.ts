import { describe, expect, it } from "vitest";
import { stuckSweeperJob, type SweeperDeps } from "./stuck-sweeper.js";

/** Deps giả: chỉ cần uow của identity (danh sách org) và các uow module khác trả danh sách kẹt theo org. */
function fakeDeps(opts: { orgs: { id: string; status?: string }[]; stuckDocsFor?: string; throwFor?: string }): SweeperDeps {
  const asOrg = (fn: (r: unknown) => unknown, repos: unknown) => fn(repos);
  const outboxRepos = { outbox: { listUnsentBefore: async () => [] } };
  const mailRepos = { connections: { listSyncingBefore: async () => [] } };
  const runRepos = { agentRuns: { listRunningBefore: async () => [] }, hsJobs: { openForDossier: async () => [] } };
  const docRepos = (orgId: string) => ({
    documents: {
      listStuckQueued: async () => {
        if (orgId === opts.throwFor) throw new Error("db down");
        return orgId === opts.stuckDocsFor ? [{ id: "doc_1", dossierId: "dos_1", sha256: "abc", updatedAt: new Date(0) }] : [];
      },
      update: async () => {},
    },
  });
  const queue = { enqueue: async () => {} };
  const clock = { now: () => new Date("2026-10-23T00:00:00Z") };
  return {
    identity: { uow: { system: async (fn: (r: unknown) => unknown) => fn({ orgs: { listAll: async () => opts.orgs } }) } },
    dossier: { uow: { asOrg: async (ctx: { orgId: string }, fn: (r: unknown) => unknown) => asOrg(fn, docRepos(ctx.orgId)) }, queue, clock },
    declaration: { uow: { asOrg: async (_c: unknown, fn: (r: unknown) => unknown) => asOrg(fn, runRepos) }, clock },
    customs: { uow: { asOrg: async (_c: unknown, fn: (r: unknown) => unknown) => asOrg(fn, outboxRepos) }, queue, clock },
    mailbox: { uow: { asOrg: async (_c: unknown, fn: (r: unknown) => unknown) => asOrg(fn, mailRepos) }, clock },
  } as unknown as SweeperDeps;
}

describe("stuckSweeperJob", () => {
  it("chạy theo từng doanh nghiệp đang hoạt động, bỏ qua doanh nghiệp tạm khóa, cộng dồn số bản ghi đã gỡ", async () => {
    const r = await stuckSweeperJob(fakeDeps({ orgs: [{ id: "org_a" }, { id: "org_b", status: "SUSPENDED" }, { id: "org_c" }], stuckDocsFor: "org_c" }));
    expect(r).toEqual({ orgs: 2, documents: 1, agentRuns: 0, outbox: 0, mailboxes: 0 });
  });
  it("lỗi ở một doanh nghiệp không chặn doanh nghiệp khác", async () => {
    const r = await stuckSweeperJob(fakeDeps({ orgs: [{ id: "org_a" }, { id: "org_c" }], throwFor: "org_a", stuckDocsFor: "org_c" }));
    expect(r).toEqual({ orgs: 2, documents: 1, agentRuns: 0, outbox: 0, mailboxes: 0 });
  });
});
