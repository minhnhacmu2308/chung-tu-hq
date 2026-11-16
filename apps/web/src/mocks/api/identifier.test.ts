import { IdentifierViewSchema, type IdentifierRequest } from "@kb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb, saveDb } from "@/mocks/db";
import { getIdentifier, IDENTIFIER_REPLY_MS, pollIdentifier, sendIdentifier } from "./identifier";

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

const D = "dos_029";
const REQ: IdentifierRequest = { objectType: "1", goodsType: "1", customsOffice: "03CE", taxCode: "0316789012", companyName: "AN PHÁT" };
const err = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; reason?: string }) => e);
const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
  resetDb();
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-15T03:00:00Z") });
});

describe("Khai báo định danh (mock)", () => {
  it("chưa gửi → latest null; gửi → SENDING; sau thời gian trả lời → ACCEPTED có số định danh, QR, câu kết quả (đúng schema)", async () => {
    expect(await getIdentifier(D)).toEqual({ dossierId: D, latest: null });
    const sent = await sendIdentifier(D, REQ);
    // Như cổng thật lúc Hải quan chưa xử lý xong: có REF_ID + số tiếp nhận (tranG_THAI 11), chưa có số định danh.
    expect(sent.latest).toMatchObject({ attempt: 1, status: "SENDING", request: REQ, customsState: "11", identifierNo: null, receiptDate: "2026-11-15" });
    expect(sent.latest!.refId).toBeTruthy();
    expect(sent.latest!.receiptNo).toMatch(/^1192\d{8}$/);
    wait(IDENTIFIER_REPLY_MS + 10);
    const view = IdentifierViewSchema.parse(await getIdentifier(D));
    expect(view.latest).toMatchObject({ status: "ACCEPTED", customsState: "15", identifiedOn: "2026-11-15", receiptDate: "2026-11-15", receiptNo: sent.latest!.receiptNo });
    expect(view.latest!.identifierNo).toMatch(/^1226\d{11}$/);
    expect(view.latest!.qrPng).toBeTruthy();
    expect(view.latest!.resultText).toContain(view.latest!.identifierNo!);
  });
  it("đang chờ → gửi lại bị chặn KVGS_ALREADY_SENDING; Hỏi kết quả chốt ngay; xong rồi gửi lại thành lần 2", async () => {
    await sendIdentifier(D, REQ);
    expect(await err(sendIdentifier(D, REQ))).toMatchObject({ code: "INVALID_STATE", reason: "KVGS_ALREADY_SENDING" });
    expect((await pollIdentifier(D)).latest!.status).toBe("ACCEPTED");
    expect((await sendIdentifier(D, { ...REQ, goodsType: "3" })).latest).toMatchObject({ attempt: 2, status: "SENDING", request: { goodsType: "3" } });
  });
  it("MST bắt đầu 9 → Hải quan từ chối kèm lỗi", async () => {
    await sendIdentifier(D, { ...REQ, taxCode: "9000000000" });
    const v = await pollIdentifier(D);
    expect(v.latest).toMatchObject({ status: "REJECTED", customsState: "10", errors: [expect.objectContaining({ code: "E-IDENT-REJ", field: "MA_DV" })] });
  });
  it("Hỏi kết quả khi không có lần gửi đang chờ → INVALID_STATE; hồ sơ không tồn tại → NOT_FOUND", async () => {
    expect(await err(pollIdentifier(D))).toMatchObject({ code: "INVALID_STATE" });
    expect(await err(getIdentifier("dos_khong_co"))).toMatchObject({ code: "NOT_FOUND" });
  });
});
