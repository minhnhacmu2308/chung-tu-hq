import { IdentifierListSchema, type IdentifierRequest } from "@kb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb, saveDb } from "@/mocks/db";
import { deleteIdentifiers, listIdentifiers, pollIdentifierRow, releaseIdentifier, requestIdentifierBatch, retryIdentifier, takeIdentifier } from "./customs-ops";
import { IDENTIFIER_REPLY_MS } from "./identifier";

vi.mock("@/lib/mock-request", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/mock-request")>();
  return {
    ...real,
    query: async <T,>(fn: (db: ReturnType<typeof getDb>) => T) => structuredClone(fn(getDb())),
    mutate: async <T,>(fn: (db: ReturnType<typeof getDb>) => T) => {
      const r = fn(getDb());
      saveDb();
      return structuredClone(r);
    },
  };
});

const REQ: IdentifierRequest = { objectType: "1", goodsType: "1", customsOffice: "03CE", taxCode: "0316789012", companyName: "AN PHÁT" };
const K1 = "11111111-1111-4111-8111-111111111111";
const K2 = "22222222-2222-4222-8222-222222222222";
const err = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; reason?: string }) => e);
const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
  resetDb();
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-15T03:00:00Z") });
});

describe("Số định danh theo lô (mock)", () => {
  it("đăng ký lô → N dòng SENDING cùng batchId; sau thời gian trả lời → AVAILABLE có số (đúng schema)", async () => {
    const b = await requestIdentifierBatch({ clientKey: K1, count: 3, request: REQ });
    expect(b).toEqual({ batchId: K1, ids: [expect.any(String), expect.any(String), expect.any(String)] });
    const first = await listIdentifiers({});
    expect(first.items.map((x) => [x.displayStatus, x.batchIndex])).toEqual([["SENDING", 1], ["SENDING", 2], ["SENDING", 3]]);
    wait(IDENTIFIER_REPLY_MS + 2_000);
    const later = IdentifierListSchema.parse(await listIdentifiers({}));
    expect(later.items.every((x) => x.displayStatus === "AVAILABLE" && /^1226\d{11}$/.test(x.identifierNo!) && x.expiresOn === "2026-12-31")).toBe(true);
    expect(later.expiringCount).toBe(0);
  });

  it("cùng clientKey → trả lô đã có, không tạo thêm dòng", async () => {
    const a = await requestIdentifierBatch({ clientKey: K1, count: 2, request: REQ });
    const b = await requestIdentifierBatch({ clientKey: K1, count: 2, request: REQ });
    expect(b).toEqual(a);
    expect((await listIdentifiers({})).total).toBe(2);
  });

  it("lọc theo trạng thái / chi cục / lô / tìm; đếm sắp hết hạn từ 01/12", async () => {
    await requestIdentifierBatch({ clientKey: K1, count: 2, request: REQ });
    await requestIdentifierBatch({ clientKey: K2, count: 1, request: { ...REQ, taxCode: "9000000000", customsOffice: "02CI" } });
    wait(IDENTIFIER_REPLY_MS + 2_000);
    expect((await listIdentifiers({ status: "REJECTED" })).items.map((x) => x.batchId)).toEqual([K2]);
    expect((await listIdentifiers({ customsOffice: "03CE" })).total).toBe(2);
    expect((await listIdentifiers({ batchId: K2 })).total).toBe(1);
    const no = (await listIdentifiers({ status: "AVAILABLE" })).items[0]!.identifierNo!;
    expect((await listIdentifiers({ q: no.slice(-6) })).items.map((x) => x.identifierNo)).toEqual([no]);
    vi.setSystemTime(new Date("2026-12-02T03:00:00Z"));
    const dec = await listIdentifiers({});
    expect(dec.expiringCount).toBe(2);
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z")); // 07:00 giờ VN 01/01
    expect((await listIdentifiers({ status: "EXPIRED" })).total).toBe(2);
  });

  it("xóa chỉ dòng bị từ chối / không phản hồi chưa có số; gửi lại dòng lỗi về SENDING lần 2", async () => {
    const ok = await requestIdentifierBatch({ clientKey: K1, count: 1, request: REQ });
    const bad = await requestIdentifierBatch({ clientKey: K2, count: 2, request: { ...REQ, taxCode: "9000000000" } });
    wait(IDENTIFIER_REPLY_MS + 2_000);
    await listIdentifiers({});
    expect(await retryIdentifier(bad.ids[1]!)).toBeUndefined();
    expect((await listIdentifiers({ batchId: K2 })).items.find((x) => x.id === bad.ids[1])).toMatchObject({ status: "SENDING", attempt: 2 });
    expect(await err(retryIdentifier(ok.ids[0]!))).toMatchObject({ code: "INVALID_STATE" });
    expect(await deleteIdentifiers([ok.ids[0]!, bad.ids[0]!, bad.ids[1]!])).toEqual({ deleted: [bad.ids[0]] });
    expect((await listIdentifiers({})).total).toBe(2);
  });

  it("Hỏi kết quả chốt ngay; dùng số / trả lại số; số đã dùng → IDENTIFIER_TAKEN", async () => {
    const b = await requestIdentifierBatch({ clientKey: K1, count: 1, request: REQ });
    const id = b.ids[0]!;
    await pollIdentifierRow(id);
    const { identifierNo } = await takeIdentifier(id, "dos_029");
    expect((await listIdentifiers({ status: "USED" })).items[0]).toMatchObject({ identifierNo, usedByDossierId: "dos_029" });
    expect(await err(takeIdentifier(id, "dos_019"))).toMatchObject({ reason: "IDENTIFIER_TAKEN" });
    await releaseIdentifier(id, "dos_029");
    expect((await listIdentifiers({ status: "AVAILABLE" })).total).toBe(1);
    expect(await err(pollIdentifierRow(id))).toMatchObject({ code: "INVALID_STATE" });
  });
});
