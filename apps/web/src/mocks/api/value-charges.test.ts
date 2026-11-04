import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_VALUE_CHARGES } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { getDeclarationView } from "./declaration";
import { getValueCharges, saveValueCharges } from "./value-charges";
import { exportValueFields } from "@/mocks/declaration-builder";

const DRAFT = "dos_023";
const code = async (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string }) => e.code);

beforeEach(() => resetDb());

describe("chi phí và điều chỉnh trị giá (mock)", () => {
  it("xem: cước đọc từ chứng từ; lưu cước nhập tay → tờ khai nháp tính lại trị giá tính thuế", async () => {
    const v = await getValueCharges(DRAFT);
    expect(v.charges).toEqual(EMPTY_VALUE_CHARGES);
    expect(v.fromDocuments.freight).toMatchObject({ amount: "1380.00", currency: "USD" });
    const before = (await getDeclarationView(DRAFT)).declaration!.customsValueVnd;
    const saved = await saveValueCharges(DRAFT, { ...EMPTY_VALUE_CHARGES, freight: { amount: "2000", currency: "USD", reason: "CONTRACT", note: "" }, insurance: { mode: "NONE" } });
    expect(saved.charges.freight).toMatchObject({ amount: "2000" });
    const after = (await getDeclarationView(DRAFT)).declaration!;
    expect(v.freightRequired).toBe(true);
    expect(after.customsValueVnd).not.toBe(before);
    expect((await getValueCharges(DRAFT)).updatedBy).toBe(getDb().currentUserId);
  });

  it("chặn: vai trò chỉ xem; hồ sơ đã duyệt; dữ liệu sai dạng", async () => {
    const db = getDb();
    const approved = db.dossiers.find((d) => d.status === "APPROVED")!;
    expect(await code(saveValueCharges(approved.id, EMPTY_VALUE_CHARGES))).toBe("DOSSIER_LOCKED");
    expect(await code(saveValueCharges(DRAFT, { ...EMPTY_VALUE_CHARGES, freight: { amount: "1", currency: null, reason: "CONTRACT", note: "" } }))).not.toBe("OK");
    db.members.find((m) => m.id === db.currentUserId)!.role = "VIEWER";
    expect(await code(saveValueCharges(DRAFT, EMPTY_VALUE_CHARGES))).toBe("FORBIDDEN");
  });

  it("ràng buộc theo chứng từ: có cước mà chỉ ghi lý do → lỗi có mã; không có phí khác → khai Không có phí phát sinh được", async () => {
    await expect(saveValueCharges(DRAFT, { ...EMPTY_VALUE_CHARGES, freight: { amount: null, currency: null, reason: "CONTRACT", note: "" } }))
      .rejects.toMatchObject({ code: "VALIDATION", reason: "CHARGES_FREIGHT_AMOUNT_REQUIRED", params: { amount: "1380.00", currency: "USD" } });
    const v = await getValueCharges(DRAFT);
    if (v.fromDocuments.other.length > 0) {
      await expect(saveValueCharges(DRAFT, { ...EMPTY_VALUE_CHARGES, adjustments: [] })).rejects.toMatchObject({ reason: "CHARGES_ADJUSTMENTS_IN_DOCS" });
    } else {
      expect((await saveValueCharges(DRAFT, { ...EMPTY_VALUE_CHARGES, adjustments: [] })).charges.adjustments).toEqual([]);
    }
  });
});

describe("tờ khai xuất (mock, giống backend)", () => {
  const XK = "dos_025";
  it("FOB: không có khoản khác, không hỏi bảo hiểm; FCA: giữ khoản cộng mã N, không phân bổ; DAP: trừ cước, bảo hiểm", async () => {
    expect(await getValueCharges(XK)).toMatchObject({ direction: "XK", incoterm: "FOB", adjustmentsAllowed: false, insuranceIncluded: false });
    const row = { code: "A", kind: "AD" as const, amount: "150", currency: "USD", note: "Vận chuyển nội địa", allocate: true };
    expect((await saveValueCharges(XK, { ...EMPTY_VALUE_CHARGES, adjustments: [row] })).charges.adjustments).toBeNull();
    getDb().dossiers.find((d) => d.id === XK)!.incoterm = "FCA";
    expect((await saveValueCharges(XK, { ...EMPTY_VALUE_CHARGES, adjustments: [row] })).charges.adjustments).toEqual([{ ...row, code: "N", allocate: false }]);
    getDb().dossiers.find((d) => d.id === XK)!.incoterm = "DAP";
    expect(await getValueCharges(XK)).toMatchObject({ adjustmentsAllowed: true, insuranceIncluded: true, freightRequired: true });
    getDb().dossiers.find((d) => d.id === XK)!.transportMode = "OTHER"; // phương thức 9: giao tại chỗ
    expect(await getValueCharges(XK)).toMatchObject({ insuranceIncluded: false, freightRequired: false });
  });

  it("2.40 và diễn giải 2.32: CIF trừ cước, bảo hiểm; FOB không khai; quá 140 ký tự thì gộp", () => {
    const adj = (label: string, amount: string) => ({ label, amount, currency: "USD", source: "USER" as const });
    expect(exportValueFields("CIF", "USD", "20850.00", [adj("Cước vận chuyển quốc tế", "-1150"), adj("Phí bảo hiểm – người khai nhập", "-40")]))
      .toEqual({ value: "19660 USD", marks: "TGTT 2.40: CIF 20850 USD - cuoc 1150 USD - BH 40 USD = 19660 USD" });
    expect(exportValueFields("FOB", "USD", "20850.00", [])).toBeNull();
    expect(exportValueFields("DAP", "USD", "100.00", [adj("Cước vận chuyển quốc tế", "-10")])).toEqual({ value: "90 USD", marks: "TGTT 2.40: DAP 100 USD - cuoc 10 USD = 90 USD" });
    expect(exportValueFields("CFR", "USD", "100.00", [])).toEqual({ value: "100 USD", marks: "" });
    const many = exportValueFields("FCA", "USD", "20850.00", ["1", "2", "3", "4", "5"].map((n) => adj(`Khoản ${n}`, "1000.25")));
    expect(many?.marks).toBe("TGTT 2.40: FCA 20850 USD +/- dieu chinh = 25851.25 USD");
  });
});
