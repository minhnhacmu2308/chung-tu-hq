import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb, saveDb } from "@/mocks/db";
import { KvgsViewSchema } from "@kb/contracts";
import { fetchKvgs, getKvgs, pollContainerList, refillContainerList, saveContainerList, sendContainerList } from "./kvgs";
import { getSubmission } from "./customs";

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

const NK = "dos_029"; // NK container, đã thông quan, B/L có 2 container + seal
const XK = "dos_030"; // XK hàng lẻ (đường bộ), đã thông quan
const err = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; reason?: string }) => e);
const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
  resetDb();
  vi.useFakeTimers({ toFake: ["Date"], now: new Date() });
});

describe("KVGS mock", () => {
  it("NK container: bản nháp điền sẵn từ vận đơn → khai → chấp nhận sau ~3 s → lấy bảng kê (~2 s, một bước) có container và ảnh mã vạch PNG", async () => {
    const v = await getKvgs(NK, 1);
    expect(v.applies).toEqual({ containerList: true, kvgs: true });
    expect(v.containerList?.status).toBe("DRAFT");
    expect(v.containerList?.rows.map((r) => [r.containerNo, r.sealNo])).toEqual([["TGHU0123450", "KR884120"], ["MSKU7654328", "KR884121"]]);
    // chưa được chấp nhận danh sách → khóa lấy DS qua KVGS
    expect((await err(fetchKvgs(NK, 1)))?.reason).toBe("KVGS_REQUIRES_CONTAINER_LIST");

    const sending = await sendContainerList(NK, 1);
    expect(sending.containerList?.status).toBe("SENDING");
    expect((await err(sendContainerList(NK, 1)))?.reason).toBe("KVGS_ALREADY_SENDING");
    expect((await err(saveContainerList(NK, 1, { rows: sending.containerList!.rows })))?.reason).toBe("CONT_LIST_LOCKED");
    wait(2_000);
    expect((await getKvgs(NK, 1)).containerList?.status).toBe("SENDING");
    wait(1_500);
    const ok = await getKvgs(NK, 1);
    expect(ok.containerList).toMatchObject({ status: "ACCEPTED", errors: [] });
    expect(ok.containerList?.receiptNo).toMatch(/^\d{12}$/);

    const f = await fetchKvgs(NK, 1);
    expect(f.kvgs).toMatchObject({ status: "SENDING", refId: null, receiptNo: null, receiptDate: null, fetchedAt: null, sheet: null });
    wait(1_000);
    expect((await getKvgs(NK, 1)).kvgs?.status).toBe("SENDING");
    wait(1_500);
    const done = await getKvgs(NK, 1);
    expect(KvgsViewSchema.parse(done)).toBeTruthy();
    const sheet = done.kvgs?.sheet;
    // KVGS một bước: không mã tham chiếu / số tiếp nhận; có thời điểm lấy.
    expect(done.kvgs).toMatchObject({ status: "ACCEPTED", refId: null, receiptNo: null, receiptDate: null, errors: [] });
    expect(done.kvgs?.fetchedAt).toBeTruthy();
    expect(sheet?.kind).toBe("CONTAINER");
    expect(sheet?.barcode).toBeNull();
    expect(sheet?.containers).toHaveLength(2);
    expect(sheet?.containers[0]).toMatchObject({ containerNo: "TGHU0123450", sealNo: "KR884120" });
    const png = Buffer.from(sheet!.containers[0]!.barcodeImage!, "base64");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(sheet?.declarationNo).toBe("107433370720");
  });

  it("seal REJECT1 → bị từ chối, lỗi theo dòng 1; sửa seal rồi khai lại thành lần khai mới", async () => {
    const v = await getKvgs(NK, 1);
    await saveContainerList(NK, 1, { rows: v.containerList!.rows.map((r, i) => (i === 0 ? { ...r, sealNo: "REJECT1" } : r)) });
    await sendContainerList(NK, 1);
    wait(3_500);
    const rej = await getKvgs(NK, 1);
    expect(rej.containerList?.status).toBe("REJECTED");
    expect(rej.containerList?.errors).toMatchObject([{ line: 1 }]);
    const fixed = await saveContainerList(NK, 1, { rows: rej.containerList!.rows.map((r) => ({ ...r, sealNo: "OK123" })) });
    expect(fixed.containerList).toMatchObject({ status: "DRAFT", errors: [] });
    const again = await sendContainerList(NK, 1);
    expect(again.containerList).toMatchObject({ status: "SENDING", attempt: 2 });
  });

  it("bảng sai (thiếu seal / sai ISO 6346) bị chặn trước khi gửi; poll ngay chốt phản hồi", async () => {
    const v = await getKvgs(NK, 1);
    await saveContainerList(NK, 1, { rows: [{ ...v.containerList!.rows[0]!, sealNo: "", containerNo: "fbiu 580242-9" }] });
    expect((await err(sendContainerList(NK, 1)))?.reason).toBe("CONT_LIST_INVALID");
    await saveContainerList(NK, 1, { rows: v.containerList!.rows });
    await sendContainerList(NK, 1);
    expect(await pollContainerList(NK, 1)).toEqual({ again: false });
    expect((await getKvgs(NK, 1)).containerList?.status).toBe("ACCEPTED");
    expect((await err(pollContainerList(NK, 1)))?.code).toBe("INVALID_STATE");
  });

  it("làm lại từ chứng từ ghi đè bảng", async () => {
    const v = await getKvgs(NK, 1);
    await saveContainerList(NK, 1, { rows: [] });
    expect((await refillContainerList(NK, 1)).containerList?.rows).toHaveLength(v.containerList!.rows.length);
  });

  it("XK hàng lẻ: không có khối danh sách container; lấy bảng kê → kind CARGO có cargo + mã vạch đầu trang = số tờ khai (Code128)", async () => {
    const v = await getKvgs(XK, 1);
    expect(v.applies).toEqual({ containerList: false, kvgs: true });
    expect(v.containerList).toBeNull();
    expect((await err(sendContainerList(XK, 1)))?.reason).toBe("CONT_LIST_NOT_APPLICABLE");
    await fetchKvgs(XK, 1);
    wait(3_500);
    const sheet = (await getKvgs(XK, 1)).kvgs?.sheet;
    expect(sheet?.kind).toBe("CARGO");
    expect(sheet?.containers).toEqual([]);
    expect(sheet?.barcode).toBe("307433370730");
    expect(sheet?.sealRequired).toBe(false);
    expect(sheet?.cargo).toMatchObject({ quantityUnit: "PK", weightUnit: "KGM" });
    expect(sheet?.cargo?.grossWeight).toMatch(/^\d+(\.\d+)?$/);
  });

  it("chưa thông quan → khóa; điều kiện luồng dùng trạng thái KVGS thật", async () => {
    expect((await err(fetchKvgs("dos_019", 1)))?.reason).toBe("KVGS_REQUIRES_CLEARANCE");
    expect((await err(getKvgs("dos_029", 2)))?.code).toBe("NOT_FOUND");
    await getKvgs(NK, 1);
    await sendContainerList(NK, 1);
    wait(3_500);
    const sub = await getSubmission(NK);
    expect(sub.pipeline.find((p) => p.op === "KVGS")?.enabled).toBe(true);
  });
});
