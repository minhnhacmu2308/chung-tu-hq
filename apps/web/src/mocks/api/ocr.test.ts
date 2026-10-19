import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { getDeclarationView, updateDeclarationField } from "./declaration";
import { revertField, updateFieldValue } from "./ocr";

const D = "dos_023";

beforeEach(() => resetDb());

/** Ô dòng hàng trên invoice của hồ sơ (dữ liệu mẫu: bảng hàng invoice cùng số liệu với dòng hàng). */
function itemField(key: string) {
  const db = getDb();
  const invoice = db.documents.find((d) => d.dossierId === D && d.kind === "INVOICE")!;
  return db.fields.find((f) => f.documentId === invoice.id && f.key === key)!;
}

describe("sửa dòng hàng ở OCR (mock) → dòng hàng + tờ khai nháp cập nhật theo", () => {
  it("dữ liệu mẫu: bảng hàng invoice khớp dòng hàng của tờ khai", () => {
    const line = getDb().lineItems.find((i) => i.dossierId === D && i.lineNo === 1)!;
    expect(itemField("item.1.unit_price").value).toBe(line.unitPrice);
    expect(itemField("item.1.origin").value).toBe(line.origin);
  });
  it("ĐVT, đơn giá, xuất xứ, số lượng (bỏ đơn vị kèm theo) ghi vào dòng cùng số dòng; giữ id dòng, HS và ô người khai nhập theo id", async () => {
    const line = getDb().lineItems.find((i) => i.dossierId === D && i.lineNo === 1)!;
    await updateDeclarationField(D, `HANG.${line.id}.HAG_RE`, "XN210");
    await updateFieldValue(itemField("item.1.unit").id, "set");
    await updateFieldValue(itemField("item.1.unit_price").id, "15.20");
    await updateFieldValue(itemField("item.1.origin").id, "jp");
    await updateFieldValue(itemField("item.1.quantity").id, "1600 PCS");
    const after = getDb().lineItems.find((i) => i.id === line.id)!;
    expect(after).toMatchObject({ unit: "SET", unitPrice: "15.20", origin: "JP", quantity: "1600", hsConfirmed: line.hsConfirmed });
    expect((await getDeclarationView(D)).declaration!.fields.find((f) => f.code === `HANG.${line.id}.HAG_RE`)?.value).toBe("XN210");
  });
  it("hoàn tác về giá trị đọc ban đầu cũng đồng bộ lại", async () => {
    const id = itemField("item.1.unit").id;
    await updateFieldValue(id, "SET");
    await revertField(id);
    expect(getDb().lineItems.find((i) => i.dossierId === D && i.lineNo === 1)?.unit).toBe("PCE");
  });
});
