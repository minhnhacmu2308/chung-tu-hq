import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { createSkill, getSkillById } from "./skills";

const code = async (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string }) => e.code);

beforeEach(() => resetDb());

describe("tạo skill mới (mock)", () => {
  it("trường chuẩn của danh mục, mã tự sinh tăng dần, version 1", async () => {
    const a = await createSkill({ name: "Invoice – kho Bắc Ninh", kind: "DOCUMENT", docKind: "INVOICE" });
    expect(a).toMatchObject({ code: "SK-INV-2", version: 1, labeledSamples: 0, enabled: true, language: "Đa ngôn ngữ" });
    expect(a.accuracy).toBeUndefined();
    expect(a.fields[0]).toMatchObject({ key: "invoiceNo", type: "code", required: false, extract: true, display: true });
    expect((await createSkill({ name: "Invoice khác", kind: "DOCUMENT", docKind: "INVOICE" })).code).toBe("SK-INV-3");
    expect((await getSkillById(a.id)).name).toBe("Invoice – kho Bắc Ninh");
  });
  it("sao chép trường từ skill có sẵn cùng loại chứng từ; khác loại → VALIDATION; không có → NOT_FOUND", async () => {
    const src = getDb().skills.find((s) => s.code === "SK-INV-GEN")!;
    const s = await createSkill({ name: "Invoice – KAIDA", kind: "SUPPLIER", docKind: "INVOICE", supplier: "KAIDA", copyFromSkillId: src.id, code: "SK-INV-KAIDA" });
    expect(s).toMatchObject({ code: "SK-INV-KAIDA", supplier: "KAIDA" });
    expect(s.fields).toEqual(src.fields);
    expect(await code(createSkill({ name: "PL copy", kind: "DOCUMENT", docKind: "PACKING_LIST", copyFromSkillId: src.id }))).toBe("VALIDATION");
    expect(await code(createSkill({ name: "PL copy", kind: "DOCUMENT", docKind: "PACKING_LIST", copyFromSkillId: "sk_nope" }))).toBe("NOT_FOUND");
  });
  it("trùng mã → DUPLICATE; thiếu nhà cung cấp → VALIDATION; không phải OWNER/ADMIN → FORBIDDEN", async () => {
    expect(await code(createSkill({ name: "Invoice 2", kind: "DOCUMENT", docKind: "INVOICE", code: "SK-INV-GEN" }))).toBe("DUPLICATE");
    expect(await code(createSkill({ name: "Invoice 2", kind: "SUPPLIER", docKind: "INVOICE" }))).toBe("VALIDATION");
    getDb().currentUserId = "usr_ha";
    expect(await code(createSkill({ name: "Invoice 2", kind: "DOCUMENT", docKind: "INVOICE" }))).toBe("FORBIDDEN");
  });
});
