import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { unwrap } from "../../../../shared/result.js";
import type { AiDossierDraft } from "../../domain/draft.js";
import { createDossier } from "../create-dossier.js";
import { draftDossierWithAi } from "../draft-dossier.js";
import type { DossierBrief, DossierDeps } from "../ports.js";
import { FakePdfInspector, FakeUnzipper, InMemoryStorage, RecordingPublisher } from "../test/fakes.js";
import { InMemoryDossierUow } from "../test/in-memory-uow.js";

const ctx = (role: Ctx["role"] = "DECLARANT", orgId = "org_a", userId = "usr_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId(userId), role });
const INPUT = { direction: "NK" as const, typeCode: "E21", partner: "HANSOL", customsOffice: "03CE – Hải quan cửa khẩu cảng Hải Phòng khu vực 2", skillSetId: "supplier-hansol", dueDate: "2026-10-20", incoterm: "", transportMode: "SEA_CONTAINER" as const, partyClass: "4" as const };
const NONE: AiDossierDraft = { baseDossierCode: null, direction: null, transportMode: null, typeCode: null, customsOffice: null, partner: null, dueInDays: null, note: null };

let deps: DossierDeps;
let reply: AiDossierDraft | Error | null;
let seen: { prompt: string; today: string; recent: DossierBrief[] }[];
let usage: unknown[];
let allowed: boolean;

beforeEach(() => {
  reply = NONE;
  seen = [];
  usage = [];
  allowed = true;
  deps = {
    uow: new InMemoryDossierUow(), queue: new InMemoryJobQueue(), storage: new InMemoryStorage(), publisher: new RecordingPublisher(),
    pdf: new FakePdfInspector(), unzipper: new FakeUnzipper(), quota: { check: async () => true },
    clock: fixedClock("2026-10-31T20:00:00.000Z"), idGen: sequentialIdGen(),
    draftAi: {
      draft: async (input) => {
        seen.push(input);
        if (reply instanceof Error) throw reply;
        return { result: reply, usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 40 } };
      },
    },
    limiter: { hit: async () => ({ allowed }) },
    recordAiUsage: async (u) => void usage.push(u),
  };
});

describe("draftDossierWithAi", () => {
  it("mã hồ sơ gõ trong câu → sao chép thông tin form hồ sơ đó + ghi đè ô AI; ghi usage theo doanh nghiệp; ngày theo giờ VN", async () => {
    const old = unwrap(await createDossier(deps, ctx(), INPUT));
    reply = { ...NONE, transportMode: "AIR" };
    const d = unwrap(await draftDossierWithAi(deps, ctx(), { prompt: `tạo giống ${old.code.toLowerCase()} nhưng đi máy bay` }));
    expect(d).toMatchObject({ direction: "NK", transportMode: "AIR", typeCode: "E21", customsOfficeCode: "03CE", partner: "HANSOL", skillSetId: "supplier-hansol", fromDossier: { id: old.id, code: old.code } });
    expect(seen[0]).toMatchObject({ today: "2026-11-01", recent: [{ code: old.code, partner: "HANSOL" }] });
    expect(usage).toEqual([{ orgId: "org_a", kind: "AI_DOSSIER_DRAFT", model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 40 }]);
  });
  it("AI nhận ra hồ sơ gốc theo mô tả (baseDossierCode); mã không có trong doanh nghiệp → không sao chép", async () => {
    const old = unwrap(await createDossier(deps, ctx(), INPUT));
    reply = { ...NONE, baseDossierCode: old.code };
    expect(unwrap(await draftDossierWithAi(deps, ctx(), { prompt: "như lô HANSOL lần trước" })).fromDossier?.id).toBe(old.id);
    reply = { ...NONE, baseDossierCode: "HS-NK-2610-999" };
    expect(unwrap(await draftDossierWithAi(deps, ctx(), { prompt: "như lô kia" })).fromDossier).toBeUndefined();
  });
  it("org khác: không thấy hồ sơ của org A trong danh sách gửi AI, không sao chép được", async () => {
    const old = unwrap(await createDossier(deps, ctx(), INPUT));
    reply = { ...NONE, baseDossierCode: old.code };
    const d = unwrap(await draftDossierWithAi(deps, ctx("OWNER", "org_b", "usr_b"), { prompt: `giống ${old.code}` }));
    expect(d.fromDossier).toBeUndefined();
    expect(seen.at(-1)?.recent).toEqual([]);
  });
  it("VIEWER không dùng được; chưa nối AI / quá lượt / AI lỗi → mã lý do, không gọi AI khi bị chặn", async () => {
    expect((await draftDossierWithAi(deps, ctx("VIEWER"), { prompt: "abc" })).ok).toBe(false);
    allowed = false;
    const limited = await draftDossierWithAi(deps, ctx(), { prompt: "abc" });
    expect(!limited.ok && limited.error).toMatchObject({ code: "RATE_LIMITED", reason: "DOSSIER_AI_RATE_LIMITED" });
    expect(seen).toHaveLength(0);
    allowed = true;
    reply = new Error("timeout");
    const failed = await draftDossierWithAi(deps, ctx(), { prompt: "abc" });
    expect(!failed.ok && failed.error).toMatchObject({ code: "GATEWAY_ERROR", reason: "DOSSIER_AI_FAILED" });
    expect(usage).toHaveLength(0);
    // Model trả lời nhưng JSON hỏng (từ chối / bị cắt) → token đã tốn: vẫn ghi usage, báo lỗi.
    reply = null;
    const broken = await draftDossierWithAi(deps, ctx(), { prompt: "abc" });
    expect(!broken.ok && broken.error).toMatchObject({ code: "GATEWAY_ERROR", reason: "DOSSIER_AI_FAILED" });
    expect(usage).toEqual([{ orgId: "org_a", kind: "AI_DOSSIER_DRAFT", model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 40 }]);
    const { draftAi: _, ...noAi } = deps;
    const off = await draftDossierWithAi(noAi, ctx(), { prompt: "abc" });
    expect(!off.ok && off.error).toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED", reason: "DOSSIER_AI_NOT_CONFIGURED" });
  });
});
