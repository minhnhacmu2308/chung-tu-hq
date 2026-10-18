import { LAYOUT_EDA, LAYOUT_IDA, layoutFields } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { declarationValues, editableKeys, itemValues, mappedCodes, pendingEdits } from "./dossier-adapter";

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

describe("editableKeys / pendingEdits – chỉ sửa ô một–một đã có trên tờ khai, sửa được theo quy tắc", () => {
  const fields = [f("SO_HD", "INV-1"), f("PTVC", "1 – Đường hàng không"), f("MA_LH", "A11"), f("CANG_DO", "VNHPH – CANG HAI PHONG"), f("TONG_TG", "10")];
  it("không quyền / không phải nháp → không ô nào; ô bị khóa (MA_LH, TONG_TG) và ô ghép (cảng) không sửa", () => {
    expect(editableKeys("IDA", fields, false).size).toBe(0);
    const keys = editableKeys("IDA", fields, true);
    expect(Object.fromEntries(keys)).toEqual({ TK_IV3: "SO_HD", TK_MTC: "PTVC" });
  });
  it("chỉ gửi ô đã đổi, theo mã app; bỏ khoảng trắng thừa", () => {
    const original = declarationValues("IDA", fields);
    const keys = editableKeys("IDA", fields, true);
    expect(pendingEdits(original, { ...original, TK_IV3: " INV-2 ", TK_MTC: "1", VD_DST: "VNSGN" }, keys)).toEqual([{ code: "SO_HD", value: "INV-2" }]);
    expect(pendingEdits(original, { ...original, TK_MTC: "2" }, keys)).toEqual([{ code: "PTVC", value: "2" }]);
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
