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
    expect(decl().fields.find((f) => f.code === "TK_EA1")?.value).toBe("A02");
    expect(decl().fields.find((f) => f.code === "TK_EB1")?.value).toBe(sent.receiptNo);

    const after = await getHysOverview(NEW);
    expect(after.suggestions.find((s) => s.code === "A02")).toBeUndefined();
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
