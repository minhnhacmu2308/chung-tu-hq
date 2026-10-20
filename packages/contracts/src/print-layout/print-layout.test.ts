import { describe, expect, it } from "vitest";
import { layoutFields, layoutFor } from "../declaration-layout/index.js";
import { expandPrintRow, otherFieldKeys, printKeys, printLayoutFor } from "./index.js";

const range = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i + 1));
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Chỉ tiêu người khai nhập không có chỗ trên mẫu in IDA (đối chiếu MAUIN_TOKHAI_NHAPKHAU.pdf) → khối "Chỉ tiêu khác". */
const OTHER_IDA = {
  decl: [
    "APP_NHOM_LH", // ô lọc mã loại hình của phần mềm
    "TK_ICD", // ngày khai báo dự kiến – mẫu in chỉ có ngày đăng ký (Hải quan)
    "APP_DD_PT", "APP_HAWB_CO", // định danh / có HAWB – ô riêng của phần mềm
    ...range(5, (i) => [`APP_NGAY_VD${i}`, `APP_HAWB${i}`]).flat(), // ngày vận đơn, số HAWB – mẫu chỉ in số vận đơn
    "APP_HDGC_SO", "APP_HDGC_NGAY", // hợp đồng gia công – phần mềm
    "APP_HD_SO", "APP_HD_NGAY", "APP_HD_HET_HAN", // hợp đồng nội bộ – phần mềm
    ...range(5, (i) => `APP_PB${i}`), // phân bổ phí cho mọi dòng – phần mềm
    "TK_BRC", "TK_BYA", "TK_BCM", "TK_BCN", // hạn mức ngân hàng trả thuế thay – mẫu không in
    "TK_SBC", "TK_RYA", "TK_SCM", "TK_SCN", // bảo lãnh – mẫu không in
  ],
  item: [
    "HAG_MAHANG", // mã hàng nội bộ
    "APP_SL_THUC_TE", "APP_FOC", // phần mềm
    "HAG_TXA", "HAG_TXB", "HAG_TXC", "HAG_TXD", // thuế suất / mức thuế tuyệt đối nhập tay – mẫu in thuế suất Hải quan xác định (HAG_B42/B43)
    "APP_TGTT_TAY", // phần mềm
    "HAG_DPR", "HAG_BPC", // trị giá tính thuế phân bổ tay – mẫu in trị giá tính thuế Hải quan (S)/(M)
    "HAG_REG", // số tiền giảm thuế NK khai – mẫu in số tiền miễn giảm Hải quan (HAG_B49)
    ...range(5, (i) => `HAG_TG${i}`), // số tiền giảm thu khác khai – mẫu in HAG_LB{n}
  ],
};

describe.each([{ kind: "IDA" as const, other: OTHER_IDA }])("bản in $kind", ({ kind, other }) => {
  const p = printLayoutFor(kind);
  const keys = printKeys(p);
  it("mọi khóa trên bản in có trong bố cục declaration-layout", () => {
    const all = new Set(layoutFields(layoutFor(kind)).map((f) => f.key));
    expect([...keys.decl, ...keys.item].filter((k) => !all.has(k))).toEqual([]);
  });
  it("không trùng khóa trên bản in", () => {
    expect(keys.decl.filter((k, i) => keys.decl.indexOf(k) !== i)).toEqual([]);
    expect(keys.item.filter((k, i) => keys.item.indexOf(k) !== i)).toEqual([]);
  });
  it("chỉ tiêu khác đúng danh sách đã duyệt", () => {
    expect(otherFieldKeys(kind)).toEqual(other);
  });
});

describe("bản in IDA", () => {
  const p = printLayoutFor("IDA");
  it("ô chính của mẫu có mặt", () => {
    const { decl, item } = printKeys(p);
    expect(decl).toEqual(expect.arrayContaining(["TK_ICN", "TK_B12", "TK_B13", "TK_A86", "THUE_B02", ...range(6, (i) => `THUE_KG${i}`), ...range(10, (i) => `CTHQ_D${pad2(i)}`)]));
    expect(item).toEqual(expect.arrayContaining(["HAG_CMD", "HAG_CMN", "HAG_QN1", "HAG_QN2", "HAG_BPR", "HAG_UPR", "HAG_ORS", ...range(5, (i) => `HAG_TX${i}`)]));
  });
  it("hai trang chung, một dòng hàng mỗi trang", () => {
    expect(p.kind).toBe("IDA");
    expect(p.pages).toHaveLength(2);
    expect(p.itemsPerPage).toBe(1);
  });
});

describe("expandPrintRow", () => {
  it("thay {n}/{nn}", () => {
    expect(expandPrintRow({ kind: "repeat", count: 3, cells: [{ key: "VD_BL{n}", label: "Số vận đơn" }] }).map((r) => r.map((c) => c.key))).toEqual([["VD_BL1"], ["VD_BL2"], ["VD_BL3"]]);
    expect(expandPrintRow({ kind: "repeat", count: 2, cells: [{ key: "CTHQ_D{nn}", label: "Ngày" }, { key: "CTHQ_T{nn}", label: "Tên" }] })[0]!.map((c) => c.key)).toEqual(["CTHQ_D01", "CTHQ_T01"]);
  });
  it("dòng thường giữ nguyên", () => {
    const row = [{ key: "TK_ICN", label: "Số tờ khai" }];
    expect(expandPrintRow(row)).toEqual([row]);
  });
});
