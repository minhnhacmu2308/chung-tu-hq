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

describe("phê duyệt chặn khi còn ô bắt buộc trống (mock)", () => {
  it("dos_023 thiếu mã địa điểm lưu kho (1.29) → VALIDATION nêu chỉ tiêu; nhập xong → duyệt được", async () => {
    await expect(approveDeclaration(DRAFT)).rejects.toMatchObject({ code: "VALIDATION", message: expect.stringContaining("1.29 Mã địa điểm lưu kho") });
    expect(getDb().declarations.find((d) => d.dossierId === DRAFT)!.status).toBe("DRAFT");
    await updateDeclarationField(DRAFT, "KHO", "03CEC01");
    expect((await approveDeclaration(DRAFT)).status).toBe("APPROVED");
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

describe("tổng theo tờ khai nhánh (mock)", () => {
  const cents = (s: string) => BigInt(s.replace(".", ""));
  const fmt = (n: bigint) => `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
  it("lô 120 dòng → 3 tờ 50 + 50 + 20; tổng các tờ = tổng hồ sơ", async () => {
    const v = await getDeclarationView("dos_028");
    expect(v.items).toHaveLength(120);
    expect(v.branches.map((b) => [b.no, b.of, b.lineFrom, b.lineTo])).toEqual([[1, 3, 1, 50], [2, 3, 51, 100], [3, 3, 101, 120]]);
    const total = v.items.reduce((s, i) => s + cents(i.amount), 0n);
    expect(v.branches.reduce((s, b) => s + cents(b.invoiceValue), 0n)).toBe(total);
    expect(v.branches[0]!.invoiceValue).toBe(fmt(v.items.slice(0, 50).reduce((s, i) => s + cents(i.amount), 0n)));
    expect(v.branches.reduce((s, b) => s + BigInt(b.customsValueVnd), 0n)).toBe(v.items.reduce((s, i) => s + BigInt(i.customsValueVnd), 0n));
    expect(getDb().dossiers.find((d) => d.id === "dos_028")!.invoiceValue).toBe(fmt(total));
  });
  it("lô ≤ 50 dòng → một tờ", async () => {
    expect((await getDeclarationView(APPROVED)).branches).toMatchObject([{ no: 1, of: 1, lineFrom: 1, lineTo: 2 }]);
  });
});
