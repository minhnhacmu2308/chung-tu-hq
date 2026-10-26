import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb, saveDb } from "@/mocks/db";
import { createHys, deleteHys, getHysOverview, removeHysFile, sendHys, updateHys, uploadHysFiles } from "./hys";
import { getSubmission, performOperation, submitDeclaration } from "./customs";

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

const NEW = "dos_024"; // NK, đã duyệt, chưa khai
const CERT = "cert_vnpt";
const err = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; reason?: string; params?: Record<string, unknown> }) => e);
const decl = () => getDb().declarations.find((d) => d.dossierId === NEW)!;
const BIG = "dos_028"; // 3 tờ (50 + 50 + 20)
// dos_024 là lô container → luật G1 gợi ý A02 ngay từ dữ liệu mẫu.

beforeEach(() => {
  resetDb();
  vi.useFakeTimers({ toFake: ["Date"] });
});

describe("HYS mock", () => {
  it("tổng quan có gợi ý; gửi bộ đúng mã → gợi ý biến mất, điền cặp 1.63 mock", async () => {
    const before = await getHysOverview(NEW);
    const a02 = before.suggestions.find((s) => s.code === "A02");
    expect(a02).toBeTruthy();
    expect(before.lotEditable).toBe(true);

    const h = await createHys(NEW, { procedureCode: "A02" });
    await uploadHysFiles(NEW, h.id, [new File(["x"], "note.pdf", { type: "application/pdf" })]);
    const sent = await sendHys(NEW, h.id, { certificateId: CERT });
    expect(sent.status).toBe("ACCEPTED");
    expect(sent.receiptNo).toMatch(/^\d{12}$/);
    expect(sent.fill).toMatchObject({ outcome: "FILLED", slot: 1, afterApproval: true });
    expect(decl().status).toBe("APPROVED"); // điền 1.63 không đổi trạng thái tờ khai
    expect(decl().fields.find((f) => f.code === "TK_EA1")).toMatchObject({ source: "SYSTEM", note: `HYS 1 – ${sent.receiptNo}` });
    // TK_EA = phân loại đính kèm (chỉ file tải riêng → đề xuất ETC), không phải mã thủ tục A02.
    expect(sent.attachKind).toBe("ETC");
    expect(decl().fields.find((f) => f.code === "TK_EA1")?.value).toBe("ETC");
    expect(decl().fields.find((f) => f.code === "TK_EB1")?.value).toBe(sent.receiptNo);

    const after = await getHysOverview(NEW);
    expect(after.suggestions.find((s) => s.code === "A02")).toBeUndefined();
  });

  it("1.63 đủ 3 cặp: overview attachmentSlots; không chọn cặp → HYS_SLOTS_FULL; replaceSlot → thay cặp đó (REPLACED)", async () => {
    const send = async (code: string, attachKind: "INV" | "BOL" | "CON" | "ALL", replaceSlot?: 1 | 2 | 3) => {
      const h = await createHys(NEW, { procedureCode: code, attachKind });
      await uploadHysFiles(NEW, h.id, [new File(["x"], "a.pdf", { type: "application/pdf" })]);
      return { id: h.id, run: () => sendHys(NEW, h.id, { certificateId: CERT, ...(replaceSlot ? { replaceSlot } : {}) }) };
    };
    const sent: string[] = [];
    for (const [code, kind] of [["A01", "INV"], ["A02", "BOL"], ["A08", "CON"]] as const) sent.push((await (await send(code, kind)).run()).receiptNo!);
    const o = await getHysOverview(NEW);
    expect(o.attachmentSlots).toEqual([
      { slot: 1, code: "INV", receipt: sent[0] },
      { slot: 2, code: "BOL", receipt: sent[1] },
      { slot: 3, code: "CON", receipt: sent[2] },
    ]);
    const fourth = await send("A99", "ALL");
    expect(await err(fourth.run())).toMatchObject({ reason: "HYS_SLOTS_FULL", params: { field: "1.63" } });
    const r = await sendHys(NEW, fourth.id, { certificateId: CERT, replaceSlot: 2 });
    expect(r.fill).toEqual({ outcome: "REPLACED", slot: 2, replaced: { code: "BOL", receipt: sent[1] }, afterApproval: true });
    expect(decl().fields.find((f) => f.code === "TK_EA2")?.value).toBe("ALL");
    expect(decl().fields.find((f) => f.code === "TK_EB2")?.value).toBe(r.receiptNo);
  });

  it("phân loại đính kèm: chọn chứng từ hồ sơ → đề xuất theo loại (1 loại → mã đó, nhiều loại → ALL); đã chọn tay thì giữ", async () => {
    const docs = getDb().documents.filter((d) => d.dossierId === NEW);
    const inv = docs.find((d) => d.kind === "INVOICE")!;
    const other = docs.find((d) => d.kind !== "INVOICE" && d.kind !== "FREIGHT_INVOICE")!;
    const a = await createHys(NEW, { procedureCode: "A02" });
    await updateHys(NEW, a.id, { documentIds: [inv.id] });
    expect((await sendHys(NEW, a.id, { certificateId: CERT })).attachKind).toBe("INV");
    const b = await createHys(NEW, { procedureCode: "A01" });
    await updateHys(NEW, b.id, { documentIds: [inv.id, other.id] });
    expect((await sendHys(NEW, b.id, { certificateId: CERT })).attachKind).toBe("ALL");
    const c = await createHys(NEW, { procedureCode: "A08" });
    await updateHys(NEW, c.id, { documentIds: [inv.id], attachKind: "INS" });
    expect((await sendHys(NEW, c.id, { certificateId: CERT })).attachKind).toBe("INS");
    expect(decl().fields.find((f) => f.code === "TK_EA3")?.value).toBe("INS");
  });

  it("bộ chưa đủ điều kiện → HYS_INVALID; đã gửi thì không sửa/xóa", async () => {
    const h = await createHys(NEW, {});
    expect(await err(sendHys(NEW, h.id, { certificateId: CERT }))).toMatchObject({ reason: "HYS_INVALID" });
    await updateHys(NEW, h.id, { procedureCode: "A02", customsOffice: "01B1", processingUnit: "00", phone: "0900000000" });
    const withFile = await uploadHysFiles(NEW, h.id, [new File(["x"], "a.pdf")]);
    await sendHys(NEW, h.id, { certificateId: CERT });
    expect(await err(deleteHys(NEW, h.id))).toMatchObject({ reason: "HYS_NOT_EDITABLE" });
    expect(await err(removeHysFile(NEW, h.id, withFile.files[0]!.id))).toMatchObject({ reason: "HYS_NOT_EDITABLE" });
  });

  it("submitDeclaration có gợi ý chưa thỏa, không cờ → HYS_SUGGESTED; có cờ → khai được", async () => {
    const e = await err(submitDeclaration(NEW, CERT));
    expect(e).toMatchObject({ reason: "HYS_SUGGESTED" });
    expect(e!.params?.["codes"]).toContain("A02");
    expect(await err(performOperation(NEW, "IDA"))).toMatchObject({ reason: "HYS_SUGGESTED" });
    expect(await err(submitDeclaration(NEW, CERT, { hysWaived: true }))).toBeNull();
  });

  it("guard HYS chỉ ở tờ 1: tờ 2 không báo HYS_SUGGESTED; khai nối tiếp các tờ sau không cần cờ", async () => {
    expect(await err(performOperation(BIG, "IDA", 2))).not.toMatchObject({ reason: "HYS_SUGGESTED" });
    expect(await err(submitDeclaration(BIG, CERT))).toMatchObject({ reason: "HYS_SUGGESTED" });
    expect(await err(submitDeclaration(BIG, CERT, { hysWaived: true }))).toBeNull();
    vi.setSystemTime(Date.now() + 20_000);
    const sub = await getSubmission(BIG);
    expect(sub.branches.map((b) => b.stage)).toEqual(["PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED"]);
  });
});
