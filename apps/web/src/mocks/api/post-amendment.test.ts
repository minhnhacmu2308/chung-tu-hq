import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb, saveDb } from "@/mocks/db";
import { performOperation, startPostAmendment, submitDeclaration } from "./customs";
import { addPostAmendmentLines, approvePostAmendment, copyPostAmendmentHeader, getPostAmendmentView, removePostAmendmentLine, updatePostAmendmentField } from "./post-amendment";

// HYS có test riêng (hys.test.ts): ở đây tắt gợi ý để guard HYS_SUGGESTED không chen vào các ca khai báo.
vi.mock("@/mocks/hys-sim", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/mocks/hys-sim")>()), pendingSuggestions: () => [] }));

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

const D = "dos_018"; // NK, đã thông quan
const err = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => ({ code: e.code }));

beforeEach(() => resetDb());

describe("bản khai bổ sung AMA (mock)", () => {
  it("chưa lập → view rỗng; sửa → báo chưa lập", async () => {
    expect((await getPostAmendmentView(D)).current).toBeNull();
    expect(await err(updatePostAmendmentField(D, { key: "TK_REC", value: "1" }))).toEqual({ code: "NOT_FOUND" });
  });

  it("lập bản khai: đầu bản khai điền sẵn; thêm dòng → Trước theo tờ khai gốc + số Hải quan tính, Sau bằng Trước", async () => {
    await startPostAmendment(D);
    const v = await getPostAmendmentView(D);
    expect(v.sourceLines.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(v.current?.header).toMatchObject({ TK_YNK: "I", TK_TTC: "VND", TK_CHB: "00" });
    const pa = await addPostAmendmentLines(D, [2]);
    const line = pa.lines[0]!;
    const item = getDb().lineItems.find((i) => i.dossierId === D && i.lineNo === 2)!;
    expect(line.values).toMatchObject({ HAG_RAN: "02", HAG_CMB: item.description, HAG_CMA: item.description, HAG_MKT: item.hsConfirmed!.replace(/\./g, "") });
    expect(line.values["HAG_MKB"]).toBeTruthy();
    expect(line.values["HAG_AKB"]).toBe(line.values["HAG_MKB"]);
    expect(await err(addPostAmendmentLines(D, [1, 2]))).toEqual({ code: "DUPLICATE" });
    expect(await err(addPostAmendmentLines(D, [9]))).toEqual({ code: "NOT_FOUND" });
  });

  it("sửa phần Sau → tự tính tiền thuế; phần Trước và định danh tờ khai gốc khóa; sửa sau khi duyệt → về nháp", async () => {
    await startPostAmendment(D);
    const { lines } = await addPostAmendmentLines(D, [1, 2]);
    const id = lines[0]!.id;
    const pa = await updatePostAmendmentField(D, { lineId: id, key: "HAG_AKB", value: "1000000" });
    const after = pa.lines[0]!.values;
    expect(after["HAG_AKA"]).toBe(`${(1_000_000 * Number(after["HAG_AKR"])) / 100}.0000`);
    expect(await err(updatePostAmendmentField(D, { lineId: id, key: "HAG_MKB", value: "1" }))).toEqual({ code: "LOCKED" });
    expect(await err(updatePostAmendmentField(D, { key: "TK_ICN", value: "1" }))).toEqual({ code: "LOCKED" });
    expect(await err(updatePostAmendmentField(D, { key: "TK_REC", value: "12" }))).toEqual({ code: "INVALID_VALUE" });
    await updatePostAmendmentField(D, { key: "TK_REC", value: "2" });
    expect((await approvePostAmendment(D)).status).toBe("APPROVED");
    expect((await updatePostAmendmentField(D, { key: "TK_NTA", value: "Ghi chú mới" })).status).toBe("DRAFT");
    expect((await removePostAmendmentLine(D, id)).lines.map((l) => l.ran)).toEqual([2]);
  });
});

/* ---------------- AMA theo tờ khai nhánh ---------------- */

describe("AMA theo tờ khai nhánh (mock)", () => {
  const BIG = "dos_028";
  const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);
  const clearAll = async () => {
    await submitDeclaration(BIG, "cert_vnpt");
    wait(9_000);
    for (const b of [1, 2]) {
      await performOperation(BIG, "IDC", b);
      wait(9_000);
    }
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T03:00:00Z"));
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  it("dòng của tờ đánh số 1..50; mỗi tờ một bản khai riêng", async () => {
    await clearAll();
    await startPostAmendment(BIG, 1);
    await startPostAmendment(BIG, 2);
    expect((await getPostAmendmentView(BIG, 1)).sourceLines.map((l) => l.lineNo)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect((await getPostAmendmentView(BIG, 3)).sourceLines).toHaveLength(20);
    const items = getDb().lineItems.filter((i) => i.dossierId === BIG).sort((a, b) => a.lineNo - b.lineNo);
    expect((await getPostAmendmentView(BIG, 2)).sourceLines[0]).toMatchObject({ lineNo: 1, description: items[50]!.description });
    const pa = await addPostAmendmentLines(BIG, [1], 2);
    expect(pa.lines[0]!.values).toMatchObject({ HAG_RAN: "01", HAG_CMB: items[50]!.description });
    expect((await getPostAmendmentView(BIG, 1)).current?.lines).toEqual([]);
    expect(getDb().postAmendments.map((a) => [a.branch, a.seq])).toEqual([[1, 1], [2, 1]]);
  });

  it("commonEdits: chỉ tiêu chung đã sửa (không tính TK_CHB); nhân bản sang tờ khác, bỏ qua tờ chưa thông quan / đã duyệt", async () => {
    await clearAll();
    await startPostAmendment(BIG, 1);
    await startPostAmendment(BIG, 2);
    await updatePostAmendmentField(BIG, { key: "TK_REC", value: "3" }, 1);
    await updatePostAmendmentField(BIG, { key: "TK_CHB", value: "01" }, 1);
    expect((await getPostAmendmentView(BIG, 1)).commonEdits).toEqual(["TK_REC"]);
    expect((await getPostAmendmentView(BIG, 2)).commonEdits).toEqual([]);
    expect(await copyPostAmendmentHeader(BIG, { fromBranch: 1, keys: ["TK_REC"] })).toEqual({ applied: [2], skipped: [{ no: 3, reason: "NOT_CLEARED" }] });
    expect((await getPostAmendmentView(BIG, 2)).current?.header["TK_REC"]).toBe("3");
    await addPostAmendmentLines(BIG, [1], 2);
    await approvePostAmendment(BIG, 2);
    expect(await copyPostAmendmentHeader(BIG, { fromBranch: 1, keys: ["TK_REC"] })).toEqual({ applied: [], skipped: [{ no: 2, reason: "OPEN_NOT_DRAFT" }, { no: 3, reason: "NOT_CLEARED" }] });
  });

  it("copy tạo bản khai cho tờ đã thông quan chưa lập; TK_CHB bị từ chối", async () => {
    await clearAll();
    await startPostAmendment(BIG, 1);
    await updatePostAmendmentField(BIG, { key: "TK_REC", value: "2" }, 1);
    expect(await copyPostAmendmentHeader(BIG, { fromBranch: 1, keys: ["TK_REC"] })).toMatchObject({ applied: [2] });
    expect((await getPostAmendmentView(BIG, 2)).current).not.toBeNull();
    expect(await err(copyPostAmendmentHeader(BIG, { fromBranch: 1, keys: ["TK_CHB"] }))).toEqual({ code: "VALIDATION" });
  });
});
