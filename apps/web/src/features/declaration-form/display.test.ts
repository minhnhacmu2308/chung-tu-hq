import { DECLARATION_CONDITIONS, type LayoutGroup, type LayoutRepeat } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { codeLabel, DATE_WIDTH, displayValue, fieldTitle, fieldWidthClass, groupGuideReason, visibleRows } from "./display";
import { conditionContext } from "./form-state";

describe("codeLabel", () => {
  it("tra tên theo bảng mã có trong repo; bảng chưa có dữ liệu hoặc mã lạ → undefined", () => {
    expect(codeLabel("TRANSPORT_MODE", "1")).toMatch(/không/i);
    expect(codeLabel("COUNTRY", "SG")).toBeTruthy();
    expect(codeLabel("A202", "06B1A04")).toBeUndefined();
    expect(codeLabel("COUNTRY", "ZZ")).toBeUndefined();
    expect(codeLabel(undefined, "SG")).toBeUndefined();
  });
});

describe("displayValue", () => {
  it("ngày YYYY-MM-DD → dd/mm/yyyy; số có phân tách hàng nghìn, giữ phần lẻ; giá trị Hải quan dạng mã → kèm nghĩa", () => {
    expect(displayValue({ key: "TK_A09", input: "date" }, "2026-10-08")).toBe("08/10/2026");
    expect(displayValue({ key: "TK_A86", input: "number" }, "54464832")).toBe("54.464.832");
    expect(displayValue({ key: "TK_IP4", input: "number" }, "2111.04")).toBe("2.111,04");
    expect(displayValue({ key: "TK_LUONG", input: "code" }, "2")).toBe("2 · Luồng vàng");
    expect(displayValue({ key: "TK_THONGQUAN", input: "code" }, "1")).toBe("1 · Đã thông quan");
    expect(displayValue({ key: "TK_TRANGTHAI", input: "code" }, "C")).toMatch(/^C · Khai chính thức/);
    expect(displayValue({ key: "TK_A06", input: "code" }, "3")).toMatch(/^3 · Luồng đỏ/);
    expect(displayValue({ key: "TK_IMN", input: "text" }, "")).toBe("");
  });
});

describe("visibleRows", () => {
  const rep: LayoutRepeat = { kind: "repeat", label: "Vận đơn", count: 5, fields: [{ kind: "field", key: "VD_BL{n}", label: "Số vận đơn", input: "text" }] };
  it("người khai: các dòng có dữ liệu + dòng thêm (ít nhất 1 trống), không quá count", () => {
    expect(visibleRows(rep, { VD_BL1: "A", VD_BL2: "B" }, 0, false).map((r) => r[0]!.key)).toEqual(["VD_BL1", "VD_BL2", "VD_BL3"]);
    expect(visibleRows(rep, { VD_BL1: "A", VD_BL2: "B" }, 1, false)).toHaveLength(4);
    expect(visibleRows(rep, {}, 0, false)).toHaveLength(1);
    expect(visibleRows(rep, { VD_BL5: "E" }, 3, false)).toHaveLength(5);
  });
  it("chỉ đọc (Hải quan): chỉ dòng có dữ liệu", () => {
    expect(visibleRows(rep, { VD_BL3: "C" }, 0, true).map((r) => r[0]!.key)).toEqual(["VD_BL3"]);
    expect(visibleRows(rep, {}, 0, true)).toEqual([]);
  });
});

describe("fieldTitle", () => {
  it("số chỉ tiêu trước tên khi có", () => {
    expect(fieldTitle("1.44", "Tổng trị giá hóa đơn")).toBe("1.44 · Tổng trị giá hóa đơn");
    expect(fieldTitle(undefined, "Ngày vận đơn")).toBe("Ngày vận đơn");
  });
});

describe("displayValue – ô lựa chọn", () => {
  const opts = [{ value: "BIEN", label: "Đường biển" }, { value: "HANG_KHONG", label: "Hàng không" }];
  it("giá trị chữ → nhãn; mã số → 'mã · nhãn'; không có trong danh sách → giữ nguyên", () => {
    expect(displayValue({ key: "APP_DD_PT", input: "choice", options: opts }, "HANG_KHONG")).toBe("Hàng không");
    expect(displayValue({ key: "TRANG_THAI", input: "choice", options: [{ value: "15", label: "Hải quan đã duyệt" }] }, "15")).toBe("15 · Hải quan đã duyệt");
    expect(displayValue({ key: "APP_DD_PT", input: "choice", options: opts }, "X")).toBe("X");
  });
});

describe("groupGuideReason – 'Có vì' của nhóm và ô con nằm trong hướng dẫn ⓘ của nhóm", () => {
  const g: LayoutGroup = { kind: "group", label: "Phương tiện vận chuyển", no: "1.31", fields: [
    { kind: "field", key: "VD_VSC", label: "Hô hiệu (call sign)", input: "text", condition: "BY_WATER" },
    { kind: "field", key: "VD_VSN", label: "Tên phương tiện / chuyến", input: "text" },
  ] };
  it("ô con theo tình huống đang áp dụng → tên ô + lý do; không áp dụng → không có", () => {
    expect(groupGuideReason(g, conditionContext("IDA", { TK_MTC: "2" }))).toBe(`Hô hiệu (call sign) – Có vì: ${DECLARATION_CONDITIONS.BY_WATER.label}`);
    expect(groupGuideReason(g, conditionContext("IDA", { TK_MTC: "1" }))).toBeUndefined();
  });
  it("nhóm có điều kiện → lý do của nhóm đứng đầu", () => {
    const air = conditionContext("IDA", { TK_MTC: "2", APP_DD_PT: "HANG_KHONG" });
    expect(groupGuideReason({ ...g, condition: "AIR_IDENT" }, air)?.startsWith(`Có vì: ${DECLARATION_CONDITIONS.AIR_IDENT.label} · Hô hiệu`)).toBe(true);
  });
});

describe("fieldWidthClass – ô ngày cùng một bề rộng trên toàn form", () => {
  it("ô ngày luôn DATE_WIDTH dù khai báo width nào; ô khác theo width (mặc định sm)", () => {
    expect(fieldWidthClass({ input: "date" })).toBe(DATE_WIDTH);
    expect(fieldWidthClass({ input: "date", width: "md" })).toBe(DATE_WIDTH);
    expect(fieldWidthClass({ input: "text", width: "md" })).toBe("w-64");
    expect(fieldWidthClass({ input: "text" })).toBe("w-40");
  });
});
