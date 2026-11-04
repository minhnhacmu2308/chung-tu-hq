import { describe, expect, it } from "vitest";
import { requiredGaps } from "./required.js";
import { fieldSequences, sequenceBlocker, sequenceHoles } from "./sequence.js";

// Tờ khai xuất đường biển container (2.6 = 2): khối Container áp dụng.
const base = { TK_MTC: "2" };

describe("ô nhập theo thứ tự (2.59, 2.60)", () => {
  it("EDA có 2 dãy: 2.59 mã 1–5, 2.60 container 1–50; IDA không có", () => {
    const s = fieldSequences("EDA");
    expect(s.map((x) => [x.no, x.fields.length])).toEqual([["2.59", 5], ["2.60", 50]]);
    expect(s[1]!.fields.slice(0, 2).map((f) => f.key)).toEqual(["CON_C01", "CON_C02"]);
    expect(fieldSequences("IDA")).toEqual([]);
  });

  it("ô chưa tới lượt: ô trước trống → khóa, trả ô trước; ô đầu và ô đã có giá trị không khóa", () => {
    expect(sequenceBlocker("EDA", "CON_VC1", base)).toBeNull();
    expect(sequenceBlocker("EDA", "CON_VC2", base)).toMatchObject({ field: { key: "CON_VC1" }, position: 1 });
    expect(sequenceBlocker("EDA", "CON_VC2", { ...base, CON_VC1: "03CCS01" })).toBeNull();
    expect(sequenceBlocker("EDA", "CON_C03", { ...base, CON_C01: "SITU1" })).toMatchObject({ field: { key: "CON_C02" }, position: 2 });
    expect(sequenceBlocker("EDA", "CON_C03", { ...base, CON_C03: "X" })).toBeNull();
    expect(sequenceBlocker("EDA", "TK_ST", base)).toBeNull();
  });

  it("lỗ giữa dãy: ô trống nằm trước ô đã nhập", () => {
    expect(sequenceHoles("EDA", { ...base, CON_C01: "A", CON_C03: "C" }).map((h) => h.field.key)).toEqual(["CON_C02"]);
    expect(sequenceHoles("EDA", { ...base, CON_C01: "A", CON_C02: "B" })).toEqual([]);
  });

  it("requiredGaps: 2.59 thiếu mã 1 kể cả khi đã có tên / địa chỉ; mã 2 có mà mã 1 trống → báo ô 1; container bỏ trống giữa → báo", () => {
    const keys = (v: Record<string, string>) => requiredGaps("EDA", v, []).filter((g) => g.no === "2.59" || g.no === "2.60").map((g) => g.key);
    // Số container 1 bắt buộc khi hàng đóng container (có từ trước).
    const C1 = { CON_C01: "SITU2246781" };
    expect(keys({ ...base, ...C1, CON_VN: "Kho A", CON_VA: "KCN Đình Vũ" })).toEqual(["CON_VC1"]);
    expect(keys({ ...base, ...C1, CON_VC1: "03CCS01" })).toEqual([]);
    expect(keys({ ...base, ...C1, CON_VC2: "03CCS02" })).toEqual(["CON_VC1"]);
    expect(keys({ ...base, CON_VC1: "03CCS01", CON_C01: "A", CON_C03: "C" })).toEqual(["CON_C02"]);
    expect(requiredGaps("EDA", { ...base, CON_VC1: "03CCS01", CON_C01: "A", CON_C03: "C" }, []).find((g) => g.key === "CON_C02")?.label).toMatch(/ô 2 còn trống/);
  });

  it("không đóng container (2.6 = 1 hàng không): khối Container không áp dụng → không báo", () => {
    expect(requiredGaps("EDA", { TK_MTC: "1", CON_C02: "B" }, []).filter((g) => g.no === "2.59" || g.no === "2.60")).toEqual([]);
  });
});
