import { LAYOUT_EDA, LAYOUT_IDA, isItemFieldKey, itemFieldClass, layoutFields } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import type { LineItem } from "@kb/contracts";
import { ITEM_LOCK, autoCheckInput, declarationLockOf, declarationValues, editableKeys, gtgtAutoCheck, itemValues, mappedCodes, pendingEdits, pendingItemEdits } from "./dossier-adapter";

const f = (code: string, value: string) => ({ code, value });

describe("declarationValues – tờ khai của hồ sơ (mã app) → ô form đầy đủ (tên trường VNACCS)", () => {
  it("IDA: ô một–một giữ nguyên; ô mã lấy phần mã trước dấu –", () => {
    const v = declarationValues("IDA", [f("MA_LH", "A11"), f("NNK_MST", "0101234567"), f("PTVC", "1 – Đường hàng không"), f("CQHQ", "02B1 – Chi cục HQ CK sân bay Nội Bài"), f("NGAY_DEN", "2026-10-20"), f("TONG_TG", "2111.04")]);
    expect(v).toMatchObject({ TK_ICB: "A11", TK_IMC: "0101234567", TK_MTC: "1", TK_CH: "02B1", VD_ARR: "2026-10-20", TK_IP4: "2111.04" });
  });
  it("ô ghép tách đúng như khi truyền FPT: cảng mã – tên, số kiện số + đơn vị, địa chỉ 4 dòng 35 ký tự, VBPQ, giấy phép", () => {
    const v = declarationValues("IDA", [
      f("CANG_DO", "VNHPH – CANG HAI PHONG"), f("SO_KIEN", "12 PK"), f("TRONG_LUONG", "133"),
      f("NXK_DC", "123 SAMSUNG-RO, YEONGTONG-GU, SUWON-SI, GYEONGGI-DO, KOREA 16677"), f("VBPQ", "MO, CU"), f("GP", "GP01 123/BYT; GP02 45"),
    ]);
    expect(v).toMatchObject({ VD_DST: "VNHPH", VD_DSN: "CANG HAI PHONG", VD_NO: "12", VD_NOT: "PK", VD_GW: "133", VD_GWT: "KGM", TK_OL1: "MO", TK_OL2: "CU", TK_SS1: "GP01", TK_SN1: "123/BYT", TK_SS2: "GP02", TK_SN2: "45" });
    for (const k of ["TK_EPA", "TK_EP2", "TK_EP3"]) expect((v[k] ?? "").length).toBeLessThanOrEqual(35);
    expect([v["TK_EPA"], v["TK_EP2"], v["TK_EP3"], v["TK_EP4"]].filter(Boolean).join(" ")).toBe("123 SAMSUNG-RO, YEONGTONG-GU, SUWON-SI, GYEONGGI-DO, KOREA 16677");
  });
  it("EDA: khóa VNACCS của mẫu 02; ngày đi lấy NGAY_DI (dữ liệu mẫu cũ ghi NGAY_DEN); container tách thành CON_C01…", () => {
    const v = declarationValues("EDA", [f("MA_LH", "B11"), f("NXK_MST", "0301"), f("SO_VD", "SGN123"), f("NGAY_DEN", "2026-11-02"), f("SO_CONT", "MSKU1, TGHU2")]);
    expect(v).toMatchObject({ TK_ECB: "B11", TK_EPC: "0301", TK_EKN: "SGN123", TK_SYM: "2026-11-02", CON_C01: "MSKU1", CON_C02: "TGHU2" });
  });
  it("giá trị giữ chỗ '—' / rỗng → ô trống", () => {
    expect(declarationValues("IDA", [f("SO_VD", "—"), f("SO_HD", "")])).not.toHaveProperty("VD_BL1");
  });
});

describe("itemValues – dòng hàng → ô HAG_* của form", () => {
  it("HS đã xác nhận (chưa có thì gợi ý), mô tả, lượng, đơn vị, đơn giá, trị giá, xuất xứ, thuế suất NK", () => {
    const [it0] = itemValues("IDA", [{ description: "Vòng bi", quantity: "100", unit: "PCE", unitPrice: "2.5", amount: "250", origin: "KR", hsSuggested: "84821000", hsConfirmed: "84829100", importDutyRate: "0" }]);
    expect(it0).toEqual({ HAG_CMD: "84829100", HAG_CMN: "Vòng bi", HAG_QN1: "100", HAG_QT1: "PCE", HAG_UPR: "2.5", HAG_BPR: "250", HAG_OR: "KR", HAG_TXA: "0" });
    expect(itemValues("IDA", [{ description: "X", quantity: "1", unit: "PCE", unitPrice: "1", amount: "1", origin: "VN", hsSuggested: "1234" }])[0]?.HAG_CMD).toBe("1234");
  });
});


describe("bảng chuyển mã khớp bố cục form", () => {
  it.each(["IDA", "EDA"] as const)("%s: mọi ô sinh ra có trên form đầy đủ (dòng hàng: ô HAG_*)", (kind) => {
    const layout = kind === "IDA" ? LAYOUT_IDA : LAYOUT_EDA;
    const keys = new Set(layoutFields(layout).map((x) => x.key));
    const sample = "AB12 – TEN DIA DIEM DAI 123 DUONG SO 5 PHUONG 7 QUAN 9 THANH PHO HO CHI MINH VIET NAM; CD34 99";
    const v = declarationValues(kind, mappedCodes(kind).map((code) => f(code, sample)));
    expect(Object.keys(v).filter((k) => !keys.has(k))).toEqual([]);
    const items = itemValues(kind, [{ description: "X", quantity: "1", unit: "PCE", unitPrice: "1", amount: "1", origin: "VN", importDutyRate: "5" }]);
    expect(Object.keys(items[0]!).filter((k) => !keys.has(k))).toEqual([]);
  });
});

describe("itemValues – tờ khai xuất", () => {
  it("không điền xuất xứ / thuế suất NK (mẫu 02 không có ô tương ứng)", () => {
    const [v] = itemValues("EDA", [{ description: "Áo #&VN", quantity: "1", unit: "PCE", unitPrice: "1", amount: "1", origin: "VN", importDutyRate: "0" }]);
    expect(v).not.toHaveProperty("HAG_OR");
    expect(v).not.toHaveProperty("HAG_TXA");
  });
});

describe("editableKeys / pendingEdits – sửa ô đã có trên tờ khai; ô ghép lưu lại đúng định dạng chỉ tiêu", () => {
  const fields = [
    f("SO_HD", "INV-1"), f("PTVC", "1 – Đường hàng không"), f("MA_LH", "A11"), f("TONG_TG", "10"),
    f("CANG_DO", "VNHPH – CANG HAI PHONG"), f("SO_KIEN", "12 PK"), f("TRONG_LUONG", "133"), f("NXK_DC", "123 SAMSUNG-RO, YEONGTONG-GU, SUWON-SI, GYEONGGI-DO, KOREA 16677"),
    f("VBPQ", "MO"), f("GP", "GP01 123/BYT"),
  ];
  const original = declarationValues("IDA", fields);
  const keys = editableKeys("IDA", fields, "FULL");
  it("khóa (không quyền, đã duyệt, đã thông quan) → không ô nào; chỉ tiêu khóa (MA_LH, TONG_TG) và đơn vị trọng lượng cố định KGM không sửa", () => {
    expect(editableKeys("IDA", fields, "LOCKED").size).toBe(0);
    expect(keys.get("TK_IV3")).toBe("SO_HD");
    expect(keys.get("VD_DST")).toBe("CANG_DO");
    expect(keys.get("VD_DSN")).toBe("CANG_DO");
    expect(keys.get("TK_EP4")).toBe("NXK_DC");
    expect(keys.get("TK_OL5")).toBe("VBPQ");
    expect(keys.get("TK_SN5")).toBe("GP");
    for (const k of ["TK_ICB", "TK_IP4", "VD_GWT"]) expect(keys.has(k)).toBe(false);
  });
  it("chỉ gửi chỉ tiêu đã đổi; bỏ khoảng trắng thừa; ô mã gửi phần mã", () => {
    expect(pendingEdits("IDA", original, original, keys)).toEqual([]);
    expect(pendingEdits("IDA", original, { ...original, TK_IV3: " INV-2 ", TK_MTC: "1" }, keys)).toEqual([{ code: "SO_HD", value: "INV-2" }]);
    expect(pendingEdits("IDA", original, { ...original, TK_MTC: "2" }, keys)).toEqual([{ code: "PTVC", value: "2" }]);
  });
  it("ô ghép: cảng 'mã – tên', số kiện 'số đơn vị', địa chỉ nối dòng, VBPQ nối phẩy, giấy phép 'mã số; …'", () => {
    const edits = pendingEdits("IDA", original, { ...original, VD_DST: "VNSGN", VD_DSN: "CANG SAI GON", VD_NO: "15", TK_EP2: "SUWON-SI, GYEONGGI-DO, KOREA 16678", TK_OL2: "CU", TK_SS2: "GP02", TK_SN2: "45" }, keys);
    expect(edits).toEqual(expect.arrayContaining([
      { code: "CANG_DO", value: "VNSGN – CANG SAI GON" },
      { code: "SO_KIEN", value: "15 PK" },
      { code: "VBPQ", value: "MO, CU" },
      { code: "GP", value: "GP01 123/BYT; GP02 45" },
    ]));
    expect(edits.find((e) => e.code === "NXK_DC")?.value).toBe("123 SAMSUNG-RO, YEONGTONG-GU, SUWON-SI, GYEONGGI-DO, KOREA 16678");
    expect(edits).toHaveLength(5);
  });
});

describe("itemValues / pendingItemEdits – ô dòng hàng chỉ có trên tờ khai", () => {
  const items = [
    { id: "li1", lineNo: 1, description: "Vòng bi", quantity: "10", unit: "PCE", unitPrice: "2", amount: "20", origin: "KR", hsConfirmed: "84821000", vatRate: "8", policyNote: "AKFTA" },
    { id: "li2", lineNo: 2, description: "Trục", quantity: "5", unit: "KGM", unitPrice: "4", amount: "20", origin: "CN", hsConfirmed: "84831000", vatRate: "10" },
  ];
  it("hiện giá trị tự điền khi truyền; ô người khai đã nhập (theo id dòng) đè lên", () => {
    const rows = itemValues("IDA", items, { currency: "USD", fields: [f("HANG.li2.HAG_ORS", "B30"), f("HANG.li2.HAG_RE", "XN210")] });
    expect(rows[0]).toMatchObject({ HAG_QN2: "10", HAG_QT2: "PCE", HAG_UPC: "USD", HAG_ORS: "B06" });
    expect(rows[0]).not.toHaveProperty("HAG_TX5");
    expect(rows[1]).toMatchObject({ HAG_ORS: "B30", HAG_RE: "XN210", HAG_TX5: "VB901" });
  });
  it("chỉ lưu ô người khai nhập đã đổi, theo id dòng; ô số liệu chứng từ bỏ qua", () => {
    const original = itemValues("IDA", items, { currency: "USD" });
    const draft = original.map((r, i) => (i === 1 ? { ...r, HAG_RE: " XN210 ", HAG_CMN: "đổi tên" } : r));
    expect(pendingItemEdits("IDA", ["li1", "li2"], original, draft)).toEqual([{ code: "HANG.li2.HAG_RE", value: "XN210" }]);
  });
  it("EDA: ô Xuất xứ của app lấy từ dòng hàng", () => {
    expect(itemValues("EDA", items)[1]?.["APP_XUAT_XU"]).toBe("CN");
  });
});

describe("declarationLockOf – ô nào khóa và vì sao", () => {
  it("mode LOCKED: ô người khai bị khóa", () => {
    expect(declarationLockOf("IDA", "LOCKED", {}, new Map(), "vi")("TK_IMC")).not.toBeNull();
  });
  it("mode FULL: ô nằm trong editable → null", () => {
    expect(declarationLockOf("IDA", "FULL", {}, new Map([["TK_IMC", "NNK_MST"]]), "vi")("TK_IMC")).toBeNull();
  });
  it("ô dòng hàng lớp DOC → ITEM_LOCK.DOC", () => {
    const key = "HAG_CMN";
    expect(isItemFieldKey("IDA", key) && itemFieldClass("IDA", key)).toBe("DOC");
    expect(declarationLockOf("IDA", "FULL", {}, new Map(), "vi")(key)).toBe(ITEM_LOCK.vi.DOC);
  });
});

describe("pendingItemEdits – chuẩn hóa mã thuế khác ở khóa lệch khi lưu", () => {
  const items = [{ id: "li1", lineNo: 1, description: "Vòng bi", quantity: "10", unit: "PCE", unitPrice: "2", amount: "20", origin: "KR", hsConfirmed: "84821000", vatRate: "10" }];
  it("save_normalizes_legacy_slot: mã GTGT cũ ở HAG_TX1 được ghi lại về HAG_TX5 cùng lần lưu khi người khai sửa ô thuế khác; người khai thắng nếu cùng khóa", () => {
    const fields = [f("HANG.li1.HAG_TX1", "VB901"), f("HANG.li1.HAG_TR1", "VK110")];
    const original = itemValues("IDA", items, { currency: "USD", fields });
    expect(original[0]).toMatchObject({ HAG_TX5: "VB901", HAG_TR5: "VK110" });
    const draft = [{ ...original[0]!, HAG_TX3: "TB020" }];
    const own = [{ HAG_TX1: "VB901", HAG_TR1: "VK110" }];
    const edits = pendingItemEdits("IDA", ["li1"], original, draft, own);
    expect(edits).toEqual(expect.arrayContaining([
      { code: "HANG.li1.HAG_TX3", value: "TB020" },
      { code: "HANG.li1.HAG_TX1", value: "" }, { code: "HANG.li1.HAG_TR1", value: "" },
      { code: "HANG.li1.HAG_TX5", value: "VB901" }, { code: "HANG.li1.HAG_TR5", value: "VK110" },
    ]));
    // người khai sửa luôn ô GTGT: giá trị của người khai là lệnh cuối, không bị ghi đè bởi bản chuẩn hóa
    const edited = pendingItemEdits("IDA", ["li1"], original, [{ ...original[0]!, HAG_TX5: "VB902" }], own);
    expect(edited.filter((e) => e.code === "HANG.li1.HAG_TX5")).toEqual([{ code: "HANG.li1.HAG_TX5", value: "VB902" }]);
    // không đụng khối thuế khác → không thêm lệnh chuẩn hóa
    expect(pendingItemEdits("IDA", ["li1"], original, [{ ...original[0]!, HAG_RE: "XN210" }], own)).toEqual([{ code: "HANG.li1.HAG_RE", value: "XN210" }]);
  });
});

describe("pendingItemEdits – xác nhận mã tự điền", () => {
  const items = [{ id: "li1", lineNo: 1, description: "Vòng bi", quantity: "10", unit: "PCE", unitPrice: "2", amount: "20", origin: "KR", hsConfirmed: "84821000", vatRate: "10" }];
  it("confirm_auto_vat_saves_as_user_value: người khai chọn đúng mã tự điền khi có cảnh báo → vẫn lưu HAG_TX5 (field_audit), không lưu gì khác", () => {
    const original = itemValues("IDA", items, { currency: "USD" });
    expect(original[0]).toMatchObject({ HAG_TX5: "VB901" });
    expect(pendingItemEdits("IDA", ["li1"], original, original, [{}], [["HAG_TX5"]])).toEqual([{ code: "HANG.li1.HAG_TX5", value: "VB901" }]);
    expect(pendingItemEdits("IDA", ["li1"], original, original, [{}], [[]])).toEqual([]);
  });
});

describe("gtgtAutoCheck – cảnh báo GTGT tự điền + nút Xác nhận (form đầy đủ và panel bản in)", () => {
  const it0 = { id: "li1", lineNo: 1, description: "Vòng bi", quantity: "10", unit: "PCE", unitPrice: "2", amount: "20", origin: "KR", hsConfirmed: "84821000", vatRate: "10" } as unknown as LineItem;
  const auto = { HAG_TX5: "VB901" };
  const WARN = [{ key: "HAG_TX5", reason: "VAT_FROM_RATE" }];
  it("chưa xác nhận → cảnh báo; nút Xác nhận ghi nhận HAG_TX5 (thêm HAG_TR5 khi có)", () => {
    expect(gtgtAutoCheck("IDA", it0, {}, auto, auto, [])).toEqual({ checks: WARN, confirmKeys: ["HAG_TX5"] });
    expect(gtgtAutoCheck("IDA", it0, {}, auto, { HAG_TX5: "V", HAG_TR5: "VK010" }, []).confirmKeys).toEqual(["HAG_TX5", "HAG_TR5"]);
  });
  it("xác nhận với ô có mã → hết cảnh báo, lưu như giá trị người khai (field_audit qua pendingItemEdits)", () => {
    const r = gtgtAutoCheck("IDA", it0, {}, auto, auto, ["HAG_TX5"]);
    expect(r.checks).toEqual([]);
    const original = itemValues("IDA", [it0], { currency: "USD" });
    expect(pendingItemEdits("IDA", ["li1"], original, original, [{}], [r.confirmKeys])).toEqual([{ code: "HANG.li1.HAG_TX5", value: "VB901" }]);
  });
  it("ô GTGT trống (Combobox chọn lại cùng mã → null / người khai xóa): không bao giờ thành đã xác nhận, cảnh báo còn, không có nút", () => {
    const r = gtgtAutoCheck("IDA", it0, {}, auto, { HAG_TX5: "" }, ["HAG_TX5"]);
    expect(r).toEqual({ checks: WARN, confirmKeys: [] });
  });
  it("đổi sang mã khác / đã lưu mã GTGT riêng / EDA → không cảnh báo", () => {
    expect(gtgtAutoCheck("IDA", it0, {}, auto, { HAG_TX5: "VB205" }, []).checks).toEqual([]);
    expect(gtgtAutoCheck("IDA", it0, { HAG_TX1: "VB901" }, auto, auto, []).checks).toEqual([]);
    expect(gtgtAutoCheck("EDA", it0, {}, auto, auto, [])).toEqual({ checks: [], confirmKeys: [] });
  });
  it("taxNeedsReview (thuế suất chờ tra lại) → mã GTGT coi là chưa chắc như backend: cảnh báo VAT_UNCERTAIN", () => {
    const item = { ...it0, vatCode: "VB901", vatCertain: true, taxNeedsReview: true } as unknown as LineItem;
    expect(autoCheckInput(item).vatCertain).toBe(false);
    expect(gtgtAutoCheck("IDA", item, {}, auto, auto, []).checks).toEqual([{ key: "HAG_TX5", reason: "VAT_UNCERTAIN" }]);
    expect(gtgtAutoCheck("IDA", { ...item, taxNeedsReview: false } as LineItem, {}, auto, auto, []).checks).toEqual([]);
  });
});
