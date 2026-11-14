// C6 – Hải quan cấp số cho tờ khai nhánh (khai tạm IDA thành công) → cổng danh mục ghi số tờ khai cuối lên mặt hàng của các dòng thuộc tờ đó.
// Gọi sau khi giao dịch commit; lỗi danh mục không làm hỏng xử lý Hải quan. Tự bù khi crash (raw.catalogNo); mặt hàng theo dòng đã gửi (raw.sentLineIds / raw.sent).
import { beforeEach, describe, expect, it } from "vitest";
import { unwrap } from "../../../../shared/result.js";
import type { CustomsCatalogPort } from "../customs-ports.js";
import { pollStatus } from "../poll-status.js";
import { processOutbox } from "../process-outbox.js";
import { submitDeclaration } from "../submit-declaration.js";
import { D, declarant, lines, makeHarness, ORG, other, seed, type Harness } from "./_sheets-harness.js";

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
    dossierId === D ? { declarationId: "dec_1", lines: lines(140).map((l) => ({ id: `ln_${l.lineNo}`, lineNo: l.lineNo, catalogItemId: linked[l.lineNo] ?? null })) } : null;
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

  it("hỏi trạng thái lặp lại: cùng số đã ghi danh mục (raw.catalogNo) → không gọi lại; Hải quan trả số khác → ghi số mới cho dòng của tờ đó (ngày đăng ký Hải quan)", async () => {
    seed(h, 1, "DECLARED");
    seed(h, 2, "DECLARED");
    for (const r of h.uow.data.results) r.raw = { ...r.raw, catalogNo: r.declarationNo! };
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

/** Dòng hàng có id (`ln_<lineNo>` – như tờ khai thật: items[].id = id dòng). */
const idLines = (n: number) => lines(n).map((l) => ({ ...l, id: `ln_${l.lineNo}` }));
/** Dòng hiện tại của hồ sơ (cổng declaration.lineCatalogItems): id + số dòng hiện tại + mặt hàng gắn theo id. */
const currentLines = (rows: { id: string; lineNo: number }[], links: Record<string, string>) => {
  h.decls.lineCatalogItems = async (orgId, dossierId) =>
    orgId === ORG && dossierId === D ? { declarationId: "dec_1", lines: rows.map((r) => ({ ...r, catalogItemId: links[r.id] ?? null })) } : null;
};
const statusNo = (no: string) => {
  h.deps.gateway.queryStatus = async () => ({ status: "Chờ thông quan", cleared: false, declarationNo: no, info: { receivedAt: "2026-10-14T03:00:00.000Z", exchangeRates: [], taxes: [], items: [], directives: [], registeredDate: "2026-10-13" } });
};
const poll = (branch: number, attempt = 1) => pollStatus(h.deps, { orgId: ORG, userId: "usr_chau", dossierId: D, attempt, branch });
const result = (branch: number) => h.uow.data.results.find((r) => r.orgId === ORG && r.dossierId === D && r.branch === branch)!;
/** Số trong dấu đã ghi danh mục (dạng mới { no, lines } hoặc chuỗi cũ). */
const markNo = (branch: number) => {
  const m = result(branch).raw?.catalogNo;
  return typeof m === "string" ? m : m?.no;
};
const idaOutbox = (branch: number) =>h.uow.data.outbox.find((o) => o.branch === branch && o.operation === "IDA")!.id;

describe("C6 tự bù: số đã ghi danh mục (raw.catalogNo)", () => {
  let failing: boolean;
  beforeEach(() => {
    failing = false;
    h.deps.catalog = { recordDeclarationNo: async (orgId, rows) => {
      if (failing) throw new Error("catalog down");
      calls.push({ orgId, rows });
      return { updated: rows.length };
    } };
  });

  it("khai tạm: ghi danh mục xong → đặt dấu = số tờ khai", async () => {
    h.decls.items = lines(10);
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    expect(calls).toHaveLength(1);
    // Dấu = số + khóa tập dòng đã gửi (payload lines() không có id dòng → khóa null).
    expect(result(1).raw?.catalogNo).toEqual({ no: result(1).declarationNo, lines: null });
  });

  it("danh mục lỗi lúc khai tạm → chưa đặt dấu; job outbox chạy lại (đã SENT) → ghi bù, đặt dấu; chạy lại lần nữa → không gọi thêm", async () => {
    h.decls.items = lines(10);
    failing = true;
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    const no = result(1).declarationNo!;
    expect(no).toBeTruthy();
    expect(result(1).raw?.catalogNo).toBeUndefined();
    failing = false;
    unwrap(await run(idaOutbox(1)));
    expect(calls).toEqual([{ orgId: ORG, rows: [{ itemId: "cat_a", declarationNo: no, date: "2026-10-14" }] }]);
    expect(markNo(1)).toBe(no);
    unwrap(await run(idaOutbox(1)));
    expect(calls).toHaveLength(1);
  });

  it("crash sau commit (đã lưu số, chưa gọi danh mục – dấu vắng) → lượt hỏi trạng thái kế tiếp cùng số vẫn ghi bù; dấu đã có → không gọi", async () => {
    seed(h, 2, "DECLARED");
    statusNo("104000000002");
    unwrap(await poll(2, 1));
    expect(calls).toEqual([{ orgId: ORG, rows: [{ itemId: "cat_b", declarationNo: "104000000002", date: "2026-10-13" }, { itemId: "cat_a", declarationNo: "104000000002", date: "2026-10-13" }] }]);
    expect(markNo(2)).toBe("104000000002");
    unwrap(await poll(2, 2));
    expect(calls).toHaveLength(1);
  });

  it("danh mục lỗi ở lượt hỏi → không đặt dấu, xử lý Hải quan vẫn xong; lượt sau ghi lại và đặt dấu", async () => {
    seed(h, 2, "DECLARED");
    statusNo("104000000002");
    failing = true;
    unwrap(await poll(2, 1));
    expect(result(2).pollCount).toBe(1);
    expect(result(2).raw?.catalogNo).toBeUndefined();
    failing = false;
    unwrap(await poll(2, 2));
    expect(calls).toHaveLength(1);
    expect(markNo(2)).toBe("104000000002");
  });

  it("dấu là số cũ (Hải quan đổi số) → ghi số mới dù số đã lưu trên kết quả từ trước", async () => {
    seed(h, 2, "DECLARED");
    result(2).raw = { ...result(2).raw, catalogNo: "104000000001" };
    statusNo("104000000002");
    unwrap(await poll(2));
    expect(calls.map((c) => c.rows[0]!.declarationNo)).toEqual(["104000000002"]);
    expect(markNo(2)).toBe("104000000002");
  });

  it("org khác: không đọc/đặt dấu kết quả của org khác; đánh dấu bằng ngữ cảnh org khác không có tác dụng", async () => {
    seed(h, 2, "DECLARED");
    h.uow.data.results.push({ ...structuredClone(result(2)), id: "res_b", orgId: other.orgId, dossierId: "dos_b" });
    statusNo("104000000002");
    unwrap(await poll(2));
    expect(calls.map((c) => c.orgId)).toEqual([ORG]);
    expect(h.uow.data.results.find((r) => r.id === "res_b")!.raw?.catalogNo).toBeUndefined();
    seed(h, 3, "DECLARED");
    expect(await h.uow.asOrg(other, (r) => r.results.markCatalogNo(ORG, D, 3, "104000000003", null))).toBe(false);
    expect(await h.uow.asOrg(other, (r) => r.results.markCatalogNo(other.orgId, D, 3, "104000000003", null))).toBe(false);
    expect(result(3).raw?.catalogNo).toBeUndefined();
  });
});

describe("C6: ngày ghi danh mục khi Hải quan không trả ngày đăng ký", () => {
  /** Danh mục giả theo quy tắc thật: chỉ ghi khi ngày đang lưu trống hoặc ≤ ngày mới (không đè tờ khai mới hơn). */
  let store: Record<string, { no: string; date: string }>;
  beforeEach(() => {
    store = { cat_b: { no: "107999999999", date: "2026-10-01" } };
    h.deps.catalog = { recordDeclarationNo: async (orgId, rows) => {
      calls.push({ orgId, rows });
      let updated = 0;
      for (const r of rows) {
        const cur = store[r.itemId];
        if (cur && cur.date > r.date) continue;
        store[r.itemId] = { no: r.declarationNo, date: r.date };
        updated++;
      }
      return { updated };
    } };
    // Hải quan trả số nhưng không có ngày đăng ký.
    h.deps.gateway.queryStatus = async () => ({ status: "Chờ thông quan", cleared: false, declarationNo: "104000000002" });
  });
  const inIda = (at: string, soToKhai: string) =>
    h.uow.data.messages.push({ id: `msg_${at}`, orgId: ORG, dossierId: D, branch: 2, operation: "IDA", direction: "IN", result: "OK", summary: "Hải quan cấp số", payloadMasked: { soToKhai }, externalRef: null, at: new Date(at) });

  it("kết quả cũ (chưa có dấu, không ngày đăng ký): ngày = lúc nhận số (thông điệp IDA, giờ VN), không phải hôm nay → mặt hàng đang giữ tờ khai mới hơn không bị đè", async () => {
    seed(h, 2, "DECLARED");
    inIda("2026-09-01T18:00:00.000Z", "104000000002"); // 02/09 giờ VN
    unwrap(await poll(2));
    expect(calls[0]!.rows.map((r) => r.date)).toEqual(["2026-09-02", "2026-09-02"]);
    expect(store["cat_b"]).toEqual({ no: "107999999999", date: "2026-10-01" });
    expect(store["cat_a"]).toEqual({ no: "104000000002", date: "2026-09-02" });
  });

  it("không có thông điệp IDA: ngày = lúc kết quả tờ được lưu (updated_at trước lượt hỏi này, giờ VN)", async () => {
    seed(h, 2, "DECLARED");
    result(2).updatedAt = new Date("2026-09-04T20:00:00.000Z"); // 05/09 giờ VN
    unwrap(await poll(2));
    expect(calls[0]!.rows.map((r) => r.date)).toEqual(["2026-09-05", "2026-09-05"]);
    expect(store["cat_b"]!.no).toBe("107999999999");
  });

  it("số vừa cấp: lưu raw.numberAt = lúc nhận số; đối soát sau (crash) dùng thời điểm đó, không dùng ngày chạy lại", async () => {
    h.decls.items = lines(10);
    h.deps.catalog = { recordDeclarationNo: async () => { throw new Error("catalog down"); } };
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    expect(result(1).raw?.numberAt).toBe("2026-10-14T03:00:00.000Z");
    h.deps.clock = { now: () => new Date("2026-10-20T03:00:00.000Z") };
    h.deps.catalog = { recordDeclarationNo: async (orgId, rows) => (calls.push({ orgId, rows }), { updated: rows.length }) };
    unwrap(await run(idaOutbox(1)));
    expect(result(1).raw?.customsInfo?.registeredDate).toBeUndefined(); // IDA giả không trả ngày đăng ký
    expect(calls[0]!.rows[0]!.date).toBe("2026-10-14");
  });
});

describe("C6: dấu gồm tập dòng đã gửi – gửi lại cùng số với dòng đổi (IDA01/EDA01) → ghi lại", () => {
  beforeEach(() => {
    h.deps.catalog = { recordDeclarationNo: async (orgId, rows) => (calls.push({ orgId, rows }), { updated: rows.length }) };
  });

  it("khai sửa thêm dòng (cùng số) → mặt hàng của dòng mới nhận số; hỏi lại không đổi → không gọi", async () => {
    h.decls.items = idLines(3);
    currentLines([1, 2, 3].map((n) => ({ id: `ln_${n}`, lineNo: n })), { ln_1: "cat_a" });
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    const no = result(1).declarationNo!;
    expect(calls.map((c) => c.rows.map((r) => r.itemId))).toEqual([["cat_a"]]);
    // IDA01 thành công: process-outbox chép payload.lineIds mới (thêm ln_4) vào raw.sentLineIds; số tờ khai giữ nguyên.
    result(1).raw = { ...result(1).raw, sentLineIds: ["ln_1", "ln_2", "ln_3", "ln_4"] };
    currentLines([1, 2, 3, 4].map((n) => ({ id: `ln_${n}`, lineNo: n })), { ln_1: "cat_a", ln_4: "cat_new" });
    unwrap(await run(idaOutbox(1)));
    expect(calls.map((c) => c.rows.map((r) => r.itemId))).toEqual([["cat_a"], ["cat_a", "cat_new"]]);
    expect(calls[1]!.rows[1]!.declarationNo).toBe(no);
    unwrap(await run(idaOutbox(1)));
    expect(calls).toHaveLength(2);
  });

  it("dấu cũ dạng chuỗi (chỉ số, chưa biết tập dòng): không có id dòng đã gửi → coi như đã ghi; có id dòng đã gửi → ghi một lần rồi nâng dấu", async () => {
    seed(h, 2, "DECLARED");
    result(2).raw = { ...result(2).raw, catalogNo: "104000000002" };
    statusNo("104000000002");
    unwrap(await poll(2, 1));
    expect(calls).toHaveLength(0);
    result(2).raw = { ...result(2).raw, sentLineIds: ["ln_51", "ln_52"] };
    unwrap(await poll(2, 2));
    expect(calls.map((c) => c.rows.map((r) => r.itemId))).toEqual([["cat_b", "cat_a"]]);
    expect(result(2).raw?.catalogNo).toMatchObject({ no: "104000000002", lines: expect.any(String) });
    unwrap(await poll(2, 3));
    expect(calls).toHaveLength(1);
  });
});

describe("C6: mặt hàng theo dòng ĐÃ GỬI của tờ", () => {
  it("gửi nội dung lưu raw.sentLineIds = id dòng của đúng tờ (lô một tờ và lô nhiều tờ)", async () => {
    h.decls.items = idLines(60);
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    expect(result(1).raw?.sentLineIds).toEqual(Array.from({ length: 50 }, (_, i) => `ln_${i + 1}`));
    expect(result(2).raw?.sentLineIds).toEqual(Array.from({ length: 10 }, (_, i) => `ln_${i + 51}`));

    h = makeHarness();
    h.decls.items = idLines(3);
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    expect(result(1).raw?.sentLineIds).toEqual(["ln_1", "ln_2", "ln_3"]);
  });

  it("dòng sửa / đảo thứ tự / thêm sau khi gửi → mặt hàng của đúng các dòng đã gửi (raw.sentLineIds), không theo vị trí hiện tại", async () => {
    h.decls.items = idLines(60);
    h.deps.catalog = { recordDeclarationNo: async () => { throw new Error("catalog down"); } };
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    // Sau khi gửi: dòng 51..60 (tờ 2) đổi lên đầu, thêm dòng mới cuối (vị trí rơi vào tờ 2 theo sheetOfLine).
    const reordered = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `ln_${i + 51}`, lineNo: i + 1 })),
      ...Array.from({ length: 50 }, (_, i) => ({ id: `ln_${i + 1}`, lineNo: i + 11 })),
      { id: "ln_new", lineNo: 61 },
    ];
    currentLines(reordered, { ln_1: "cat_a", ln_55: "cat_b", ln_50: "cat_x", ln_new: "cat_new" });
    h.deps.catalog = { recordDeclarationNo: async (orgId, rows) => (calls.push({ orgId, rows }), { updated: rows.length }) };
    unwrap(await run(idaOutbox(2)));
    unwrap(await run(idaOutbox(1)));
    expect(calls.map((c) => c.rows.map((r) => r.itemId))).toEqual([["cat_b"], ["cat_a", "cat_x"]]);
  });

  it("kết quả cũ chưa có sentLineIds nhưng ảnh chụp raw.sent có id dòng → theo ảnh chụp", async () => {
    h.decls.items = idLines(60);
    seed(h, 2, "DECLARED");
    expect(result(2).raw?.sentLineIds).toBeUndefined();
    currentLines([{ id: "ln_51", lineNo: 1 }, { id: "ln_1", lineNo: 51 }, { id: "ln_52", lineNo: 52 }], { ln_51: "cat_b", ln_1: "cat_a", ln_52: "cat_c" });
    statusNo("104000000002");
    unwrap(await poll(2));
    expect(calls.map((c) => c.rows.map((r) => r.itemId))).toEqual([["cat_b", "cat_c"]]);
  });

  it("dự phòng (dữ liệu cũ): không sentLineIds, ảnh chụp không có / thiếu id dòng → dòng hiện tại thuộc tờ theo vị trí (sheetOfLine)", async () => {
    seed(h, 2, "DECLARED"); // payload lines() không có id → ảnh chụp không có id dòng
    seed(h, 3, "DECLARED", { sent: false }); // gửi trước khi có ảnh chụp
    statusNo("104000000002");
    unwrap(await poll(2));
    statusNo("104000000003");
    unwrap(await poll(3));
    expect(calls.map((c) => c.rows.map((r) => r.itemId))).toEqual([["cat_b", "cat_a"], ["cat_c"]]);
  });
});
