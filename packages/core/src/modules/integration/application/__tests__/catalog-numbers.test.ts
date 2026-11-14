// C6 – Hải quan cấp số cho tờ khai nhánh (khai tạm IDA thành công) → cổng danh mục ghi số tờ khai cuối lên mặt hàng của các dòng thuộc tờ đó.
// Gọi sau khi giao dịch commit; lỗi danh mục không làm hỏng xử lý Hải quan.
import { beforeEach, describe, expect, it } from "vitest";
import { unwrap } from "../../../../shared/result.js";
import type { CustomsCatalogPort } from "../customs-ports.js";
import { pollStatus } from "../poll-status.js";
import { processOutbox } from "../process-outbox.js";
import { submitDeclaration } from "../submit-declaration.js";
import { D, declarant, lines, makeHarness, ORG, seed, type Harness } from "./_sheets-harness.js";

let h: Harness;
let calls: { orgId: string; rows: { itemId: string; declarationNo: string; date: string }[] }[];
const run = (outboxId: string) => processOutbox(h.deps, { orgId: ORG, userId: "usr_chau", outboxId });
async function drain(max = 30) {
  for (let i = 0; i < max; i++) {
    const job = h.queue.jobs.shift();
    if (!job) return;
    if (job.name === "customs-send") await run((job.payload as Record<string, string>)["outboxId"]!);
  }
}
/** Mặt hàng đã gắn theo số dòng (tờ 1 = dòng 1..50, tờ 2 = 51..100, tờ 3 = 101..140). */
const linked: Record<number, string> = { 1: "cat_a", 2: "cat_a", 51: "cat_b", 52: "cat_a", 120: "cat_c" };

beforeEach(() => {
  h = makeHarness();
  calls = [];
  h.decls.items = lines(140);
  h.decls.lineCatalogItems = async (_o, dossierId) =>
    dossierId === D ? { declarationId: "dec_1", lines: lines(140).map((l) => ({ lineNo: l.lineNo, catalogItemId: linked[l.lineNo] ?? null })) } : null;
  const catalog: CustomsCatalogPort = { recordDeclarationNo: async (orgId, rows) => (calls.push({ orgId, rows }), { updated: rows.length }) };
  h.deps.catalog = catalog;
});

describe("số tờ khai cuối của mặt hàng (C6)", () => {
  it("lô 3 tờ: mỗi tờ được cấp số → ghi mặt hàng (không trùng) của đúng các dòng thuộc tờ đó; không gắn mặt hàng → bỏ qua", async () => {
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    const results = h.uow.data.results.sort((a, b) => a.branch - b.branch);
    expect(results.map((r) => !!r.declarationNo)).toEqual([true, true, true]);
    const no = results[0]!.declarationNo!;
    expect(calls).toEqual([
      { orgId: ORG, rows: [{ itemId: "cat_a", declarationNo: no, date: "2026-10-14" }] },
      { orgId: ORG, rows: [{ itemId: "cat_b", declarationNo: results[1]!.declarationNo!, date: "2026-10-14" }, { itemId: "cat_a", declarationNo: results[1]!.declarationNo!, date: "2026-10-14" }] },
      { orgId: ORG, rows: [{ itemId: "cat_c", declarationNo: results[2]!.declarationNo!, date: "2026-10-14" }] },
    ]);
  });

  it("cổng danh mục lỗi → xử lý Hải quan vẫn xong (đủ số tờ khai, outbox SENT)", async () => {
    h.deps.catalog = { recordDeclarationNo: async () => { throw new Error("catalog down"); } };
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    expect(h.uow.data.results.map((r) => !!r.declarationNo)).toEqual([true, true, true]);
    expect(h.uow.data.outbox.filter((o) => o.operation === "IDA").map((o) => o.status)).toEqual(["SENT", "SENT", "SENT"]);
  });

  it("không nối danh mục / không đọc được dòng → không gọi gì, vẫn xử lý bình thường", async () => {
    delete h.deps.catalog;
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    expect(h.uow.data.results.map((r) => !!r.declarationNo)).toEqual([true, true, true]);
  });

  it("hỏi trạng thái lặp lại: cùng số đang lưu → không gọi lại; Hải quan trả số khác → ghi số mới cho dòng của tờ đó (ngày đăng ký Hải quan)", async () => {
    seed(h, 1, "DECLARED");
    seed(h, 2, "DECLARED");
    const gw = h.deps.gateway;
    let no = "104000000002";
    gw.queryStatus = async () => ({ status: "Chờ thông quan", cleared: false, declarationNo: no, info: { receivedAt: "2026-10-14T03:00:00.000Z", exchangeRates: [], taxes: [], items: [], directives: [], registeredDate: "2026-10-13" } });
    unwrap(await pollStatus(h.deps, { orgId: ORG, userId: "usr_chau", dossierId: D, attempt: 1, branch: 2 }));
    unwrap(await pollStatus(h.deps, { orgId: ORG, userId: "usr_chau", dossierId: D, attempt: 2, branch: 2 }));
    expect(calls).toEqual([]);
    no = "104000000099";
    unwrap(await pollStatus(h.deps, { orgId: ORG, userId: "usr_chau", dossierId: D, attempt: 3, branch: 2 }));
    expect(calls).toEqual([{ orgId: ORG, rows: [{ itemId: "cat_b", declarationNo: "104000000099", date: "2026-10-13" }, { itemId: "cat_a", declarationNo: "104000000099", date: "2026-10-13" }] }]);
    unwrap(await pollStatus(h.deps, { orgId: ORG, userId: "usr_chau", dossierId: D, attempt: 4, branch: 2 }));
    expect(calls).toHaveLength(1);
  });
});
