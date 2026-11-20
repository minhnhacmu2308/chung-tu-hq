// Route số định danh theo lô: parse Zod ở biên (thân / query), use case nhận ctx của phiên.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ok = (value: unknown) => ({ ok: true, value });
const uc = vi.hoisted(() => ({
  requestIdentifierBatch: vi.fn(), listIdentifiers: vi.fn(), deleteIdentifiers: vi.fn(), useIdentifier: vi.fn(), releaseIdentifier: vi.fn(), retryIdentifier: vi.fn(), pollIdentifierById: vi.fn(),
}));
const customs = { tag: "customs" };
const session = { ctx: { orgId: "org_a", userId: "usr_a", role: "DECLARANT" } };
vi.mock("@kb/core/modules/integration", () => uc);
vi.mock("@/container", () => ({ getContainer: () => ({ customs }) }));
vi.mock("@/lib/server/auth", () => ({ requireSession: async () => session }));

const KEY = "11111111-1111-4111-8111-111111111111";
const REQ = { objectType: "1", goodsType: "2", customsOffice: "60CB", taxCode: "0313833810", companyName: "test" };
const call = async (mod: Promise<Record<string, unknown>>, method: string, path: string, body?: unknown, params: Record<string, string> = {}) => {
  const handler = (await mod)[method] as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
  const req = new NextRequest(`http://localhost/api/customs/identifiers${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
  return handler(req, { params: Promise.resolve(params) });
};

beforeEach(() => {
  for (const f of Object.values(uc)) f.mockReset().mockResolvedValue(ok(undefined));
});

describe("route số định danh theo lô", () => {
  it("POST thiếu clientKey → 400, không gọi use case; hợp lệ → gọi với ctx phiên", async () => {
    const mod = import("./route");
    expect((await call(mod, "POST", "", { count: 3, request: REQ })).status).toBe(400);
    expect(uc.requestIdentifierBatch).not.toHaveBeenCalled();
    uc.requestIdentifierBatch.mockResolvedValue(ok({ batchId: KEY, ids: ["a"] }));
    const res = await call(mod, "POST", "", { clientKey: KEY, count: 3, request: REQ });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ batchId: KEY, ids: ["a"] });
    expect(uc.requestIdentifierBatch).toHaveBeenCalledWith(customs, session.ctx, { clientKey: KEY, count: 3, request: REQ });
  });

  it("GET: status lạ → 400; hợp lệ → parse query (offset/limit mặc định)", async () => {
    const mod = import("./route");
    expect((await call(mod, "GET", "?status=FOO")).status).toBe(400);
    expect(uc.listIdentifiers).not.toHaveBeenCalled();
    await call(mod, "GET", "?status=AVAILABLE&q=abc");
    expect(uc.listIdentifiers).toHaveBeenCalledWith(customs, session.ctx, expect.objectContaining({ status: "AVAILABLE", q: "abc" }));
  });

  it("delete: ids rỗng → 400; hợp lệ → deleteIdentifiers", async () => {
    const mod = import("./delete/route");
    expect((await call(mod, "POST", "/delete", { ids: [] })).status).toBe(400);
    uc.deleteIdentifiers.mockResolvedValue(ok({ deleted: ["a"] }));
    expect(await (await call(mod, "POST", "/delete", { ids: ["a"] })).json()).toEqual({ deleted: ["a"] });
    expect(uc.deleteIdentifiers).toHaveBeenCalledWith(customs, session.ctx, ["a"]);
  });

  it("use: POST dossierId trong thân; DELETE dossierId trong query (thiếu → 400)", async () => {
    const mod = import("./[idnId]/use/route");
    const params = { idnId: "idn_1" };
    expect((await call(mod, "POST", "/idn_1/use", {}, params)).status).toBe(400);
    uc.useIdentifier.mockResolvedValue(ok({ identifierNo: "112600050503272" }));
    expect(await (await call(mod, "POST", "/idn_1/use", { dossierId: "dos_1" }, params)).json()).toEqual({ identifierNo: "112600050503272" });
    expect(uc.useIdentifier).toHaveBeenCalledWith(customs, session.ctx, "idn_1", "dos_1");
    expect((await call(mod, "DELETE", "/idn_1/use", undefined, params)).status).toBe(400);
    expect((await call(mod, "DELETE", "/idn_1/use?dossierId=dos_1", undefined, params)).status).toBe(204);
    expect(uc.releaseIdentifier).toHaveBeenCalledWith(customs, session.ctx, "idn_1", "dos_1");
  });

  it("retry / poll: gọi use case theo idnId", async () => {
    const params = { idnId: "idn_1" };
    expect((await call(import("./[idnId]/retry/route"), "POST", "/idn_1/retry", undefined, params)).status).toBe(204);
    expect(uc.retryIdentifier).toHaveBeenCalledWith(customs, session.ctx, "idn_1");
    expect((await call(import("./[idnId]/poll/route"), "POST", "/idn_1/poll", undefined, params)).status).toBe(204);
    expect(uc.pollIdentifierById).toHaveBeenCalledWith(customs, session.ctx, "idn_1");
  });
});
