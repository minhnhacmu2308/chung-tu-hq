import { CATALOG_IMPORT_MAX_ROWS_PER_REQUEST, ITEM_IMPORT_MAX_LENGTH, type CatalogImport, type ImportRowsInput, type ItemImportRow } from "@kb/contracts";
import { describe, expect, it, vi } from "vitest";
import { runImportInParts, waitForImports, type ImportProgress } from "./import-run";

const META = { codeSetId: "cst_x", fileName: "kho.xlsx", columnMap: { code: 0, name: 1 } };
const rows = (n: number, code = (i: number) => `VT-${i}`): ItemImportRow[] => Array.from({ length: n }, (_, i) => ({ code: code(i), name: `Hàng ${i}` }));

function imp(id: string, over: Partial<CatalogImport> = {}): CatalogImport {
  return {
    id, codeSetId: META.codeSetId, fileName: META.fileName, columnMap: {}, status: "DONE",
    counts: { created: 0, matched: 0, queued: 0, skipped: 0, errors: 0 }, errors: [], progress: { done: 0, total: 0 }, createdAt: "2026-11-14T00:00:00.000Z", createdBy: null,
    ...over,
  };
}

/** Server giả: mỗi phần trả MATCHING, lần tra đầu tiên xong (DONE) – đếm "queued" = số dòng gửi. */
function fakeServer() {
  const sent: ImportRowsInput[] = [];
  const store = new Map<string, CatalogImport>();
  const importRows = vi.fn(async (input: ImportRowsInput) => {
    if (input.rows.length > CATALOG_IMPORT_MAX_ROWS_PER_REQUEST) throw Object.assign(new Error("too large"), { reason: "CATALOG_IMPORT_TOO_LARGE" });
    sent.push(input);
    const id = `cim_${sent.length}`;
    const n = input.rows.length;
    store.set(id, imp(id, { status: "DONE", counts: { created: 1, matched: 0, queued: n - 1, skipped: 0, errors: 0 }, progress: { done: n, total: n } }));
    return imp(id, { status: "MATCHING", progress: { done: 0, total: n } });
  });
  const getImport = vi.fn(async (id: string) => store.get(id)!);
  return { sent, importRows, getImport, wait: async () => {} };
}

describe("nhập file lớn theo nhiều phần", () => {
  it("12.001 dòng → 3 lần nhập liên tiếp (5.000 / 5.000 / 2.001), mỗi lần một mã nhập riêng; tiến độ và tóm tắt cộng dồn", async () => {
    const server = fakeServer();
    const progress: ImportProgress[] = [];
    const res = await runImportInParts(rows(12_001), META, server, (p) => progress.push(p));
    expect(server.sent.map((s) => s.rows.length)).toEqual([5000, 5000, 2001]);
    expect(server.sent.every((s) => s.codeSetId === "cst_x" && s.fileName === "kho.xlsx")).toBe(true);
    expect(res.imports.map((i) => i.id)).toEqual(["cim_1", "cim_2", "cim_3"]);
    expect(res.counts).toEqual({ created: 3, matched: 0, queued: 11_998, skipped: 0, errors: 0 });
    expect(res.failed).toBeNull();
    expect(progress.map((p) => p.part)).toContain(3);
    expect(progress.at(-1)).toEqual({ part: 3, parts: 3, percent: 100 });
    expect(progress.every((p, i) => i === 0 || p.percent >= progress[i - 1]!.percent)).toBe(true);
  });

  it("mã trùng với dòng ở phần trước → không gửi lại (tránh ghi đè im lặng), báo lỗi trùng ở đúng dòng của file", async () => {
    const server = fakeServer();
    // Dòng 5.002 (chỉ số 5.001) lặp mã của dòng 1, khác cách viết.
    const data = rows(5_005);
    data[5_001] = { code: " vt 0", name: "Hàng lặp" };
    const res = await runImportInParts(data, META, server, () => {});
    expect(server.sent.map((s) => s.rows.length)).toEqual([5000, 4]);
    expect(server.sent[1]!.rows.some((r) => r.name === "Hàng lặp")).toBe(false);
    expect(res.errors).toEqual([{ index: 5_001, field: "code", code: "DUPLICATE_IN_FILE" }]);
    expect(res.counts.errors).toBe(1);
  });

  it("dòng có trường dài quá giới hạn → không gửi (không cắt bớt, không làm hỏng cả yêu cầu), báo TOO_LONG ở đúng dòng", async () => {
    const server = fakeServer();
    const data = rows(4);
    data[2] = { code: "X".repeat(ITEM_IMPORT_MAX_LENGTH.code + 1), name: "Hàng dài", factor: "1".repeat(ITEM_IMPORT_MAX_LENGTH.factor + 1) };
    const res = await runImportInParts(data, META, server, () => {});
    expect(server.sent[0]!.rows.map((r) => r.code)).toEqual(["VT-0", "VT-1", "VT-3"]);
    expect(res.errors).toEqual([
      { index: 2, field: "code", code: "TOO_LONG" },
      { index: 2, field: "factor", code: "TOO_LONG" },
    ]);
    expect(res.counts.errors).toBe(2);
  });

  it("lỗi theo dòng server trả (đánh số trong phần) → quy về chỉ số dòng của cả file", async () => {
    const server = fakeServer();
    server.getImport.mockImplementation(async (id: string) =>
      imp(id, { status: "DONE", counts: { created: 0, matched: 0, queued: 0, skipped: 0, errors: 1 }, errors: [{ row: 2, field: "hs", code: "INVALID_FORMAT" }] }),
    );
    const res = await runImportInParts(rows(5_003), META, server, () => {});
    expect(res.errors).toEqual([
      { index: 1, field: "hs", code: "INVALID_FORMAT" },
      { index: 5_001, field: "hs", code: "INVALID_FORMAT" },
    ]);
    expect(res.counts.errors).toBe(2);
  });

  it("phần 2 hỏng → dừng ngay, không gửi phần 3, báo phần nào hỏng (kèm khoảng dòng); số liệu phần 1 vẫn giữ", async () => {
    const server = fakeServer();
    const boom = new Error("network");
    server.importRows.mockImplementationOnce(async (input) => {
      server.sent.push(input);
      return imp("cim_1", { counts: { created: 0, matched: 5000, queued: 0, skipped: 0, errors: 0 } });
    });
    server.importRows.mockImplementationOnce(async () => {
      throw boom;
    });
    const res = await runImportInParts(rows(12_001), META, server, () => {});
    expect(server.importRows).toHaveBeenCalledTimes(2);
    expect(res.failed).toEqual({ part: 2, parts: 3, fromIndex: 5000, toIndex: 9999, error: boom });
    expect(res.counts.matched).toBe(5000);
  });

  it("job nền báo FAILED → coi như phần hỏng", async () => {
    const server = fakeServer();
    server.getImport.mockImplementation(async (id: string) => imp(id, { status: "FAILED" }));
    const res = await runImportInParts(rows(10), META, server, () => {});
    expect(res.failed).toMatchObject({ part: 1, parts: 1, fromIndex: 0, toIndex: 9, error: "JOB_FAILED" });
  });

  it("chờ các lần nhập đang chạy (Lấy từ chứng từ): tra lại tới khi xong, cộng dồn số liệu", async () => {
    let calls = 0;
    const getImport = vi.fn(async (id: string) => {
      calls += 1;
      return calls < 3 ? imp(id, { status: "MATCHING", progress: { done: calls, total: 4 } }) : imp(id, { counts: { created: 2, matched: 1, queued: 1, skipped: 0, errors: 0 } });
    });
    const res = await waitForImports([imp("a", { status: "MATCHING" }), imp("b", { counts: { created: 0, matched: 0, queued: 3, skipped: 1, errors: 0 } })], { getImport, wait: async () => {} }, () => {});
    expect(res.counts).toEqual({ created: 2, matched: 1, queued: 4, skipped: 1, errors: 0 });
    expect(res.failed).toBeNull();
  });

  it("lỗi của nhiều lần nhập từ chứng từ kèm mã lần nhập (số dòng trùng nhau giữa các bộ đối tác)", async () => {
    const err = (id: string) => imp(id, { codeSetId: `set_${id}`, errors: [{ row: 1, field: "hs", code: "INVALID_FORMAT" }] });
    const res = await waitForImports([err("a"), err("b")], { getImport: vi.fn(), wait: async () => {} }, () => {});
    expect(res.errors).toEqual([
      { index: 0, field: "hs", code: "INVALID_FORMAT", importId: "a" },
      { index: 0, field: "hs", code: "INVALID_FORMAT", importId: "b" },
    ]);
  });
});
