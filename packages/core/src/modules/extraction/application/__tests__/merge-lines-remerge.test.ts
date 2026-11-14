// Gộp / tách dòng hàng giống nhau qua remerge: chỉ dòng gộp/tách tính lại số lượng – thành tiền; giá trị người khai sửa ở dòng khác giữ nguyên.
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import { refreshAfterSourcesChanged } from "../_remerge.js";
import type { ExtractionDeps } from "../ports.js";
import { listFields } from "../list-fields.js";
import { processDocument } from "../process-document.js";
import { FakeDocuments, InMemoryExtractionUow, NoSkills, NoValidation, RecordingUsage, ScriptedAi } from "../test/fakes.js";
import { updateFieldValue } from "../update-field-value.js";

const item = (lineNo: number, description: string, quantity: number, amount: number) => ({ lineNo, description, quantity, unit: "KGM", unitPrice: 2, amount, origin: "ID", hsCodeOnInvoice: null });
const INVOICE4 = (): typeof INVOICE => ({ ...INVOICE, items: [item(1, "Tuna", 1, 2), item(2, "Squid", 5, 10), item(3, "Fish", 5, 10), item(4, "Fish", 5, 10)] });
const INVOICE = {
  invoiceNo: "INV-1", invoiceDate: "2026-10-02", seller: { name: "S", address: null, taxCode: null, country: "ID" }, buyer: { name: "B", address: null, taxCode: null, country: "VN" },
  incoterm: "CIF", currency: "USD", totalAmount: 40, paymentTerms: null, poNo: null, grossWeightKg: null, packages: null, uncertainties: [],
  items: [item(1, "Fish", 10, 20), item(2, "Squid", 5, 10), item(3, "Fish", 5, 10)],
};
const ctx: Ctx = { orgId: asOrgId("org_a"), userId: asUserId("usr_a"), role: "DECLARANT" };

let uow: InMemoryExtractionUow;
let docs: FakeDocuments;
let deps: ExtractionDeps;
const field = (key: string) => uow.data.fields.find((f) => f.key === key);

beforeEach(async () => {
  uow = new InMemoryExtractionUow();
  docs = new FakeDocuments();
  deps = { uow, documents: docs, validation: new NoValidation(), ai: new ScriptedAi({ INVOICE }), usage: new RecordingUsage(), skills: new NoSkills(), clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen() };
  docs.docs.push({ id: "doc_inv", orgId: "org_a", dossierId: "dos_1", kind: "INVOICE", kindSource: "USER", fileName: "inv.pdf", mime: "application/pdf", pages: 1, status: "QUEUED", storageKey: "k", sha256: "s" });
  docs.files.set("k", Buffer.from("%PDF"));
  unwrap(await processDocument(deps, { orgId: "org_a", dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
});

describe("gộp / tách dòng hàng qua remerge", () => {
  it("gộp dòng 1+3, dòng 2 người khai sửa số lượng 5→6 giữ nguyên qua gộp và tách; tách lại → dòng 3 trở lại, dòng 1 về số AI", async () => {
    unwrap(await updateFieldValue(deps, ctx, field("item.2.quantity")!.id, "6"));
    docs.dossierMergeLines = true;
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.1.quantity")).toMatchObject({ value: "15", note: "Gộp dòng 1, 3" });
    expect(field("item.1.amount")?.value).toBe("30");
    expect(field("item.3.quantity")).toBeUndefined();
    expect(field("item.2.quantity")).toMatchObject({ value: "6", originalValue: "5", status: "USER_CONFIRMED", confirmedBy: "usr_a" });
    expect(uow.data.shipments.at(-1)!.data.items.map((it) => it.lineNo)).toEqual([1, 2]);

    docs.dossierMergeLines = false;
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.1.quantity")).toMatchObject({ value: "10", originalValue: "10" });
    expect(field("item.3.quantity")?.value).toBe("5");
    expect(field("item.2.quantity")).toMatchObject({ value: "6", originalValue: "5", status: "USER_CONFIRMED", confirmedBy: "usr_a" });
  });

  it("người khai sửa số lượng dòng gộp → giữ khi dựng lại mà cờ vẫn bật; tách → bỏ (không còn đúng chỗ)", async () => {
    docs.dossierMergeLines = true;
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    unwrap(await updateFieldValue(deps, ctx, field("item.1.quantity")!.id, "16"));
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.1.quantity")).toMatchObject({ value: "16", originalValue: "15", status: "USER_CONFIRMED" });
    docs.dossierMergeLines = false;
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.1.quantity")).toMatchObject({ value: "10", originalValue: "10" });
    expect(field("item.1.quantity")?.status).not.toBe("USER_CONFIRMED");
  });

  it("dòng gộp cộng theo số người khai đã sửa ở từng dòng trong nhóm (dòng 3 số lượng 5→7, dòng 1 thành tiền 20→21) → 17 / 31", async () => {
    unwrap(await updateFieldValue(deps, ctx, field("item.3.quantity")!.id, "7"));
    unwrap(await updateFieldValue(deps, ctx, field("item.1.amount")!.id, "21"));
    docs.dossierMergeLines = true;
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.1.quantity")?.value).toBe("17");
    expect(field("item.1.amount")?.value).toBe("31");
    // Dựng lại lần nữa (cờ vẫn bật) → không cộng lặp, không mất số riêng của dòng đầu nhóm.
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.1.quantity")?.value).toBe("17");
    expect(field("item.1.amount")?.value).toBe("31");
    // Sửa số của cả dòng gộp 31→35 → dựng lại vẫn 35.
    unwrap(await updateFieldValue(deps, ctx, field("item.1.amount")!.id, "35"));
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.1.amount")).toMatchObject({ value: "35", originalValue: "31", status: "USER_CONFIRMED" });
    expect(unwrap(await listFields(deps, ctx, "dos_1")).filter((f) => f.key.includes("@"))).toEqual([]);
    // Tách → số riêng từng dòng người khai đã sửa trở lại.
    docs.dossierMergeLines = false;
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.1.amount")).toMatchObject({ value: "21", originalValue: "20", status: "USER_CONFIRMED", confirmedBy: "usr_a" });
    expect(field("item.3.quantity")).toMatchObject({ value: "7", status: "USER_CONFIRMED" });
    expect(uow.data.fields.some((f) => f.key.endsWith("@line"))).toBe(false);
  });

  it("trường đã xác nhận của dòng bị gộp: ẩn khi đang gộp, tách lại → khôi phục nguyên giá trị + người xác nhận", async () => {
    unwrap(await updateFieldValue(deps, ctx, field("item.3.description")!.id, "fish"));
    unwrap(await updateFieldValue(deps, ctx, field("item.3.quantity")!.id, "7"));
    docs.dossierMergeLines = true;
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(unwrap(await listFields(deps, ctx, "dos_1")).some((f) => f.key.startsWith("item.3."))).toBe(false);
    docs.dossierMergeLines = false;
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.3.description")).toMatchObject({ value: "fish", status: "USER_CONFIRMED", confirmedBy: "usr_a" });
    expect(field("item.3.quantity")).toMatchObject({ value: "7", originalValue: "5", status: "USER_CONFIRMED" });
    expect(uow.data.shipments.at(-1)!.data.items.find((it) => it.lineNo === 3)?.quantity.value).toBe("7");
  });

  it("đổi dòng đầu nhóm khi đang gộp (nhóm 3+4, rồi dòng 1 sửa tên cho giống): số riêng không mất, số cả nhóm không bị cộng như số riêng", async () => {
    // Hồ sơ riêng 4 dòng (nhóm Fish 3+4).
    uow = new InMemoryExtractionUow();
    docs = new FakeDocuments();
    deps = { ...deps, uow, documents: docs, ai: new ScriptedAi({ INVOICE: INVOICE4() }) };
    docs.docs.push({ id: "doc_inv", orgId: "org_a", dossierId: "dos_1", kind: "INVOICE", kindSource: "USER", fileName: "inv.pdf", mime: "application/pdf", pages: 1, status: "QUEUED", storageKey: "k", sha256: "s" });
    docs.files.set("k", Buffer.from("%PDF"));
    unwrap(await processDocument(deps, { orgId: "org_a", dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
    unwrap(await updateFieldValue(deps, ctx, field("item.3.amount")!.id, "12"));
    docs.dossierMergeLines = true;
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.3.amount")?.value).toBe("22");
    // Người khai sửa số cả nhóm 22→25 (ở dòng đầu cũ), rồi sửa tên dòng 1 cho giống → nhóm 1+3+4, dòng 1 làm đầu.
    unwrap(await updateFieldValue(deps, ctx, field("item.3.amount")!.id, "25"));
    unwrap(await updateFieldValue(deps, ctx, field("item.1.description")!.id, "Fish"));
    unwrap(await updateFieldValue(deps, ctx, field("item.1.unit_price")!.id, "2"));
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.1.amount")?.value).toBe("24"); // 2 + 12 (riêng dòng 3) + 10 – không dùng số cả nhóm 25
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.1.amount")?.value).toBe("24");
    docs.dossierMergeLines = false;
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(field("item.3.amount")).toMatchObject({ value: "12", originalValue: "10", status: "USER_CONFIRMED" });
    expect(field("item.1.amount")?.value).toBe("2");
    expect(field("item.4.amount")?.value).toBe("10");
    expect(uow.data.fields.some((f) => f.key.endsWith("@line"))).toBe(false);
  });
});

