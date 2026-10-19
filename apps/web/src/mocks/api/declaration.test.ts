import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { approveDeclaration, confirmHs, getDeclarationView, reopenDeclaration, updateDeclarationField } from "./declaration";

const DRAFT = "dos_023";
const APPROVED = "dos_024";
const code = async (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string }) => e.code);

beforeEach(() => resetDb());

describe("sửa chỉ tiêu tờ khai (mock)", () => {
  it("giá trị mới mang nguồn USER, hết nghi ngờ, giữ khi dựng lại sau xác nhận HS", async () => {
    const before = (await getDeclarationView(DRAFT)).declaration!;
    const target = before.fields.find((f) => f.suspect && f.code !== "TY_GIA")!;
    const after = await updateDeclarationField(DRAFT, target.code, "  GIÁ TRỊ MỚI ");
    expect(after.fields.find((f) => f.code === target.code)).toEqual({ code: target.code, ...(target.no ? { no: target.no } : {}), label: target.label, section: target.section, value: "GIÁ TRỊ MỚI", source: "USER" });
    expect(getDb().dossiers.find((d) => d.id === DRAFT)!.suspectFields).toBe(after.fields.filter((f) => f.suspect).length);
    const item = getDb().lineItems.find((i) => i.dossierId === DRAFT && i.hsConfirmed)!;
    await confirmHs(item.id, item.hsConfirmed!);
    expect((await getDeclarationView(DRAFT)).declaration!.fields.find((f) => f.code === target.code)).toMatchObject({ value: "GIÁ TRỊ MỚI", source: "USER" });
  });

  it("chặn: chỉ tiêu tính từ hóa đơn/tỷ giá, chỉ tiêu lạ, tờ khai đã duyệt, vai trò chỉ xem", async () => {
    expect(await code(updateDeclarationField(DRAFT, "TONG_TG", "1"))).toBe("VALIDATION");
    expect(await code(updateDeclarationField(DRAFT, "NOPE", "1"))).toBe("NOT_FOUND");
    expect(await code(updateDeclarationField(APPROVED, "SO_HD", "X"))).toBe("INVALID_STATE");
    const db = getDb();
    db.members.find((m) => m.id === db.currentUserId)!.role = "VIEWER";
    expect(await code(updateDeclarationField(DRAFT, "SO_HD", "X"))).toBe("FORBIDDEN");
    expect(await code(reopenDeclaration(APPROVED))).toBe("FORBIDDEN");
  });
});

describe("sửa theo giai đoạn tờ khai (mock)", () => {
  it("chưa khai báo: ô người khai chưa có mã app (mã phân loại hàng hóa 1.5) lưu được theo tên trường VNACCS, giữ khi dựng lại", async () => {
    const after = await updateDeclarationField(DRAFT, "TK_CCC", " B ");
    expect(after.fields.find((f) => f.code === "TK_CCC")).toMatchObject({ value: "B", source: "USER", no: "1.5" });
    const item = getDb().lineItems.find((i) => i.dossierId === DRAFT && i.hsConfirmed)!;
    await confirmHs(item.id, item.hsConfirmed!);
    expect((await getDeclarationView(DRAFT)).declaration!.fields.find((f) => f.code === "TK_CCC")?.value).toBe("B");
  });
  it("đã phân luồng + gọi IDD: chặn chỉ tiêu không được khai bổ sung (mục 3.1), cho chỉ tiêu khác", async () => {
    getDb().customsFlows = { ...getDb().customsFlows, [DRAFT]: { ...(getDb().customsFlows?.[DRAFT] ?? {}), stage: "AMEND_RECALLED" } as never };
    expect(await code(updateDeclarationField(DRAFT, "PTVC", "2"))).toBe("INVALID_STATE");
    expect(await code(updateDeclarationField(DRAFT, "TK_CCC", "B"))).toBe("INVALID_STATE");
    expect(await code(updateDeclarationField(DRAFT, "SO_HD", "INV-9"))).toBe("OK");
  });
  it("ô dòng hàng chỉ có trên tờ khai lưu theo id dòng; số liệu chứng từ / dòng của hồ sơ khác → NOT_FOUND; sai kiểu → VALIDATION", async () => {
    const line = getDb().lineItems.find((i) => i.dossierId === DRAFT)!;
    const other = getDb().lineItems.find((i) => i.dossierId !== DRAFT)!;
    const after = await updateDeclarationField(DRAFT, `HANG.${line.id}.HAG_RE`, "XN210");
    expect(after.fields.find((f) => f.code === `HANG.${line.id}.HAG_RE`)).toMatchObject({ value: "XN210", no: "1.92", label: `Dòng ${line.lineNo} – Mã miễn/giảm/không chịu thuế nhập khẩu` });
    expect(await code(updateDeclarationField(DRAFT, `HANG.${line.id}.HAG_CMN`, "x"))).toBe("NOT_FOUND");
    expect(await code(updateDeclarationField(DRAFT, `HANG.${other.id}.HAG_RE`, "x"))).toBe("NOT_FOUND");
    expect(await code(updateDeclarationField(DRAFT, `HANG.${line.id}.HAG_QN2`, "1,5"))).toBe("VALIDATION");
  });
  it("đã thông quan: khóa toàn bộ (sửa sau thông quan là nghiệp vụ AMA)", async () => {
    getDb().customsFlows = { ...getDb().customsFlows, [DRAFT]: { ...(getDb().customsFlows?.[DRAFT] ?? {}), stage: "POST_EDITING" } as never };
    expect(await code(updateDeclarationField(DRAFT, "SO_HD", "INV-9"))).toBe("INVALID_STATE");
  });
});

describe("mở lại tờ khai (mock)", () => {
  it("đã duyệt chưa truyền → nháp, hồ sơ về bước review, duyệt lại được", async () => {
    await reopenDeclaration(APPROVED);
    const decl = (await getDeclarationView(APPROVED)).declaration!;
    expect(decl.status).toBe("DRAFT");
    expect(decl.approvedBy).toBeUndefined();
    expect(getDb().dossiers.find((d) => d.id === APPROVED)).toMatchObject({ status: "NEEDS_REVIEW", step: "review" });
    expect((await approveDeclaration(APPROVED)).status).toBe("APPROVED");
  });

  it("bản nháp → INVALID_STATE; đã truyền → DOSSIER_LOCKED", async () => {
    expect(await code(reopenDeclaration(DRAFT))).toBe("INVALID_STATE");
    const submitted = getDb().declarations.find((d) => d.status === "SUBMITTED")!;
    expect(await code(reopenDeclaration(submitted.dossierId))).toBe("DOSSIER_LOCKED");
  });
});
