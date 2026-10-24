import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_VALUE_CHARGES } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { getDeclarationView } from "./declaration";
import { getValueCharges, saveValueCharges } from "./value-charges";

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
});
