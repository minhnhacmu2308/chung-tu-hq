import { beforeEach, describe, expect, it } from "vitest";
import { addHysUploadedFiles, createHysSubmission, deleteHysSubmission, getHysOverview, hysValuesOf, removeHysFile, updateHysSubmission } from "../hys-submissions.js";
import { approver, D, declarant, makeHarness, ORG, other, seed, viewer, type Harness } from "./_sheets-harness.js";

let h: Harness;
beforeEach(() => {
  h = makeHarness();
  h.dossiers.docs.push({ id: "doc_2", kind: "PACKING_LIST", fileName: "pl.pdf", storageKey: "k/pl.pdf", mime: "application/pdf", sizeBytes: 10 });
});
const create = async (code?: string) => {
  const r = await createHysSubmission(h.deps, declarant, D, code ? { procedureCode: code } : {});
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe("soạn bộ HYS", () => {
  it("tạo: seq tăng dần, TK_CH/TK_CHB điền sẵn, internalRef = mã hồ sơ", async () => {
    const a = await create("A02");
    const b = await create();
    expect([a.seq, b.seq]).toEqual([1, 2]);
    expect(a.procedureCode).toBe("A02");
    expect(a.customsOffice).toBe("03CE");
    expect(a.processingUnit).toBeTruthy();
    expect(a.internalRef).toBe("HS-NK-2610-021");
    expect(a.status).toBe("DRAFT");
  });

  it("phân loại đính kèm: tạo kèm attachKind; sửa đổi được; null = quay về đề xuất", async () => {
    const r = await createHysSubmission(h.deps, declarant, D, { procedureCode: "A01", attachKind: "INV" });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.attachKind).toBe("INV");
    expect((await create("A02")).attachKind).toBeNull();
    const u = await updateHysSubmission(h.deps, declarant, D, r.value.id, { attachKind: "DM" });
    expect(u.ok && u.value.attachKind).toBe("DM");
    const back = await updateHysSubmission(h.deps, declarant, D, r.value.id, { phone: "1" });
    expect(back.ok && back.value.attachKind).toBe("DM");
    const reset = await updateHysSubmission(h.deps, declarant, D, r.value.id, { attachKind: null });
    expect(reset.ok && reset.value.attachKind).toBeNull();
  });

  it("vai trò VIEWER không tạo được; mã thủ tục lạ → VALIDATION", async () => {
    expect((await createHysSubmission(h.deps, viewer, D, {})).ok).toBe(false);
    const r = await createHysSubmission(h.deps, approver, D, { procedureCode: "ZZZ" });
    expect(!r.ok && r.error.code).toBe("VALIDATION");
  });

  it("update documentIds thay file DOSSIER, giữ file UPLOAD; issues rỗng khi đủ", async () => {
    const s = await create("A02");
    const up = await addHysUploadedFiles(h.deps, declarant, D, s.id, [{ name: "ds.xlsx", mime: "application/vnd.ms-excel", bytes: Buffer.from("x") }]);
    expect(up.ok).toBe(true);
    const r = await updateHysSubmission(h.deps, declarant, D, s.id, { documentIds: ["doc_1", "doc_2"] });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.files.map((f) => [f.fileName, f.source])).toEqual([["ds.xlsx", "UPLOAD"], ["inv.pdf", "DOSSIER"], ["pl.pdf", "DOSSIER"]]);
    const r2 = await updateHysSubmission(h.deps, declarant, D, s.id, { documentIds: ["doc_2"], phone: "0901" });
    if (!r2.ok) throw new Error(JSON.stringify(r2.error));
    expect(r2.value.files.map((f) => f.fileName)).toEqual(["ds.xlsx", "pl.pdf"]);
    expect(r2.value.phone).toBe("0901");
    expect(r2.value.issues).toEqual([]);
    expect(h.uow.data.hys[0]!.customsOffice).toBe("03CE");
  });

  it("chứng từ không thuộc hồ sơ → VALIDATION", async () => {
    const s = await create("A02");
    const r = await updateHysSubmission(h.deps, declarant, D, s.id, { documentIds: ["doc_x"] });
    expect(!r.ok && r.error.code).toBe("VALIDATION");
  });

  it("upload HÓA ĐƠN.PDF: khóa K6 an toàn, fileName giữ tên gốc, ghi vào kho", async () => {
    const s = await create("A02");
    const r = await addHysUploadedFiles(h.deps, declarant, D, s.id, [{ name: "HÓA ĐƠN.PDF", mime: "application/pdf", bytes: Buffer.from("pdf") }]);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const row = h.uow.data.hysFiles[0]!;
    expect(row.storageKey).toBe(`orgs/${ORG}/dossiers/${D}/hys/${s.id}/${row.id}-H_A___N.PDF`);
    expect(row.fileName).toBe("HÓA ĐƠN.PDF");
    expect(row.sizeBytes).toBe(3);
    expect(h.dossiers.files.has(row.storageKey)).toBe(true);
  });

  it("upload .zip → VALIDATION, không lưu", async () => {
    const s = await create("A02");
    const r = await addHysUploadedFiles(h.deps, declarant, D, s.id, [{ name: "a.pdf", mime: "application/pdf", bytes: Buffer.from("1") }, { name: "a.zip", mime: "application/zip", bytes: Buffer.from("1") }]);
    expect(!r.ok && r.error.code).toBe("VALIDATION");
    expect(h.uow.data.hysFiles).toHaveLength(0);
    expect(h.dossiers.files.size).toBe(0);
  });

  it("removeHysFile xóa object file UPLOAD; deleteHysSubmission xóa object và bộ", async () => {
    const s = await create("A02");
    await addHysUploadedFiles(h.deps, declarant, D, s.id, [{ name: "a.pdf", mime: "application/pdf", bytes: Buffer.from("1") }, { name: "b.pdf", mime: "application/pdf", bytes: Buffer.from("2") }]);
    const [a, b] = h.uow.data.hysFiles;
    const r = await removeHysFile(h.deps, declarant, D, s.id, a!.id);
    expect(r.ok && r.value.files.map((f) => f.fileName)).toEqual(["b.pdf"]);
    expect(h.dossiers.files.has(a!.storageKey)).toBe(false);
    expect((await deleteHysSubmission(h.deps, declarant, D, s.id)).ok).toBe(true);
    expect(h.dossiers.files.has(b!.storageKey)).toBe(false);
    expect(h.uow.data.hys).toHaveLength(0);
  });

  it("bộ SENDING/ACCEPTED không sửa/xóa được → HYS_NOT_EDITABLE", async () => {
    for (const status of ["SENDING", "ACCEPTED"] as const) {
      const s = await create("A02");
      h.uow.data.hys.find((x) => x.id === s.id)!.status = status;
      const u = await updateHysSubmission(h.deps, declarant, D, s.id, { phone: "1" });
      const d = await deleteHysSubmission(h.deps, declarant, D, s.id);
      const f = await addHysUploadedFiles(h.deps, declarant, D, s.id, [{ name: "a.pdf", mime: "application/pdf", bytes: Buffer.from("1") }]);
      for (const r of [u, d, f]) expect(!r.ok && r.error.reason).toBe("HYS_NOT_EDITABLE");
    }
  });

  it("tổ chức khác → NOT_FOUND", async () => {
    const s = await create("A02");
    const u = await updateHysSubmission(h.deps, other, D, s.id, { phone: "1" });
    const d = await deleteHysSubmission(h.deps, other, D, s.id);
    const c = await createHysSubmission(h.deps, other, D, {});
    const o = await getHysOverview(h.deps, other, D);
    for (const r of [u, d, c, o]) expect(!r.ok && r.error.code).toBe("NOT_FOUND");
  });

  it("bộ của hồ sơ khác trong cùng org → NOT_FOUND", async () => {
    const s = await create("A02");
    const r = await updateHysSubmission(h.deps, declarant, "dos_other", s.id, { phone: "1" });
    expect(!r.ok && r.error.code).toBe("NOT_FOUND");
  });
});

describe("tổng quan HYS", () => {
  it("IDA có container → gợi ý A02; bộ A02 SENDING / ACCEPTED chưa có số vẫn gợi ý; ACCEPTED có số trong 1.63 → hết gợi ý", async () => {
    const s = await create("A02");
    const o1 = await getHysOverview(h.deps, declarant, D);
    expect(o1.ok && o1.value.suggestions.map((x) => x.code)).toEqual(["A02"]);
    expect(o1.ok && o1.value.defaults).toEqual({ customsOffice: "03CE", processingUnit: expect.anything(), internalRef: "HS-NK-2610-021" });
    const row = h.uow.data.hys.find((x) => x.id === s.id)!;
    const codesNow = async () => { const o = await getHysOverview(h.deps, declarant, D); return o.ok && o.value.suggestions.map((x) => x.code); };
    row.status = "SENDING";
    expect(await codesNow()).toEqual(["A02"]);
    Object.assign(row, { status: "ACCEPTED", fill: { outcome: "LOCKED" } });
    expect(await codesNow()).toEqual(["A02"]);
    Object.assign(row, { receiptNo: "300000000001", fill: { outcome: "FILLED", slot: 1 } });
    h.decls.fields = { TK_EB1: { value: "300000000001" } };
    expect(await codesNow()).toEqual([]);
    // Bộ sau thay mất cặp của bộ này → số không còn trong 1.63 → gợi ý lại A02.
    h.decls.fields = { TK_EA1: { value: "BOL" }, TK_EB1: { value: "300000000009" } };
    expect(await codesNow()).toEqual(["A02"]);
  });

  it("1.63 nhập tay: ALL + số → hết gợi ý; phân loại khác (BOL, mã thủ tục cũ A02) → vẫn gợi ý A02", async () => {
    const codesNow = async () => { const o = await getHysOverview(h.deps, declarant, D); return o.ok && o.value.suggestions.map((x) => x.code); };
    h.decls.fields = { TK_EA1: { value: "ALL – Tất cả hồ sơ" }, TK_EB1: { value: "123456789012" } };
    expect(await codesNow()).toEqual([]);
    h.decls.fields = { TK_EA1: { value: "BOL" }, TK_EB1: { value: "123456789012" } };
    expect(await codesNow()).toEqual(["A02"]);
    h.decls.fields = { TK_EA1: { value: "A02" }, TK_EB1: { value: "123456789012" } };
    expect(await codesNow()).toEqual(["A02"]);
  });

  it("attachmentSlots = các cặp 1.63 đang có số (mã chuẩn hóa)", async () => {
    const o0 = await getHysOverview(h.deps, declarant, D);
    expect(o0.ok && o0.value.attachmentSlots).toEqual([]);
    h.decls.fields = { TK_EA1: { value: "INV – Hóa đơn" }, TK_EB1: { value: "300000000001" }, TK_EA2: { value: "BOL" }, TK_EB3: { value: "300000000003" } };
    const o1 = await getHysOverview(h.deps, declarant, D);
    expect(o1.ok && o1.value.attachmentSlots).toEqual([
      { slot: 1, code: "INV", receipt: "300000000001" },
      { slot: 3, code: "", receipt: "300000000003" },
    ]);
  });

  it("lotEditable và supplementHint theo kết quả truyền", async () => {
    const o0 = await getHysOverview(h.deps, declarant, D);
    expect(o0.ok && [o0.value.lotEditable, o0.value.supplementHint]).toEqual([true, false]);
    seed(h, 1, "DECLARED");
    h.uow.data.results[0]!.channel = "YELLOW";
    const o1 = await getHysOverview(h.deps, declarant, D);
    expect(o1.ok && [o1.value.lotEditable, o1.value.supplementHint]).toEqual([false, true]);
  });

  it("hysValuesOf chuẩn hóa mã phân loại TK_EA*", () => {
    const p = h.decls.payloadNow();
    const v = hysValuesOf({ payload: { ...p, fields: { ...p.fields, TK_EA1: { value: "INV – Hóa đơn" }, TK_EB1: { value: "123" } } } });
    expect([v["TK_EA1"], v["TK_EB1"]]).toEqual(["INV", "123"]);
  });
});
