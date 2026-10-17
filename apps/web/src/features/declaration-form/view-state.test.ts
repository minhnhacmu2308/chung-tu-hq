import { LAYOUT_EDA, LAYOUT_IDA } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { fixtureFor, valuesAt } from "./fixtures";
import { blockHasData, parseView, toQuery } from "./view-state";

const q = (s: string) => new URLSearchParams(s);

describe("parseView / toQuery", () => {
  it("mặc định: nhập, nháp, tab Người khai, nhóm đầu tiên", () => {
    expect(parseView(q(""))).toEqual({ kind: "IDA", stage: "nhap", tab: "khai", section: "chung" });
  });
  it("đọc đủ tham số; giá trị lạ → mặc định; nhóm không có trong mẫu → nhóm đầu", () => {
    expect(parseView(q("loai=xuat&giai-doan=thong-quan&tab=hai-quan&nhom=hoa-don-tri-gia"))).toEqual({ kind: "EDA", stage: "thong-quan", tab: "hai-quan", section: "hoa-don-tri-gia" });
    expect(parseView(q("loai=abc&giai-doan=x&tab=y&nhom=khong-co"))).toEqual({ kind: "IDA", stage: "nhap", tab: "khai", section: "chung" });
    expect(parseView(q("nhom=hang"))).toMatchObject({ section: "hang" }); // nhóm 8 = danh sách hàng
  });
  it("toQuery ngược với parseView", () => {
    const v = { kind: "EDA", stage: "da-khai", tab: "nghiep-vu", section: "van-chuyen" } as const;
    expect(parseView(q(toQuery(v)))).toEqual(v);
  });
});

describe("blockHasData – tab Hải quan trả về không để trống trơn", () => {
  it("giai đoạn nháp: không khối Hải quan nào có dữ liệu (hiện câu 'Có sau khi …')", () => {
    for (const layout of [LAYOUT_IDA, LAYOUT_EDA]) {
      const v = valuesAt(fixtureFor(layout.kind), "nhap").header;
      expect(layout.customs.flatMap((s) => s.blocks).filter((b) => blockHasData(b, v))).toEqual([]);
    }
  });
  it("đã khai: khối đăng ký và thuế có dữ liệu; chưa thông quan nên khối thông quan chưa có", () => {
    const v = valuesAt(fixtureFor("IDA"), "da-khai").header;
    const byId = Object.fromEntries(LAYOUT_IDA.customs.flatMap((s) => s.blocks).map((b) => [b.id, blockHasData(b, v)]));
    expect(byId).toMatchObject({ "dang-ky": true, "sac-thue": true, "thong-quan": false });
  });
});
