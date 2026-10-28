import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { listChecks, listFields, updateFieldValue, revertField } from "./api/ocr";
import { getValueCharges, saveValueCharges } from "./api/value-charges";
import { parseFreightTerm } from "./freight-term";

const D = "dos_021"; // FCA, vận đơn ghi FREIGHT COLLECT
const check = async () => (await listChecks(D)).find((c) => c.ruleCode === "R-FREIGHT-TERM");
const incotermField = async () => {
  const docs = new Set(getDb().documents.filter((d) => d.dossierId === D && d.kind === "INVOICE").map((d) => d.id));
  return (await listFields(D)).find((f) => f.key === "incoterm" && docs.has(f.documentId))!;
};

beforeEach(() => resetDb());

describe("R-FREIGHT-TERM (mock)", () => {
  it("đọc ô Điều kiện cước của vận đơn", () => {
    expect(parseFreightTerm("FREIGHT COLLECT")).toBe("COLLECT");
    expect(parseFreightTerm("Freight Prepaid")).toBe("PREPAID");
    expect(parseFreightTerm("AS ARRANGED")).toBeNull();
  });

  it("FCA + Collect → khớp; đổi sang CIF trên hóa đơn → điều kiện của hồ sơ đổi theo, luật chặn; hoàn tác → khớp lại", async () => {
    expect(await check()).toMatchObject({ result: "PASS" });
    expect((await getValueCharges(D)).freightTerm).toBe("COLLECT");
    const f = await incotermField();
    await updateFieldValue(f.id, "CIF HAIPHONG");
    expect(getDb().dossiers.find((d) => d.id === D)!.incoterm).toBe("CIF");
    expect(await check()).toMatchObject({ result: "FAIL", severity: "BLOCKER" });
    expect((await getValueCharges(D)).freightRequired).toBe(false);
    // Ghi người sửa theo tài khoản đang đăng nhập + thời điểm (backend: extracted_fields.confirmed_by/at); hoàn tác → xóa.
    const edited = (await listFields(D)).find((x) => x.id === f.id)!;
    expect(edited.confirmedBy).toBe(getDb().currentUserId);
    expect(edited.confirmedAt).toBeTruthy();
    await revertField(f.id);
    expect(await check()).toMatchObject({ result: "PASS" });
    expect((await listFields(D)).find((x) => x.id === f.id)!.confirmedBy).toBeUndefined();
  }, 60_000);

  it("CIF + Collect có lý do → cảnh báo kèm lý do", async () => {
    await updateFieldValue((await incotermField()).id, "CIF");
    const v = await getValueCharges(D);
    await saveValueCharges(D, { ...v.charges, freightTermNote: { reason: "LOCAL_CHARGES", note: "THC + D/O" } });
    const c = await check();
    expect(c).toMatchObject({ result: "WARN" });
    expect(c!.detail).toMatch(/phí tại cảng đến.*THC \+ D\/O/);
  }, 60_000);
});
