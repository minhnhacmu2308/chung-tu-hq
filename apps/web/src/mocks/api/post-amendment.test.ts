import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb, saveDb } from "@/mocks/db";
import { startPostAmendment } from "./customs";
import { addPostAmendmentLines, approvePostAmendment, getPostAmendmentView, removePostAmendmentLine, updatePostAmendmentField } from "./post-amendment";

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
