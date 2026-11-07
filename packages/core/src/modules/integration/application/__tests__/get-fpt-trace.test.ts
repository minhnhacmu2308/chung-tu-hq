// GỠ LỖI TẠM (FPT_DEBUG_TRACE): use case đọc nhật ký API FPT của hồ sơ.
import { describe, expect, it } from "vitest";
import type { FptTraceEntry } from "@kb/contracts";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId } from "../../../../shared/ids.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import type { CustomsDeps, FptTraceReader } from "../customs-ports.js";
import { getFptTrace } from "../get-fpt-trace.js";

const ctx: Ctx = { orgId: asOrgId("org_1"), userId: asUserId("usr_1"), role: "DECLARANT" };
const ENTRY: FptTraceEntry = { id: "t1", at: "2026-11-03T08:00:00.000Z", operation: "IDA", path: "/api/IDA", dossierId: "dos_1", status: 200, durationMs: 5, request: {}, response: {}, error: null };
const deps = (fptTrace?: FptTraceReader, found = true) =>
  ({ dossiers: { get: async (orgId: string, id: string) => (found && orgId === "org_1" ? { id } : null) }, ...(fptTrace ? { fptTrace } : {}) }) as unknown as CustomsDeps;

describe("getFptTrace", () => {
  it("tắt FPT_DEBUG_TRACE → enabled false, không có dòng", async () => {
    expect(unwrap(await getFptTrace(deps(), ctx, "dos_1"))).toEqual({ enabled: false, entries: [] });
  });
  it("bật → đọc theo orgId của phiên + hồ sơ", async () => {
    const calls: string[] = [];
    const reader: FptTraceReader = { list: async (orgId, dossierId) => (calls.push(`${orgId}/${dossierId}`), [ENTRY]) };
    expect(unwrap(await getFptTrace(deps(reader), ctx, "dos_1"))).toEqual({ enabled: true, entries: [ENTRY] });
    expect(calls).toEqual(["org_1/dos_1"]);
  });
  it("hồ sơ không thuộc doanh nghiệp → NOT_FOUND", async () => {
    expect(errCode(await getFptTrace(deps({ list: async () => [ENTRY] }, false), ctx, "dos_x"))).toBe("NOT_FOUND");
  });
});
