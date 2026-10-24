// Route Hải quan / AMA theo tờ khai nhánh: `branch` parse Zod ở biên (thân POST/PATCH, query GET/DELETE), mặc định tờ 1, sai → 400.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ok = (value: unknown) => ({ ok: true, value });
const uc = vi.hoisted(() => ({
  performOperation: vi.fn(), resendOperation: vi.fn(), startPostAmendment: vi.fn(), getPostAmendmentView: vi.fn(), updatePostAmendmentField: vi.fn(),
  addPostAmendmentLines: vi.fn(), removePostAmendmentLine: vi.fn(), approvePostAmendment: vi.fn(), copyPostAmendmentHeader: vi.fn(),
}));
const customs = { tag: "customs" };
const session = { ctx: { orgId: "org_a", userId: "usr_a", role: "DECLARANT" } };
vi.mock("@kb/core/modules/integration", () => uc);
vi.mock("@/container", () => ({ getContainer: () => ({ customs }) }));
vi.mock("@/lib/server/auth", () => ({ requireSession: async () => session }));

const D = "dos_1";
const call = async (mod: Promise<Record<string, unknown>>, method: string, path: string, body?: unknown, params: Record<string, string> = { id: D }) => {
  const handler = (await mod)[method] as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
  const req = new NextRequest(`http://localhost/api/dossiers/${D}${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
  return handler(req, { params: Promise.resolve(params) });
};

beforeEach(() => {
  for (const f of Object.values(uc)) f.mockReset().mockResolvedValue(ok({ done: true }));
});

describe("route Hải quan theo tờ khai nhánh", () => {
  it("operations / resend: branch trong thân, vắng → 1; branch 0 → 400 không gọi use case", async () => {
    const ops = import("./submission/operations/route");
    expect((await call(ops, "POST", "/submission/operations", { operation: "IDC" })).status).toBe(200);
    expect(uc.performOperation).toHaveBeenLastCalledWith(customs, session.ctx, D, "IDC", 1);
    await call(ops, "POST", "/submission/operations", { operation: "IDC", branch: 3 });
    expect(uc.performOperation).toHaveBeenLastCalledWith(customs, session.ctx, D, "IDC", 3);
    expect((await call(ops, "POST", "/submission/operations", { operation: "IDC", branch: 0 })).status).toBe(400);
    expect(uc.performOperation).toHaveBeenCalledTimes(2);
    await call(import("./submission/resend/route"), "POST", "/submission/resend", { operation: "IDA", branch: 2 });
    expect(uc.resendOperation).toHaveBeenLastCalledWith(customs, session.ctx, D, "IDA", 2);
  });

  it("bắt đầu sửa sau thông quan: branch trong thân (thân rỗng {} → tờ 1)", async () => {
    const mod = import("./submission/post-amendment/route");
    await call(mod, "POST", "/submission/post-amendment", {});
    expect(uc.startPostAmendment).toHaveBeenLastCalledWith(customs, session.ctx, D, 1);
    await call(mod, "POST", "/submission/post-amendment", { branch: 2 });
    expect(uc.startPostAmendment).toHaveBeenLastCalledWith(customs, session.ctx, D, 2);
  });

  it("AMA: xem (?branch=), sửa ô / thêm dòng / duyệt (thân), bỏ dòng (?branch=)", async () => {
    const view = import("./post-amendment/route");
    await call(view, "GET", "/post-amendment?branch=2");
    expect(uc.getPostAmendmentView).toHaveBeenLastCalledWith(customs, session.ctx, D, 2);
    await call(view, "GET", "/post-amendment");
    expect(uc.getPostAmendmentView).toHaveBeenLastCalledWith(customs, session.ctx, D, 1);
    expect((await call(view, "GET", "/post-amendment?branch=x")).status).toBe(400);

    await call(import("./post-amendment/fields/route"), "PATCH", "/post-amendment/fields", { key: "TK_REF", value: "A", branch: 2 });
    expect(uc.updatePostAmendmentField).toHaveBeenLastCalledWith(customs, session.ctx, D, { key: "TK_REF", value: "A" }, 2);
    await call(import("./post-amendment/lines/route"), "POST", "/post-amendment/lines", { lineNos: [1, 2], branch: 3 });
    expect(uc.addPostAmendmentLines).toHaveBeenLastCalledWith(customs, session.ctx, D, [1, 2], 3);
    await call(import("./post-amendment/approve/route"), "POST", "/post-amendment/approve", { branch: 2 });
    expect(uc.approvePostAmendment).toHaveBeenLastCalledWith(customs, session.ctx, D, 2);
    await call(import("./post-amendment/lines/[lineId]/route"), "DELETE", "/post-amendment/lines/pal_1?branch=2", undefined, { id: D, lineId: "pal_1" });
    expect(uc.removePostAmendmentLine).toHaveBeenLastCalledWith(customs, session.ctx, D, "pal_1", 2);
  });

  it("nhân bản chỉ tiêu chung: POST copy-header, thân CopyPostAmendmentHeader; thiếu keys → 400", async () => {
    const mod = import("./post-amendment/copy-header/route");
    uc.copyPostAmendmentHeader.mockResolvedValue(ok({ applied: [2], skipped: [{ no: 3, reason: "NOT_CLEARED" }] }));
    const res = await call(mod, "POST", "/post-amendment/copy-header", { fromBranch: 1, keys: ["TK_REF"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: [2], skipped: [{ no: 3, reason: "NOT_CLEARED" }] });
    expect(uc.copyPostAmendmentHeader).toHaveBeenLastCalledWith(customs, session.ctx, D, { fromBranch: 1, keys: ["TK_REF"] });
    expect((await call(mod, "POST", "/post-amendment/copy-header", { fromBranch: 1, keys: [] })).status).toBe(400);
  });
});
