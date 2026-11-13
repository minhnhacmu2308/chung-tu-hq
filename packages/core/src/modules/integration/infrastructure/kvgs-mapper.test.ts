import { describe, expect, it } from "vitest";
import { mapKvgsResponse } from "./kvgs-mapper.js";

const NOW = new Date("2026-03-01T03:00:00.000Z");
const camel: Record<string, unknown> = {
  regionOffice: "Chi cục Hải quan khu vực II", customsOffice: "Hải quan cửa khẩu cảng Sài Gòn khu vực 1", supervisionOffice: "02CI - 02CIS01: Kho A",
  sealRequired: true, companyName: "CONG TY AN PHAT", taxCode: "0316789012", declarationNo: "108007708100", declarationStatus: "Thông quan",
  declarationDate: "27/02/2026", typeName: "Nhập kinh doanh", channel: "Xanh", cargoControlNo: "QL-001", barcode: "*108007708100*",
  containers: [{ containerNo: "FBIU5802429", sealNo: "S1", customsSealNo: "", barcode: "FBIU5802429|S1" }],
  cargo: { quantity: "12.5", quantityUnit: "CTN", grossWeight: "340.250", weightUnit: "KGM" }, exportedAt: "2026-03-01T02:00:00Z",
};
const upper = {
  REGION_OFFICE: camel["regionOffice"], CUSTOMS_OFFICE: camel["customsOffice"], SUPERVISION_OFFICE: camel["supervisionOffice"], SEAL_REQUIRED: "1",
  COMPANY_NAME: camel["companyName"], TAX_CODE: camel["taxCode"], DECLARATION_NO: camel["declarationNo"], DECLARATION_STATUS: camel["declarationStatus"],
  DECLARATION_DATE: camel["declarationDate"], TYPE_NAME: camel["typeName"], CHANNEL: camel["channel"], CARGO_CONTROL_NO: camel["cargoControlNo"], BARCODE: camel["barcode"],
  CONTAINERS: [{ CONTAINER_NO: "FBIU5802429", SEAL_NO: "S1", CUSTOMS_SEAL_NO: "", BARCODE: "FBIU5802429|S1" }],
  CARGO: { QUANTITY: "12.5", QUANTITY_UNIT: "CTN", GROSS_WEIGHT: "340.250", WEIGHT_UNIT: "KGM" }, EXPORTED_AT: "2026-03-01T02:00:00Z",
};

describe("mapKvgsResponse", () => {
  it("key camelCase và HOA cho cùng một KvgsSheet (ngày dd/MM/yyyy → YYYY-MM-DD)", () => {
    const a = mapKvgsResponse(camel, "CONTAINER", NOW);
    const b = mapKvgsResponse(upper, "CONTAINER", NOW);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value).toEqual(b.value);
      expect(a.value.declarationDate).toBe("2026-02-27");
      expect(a.value.sealRequired).toBe(true);
      expect(a.value.containers).toEqual([{ containerNo: "FBIU5802429", sealNo: "S1", customsSealNo: null, barcode: "FBIU5802429|S1" }]);
      expect(a.value.cargo).toBeNull();
    }
  });
  it("hàng lẻ: số lượng/trọng lượng giữ chuỗi thập phân, không có container", () => {
    const r = mapKvgsResponse(camel, "CARGO", NOW);
    expect(r.ok && r.value.cargo).toEqual({ quantity: "12.5", quantityUnit: "CTN", grossWeight: "340.250", weightUnit: "KGM" });
    expect(r.ok && r.value.containers).toEqual([]);
  });
  it("thiếu số quản lý hàng hóa hoặc số tờ khai → KVGS_RESPONSE_INCOMPLETE", () => {
    for (const drop of ["cargoControlNo", "declarationNo"]) {
      const rest = { ...camel };
      delete rest[drop];
      const r = mapKvgsResponse(rest, "CONTAINER", NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.reason).toBe("KVGS_RESPONSE_INCOMPLETE");
    }
  });
  it("hàng container mà containers rỗng → KVGS_RESPONSE_INCOMPLETE; hàng lẻ không cần container", () => {
    const r = mapKvgsResponse({ ...camel, containers: [] }, "CONTAINER", NOW);
    expect(!r.ok && r.error.reason).toBe("KVGS_RESPONSE_INCOMPLETE");
    expect(mapKvgsResponse({ ...camel, containers: [] }, "CARGO", NOW).ok).toBe(true);
  });
  it("hàng lẻ thiếu số lượng → incomplete", () => {
    const r = mapKvgsResponse({ ...camel, cargo: {} }, "CARGO", NOW);
    expect(!r.ok && r.error.reason).toBe("KVGS_RESPONSE_INCOMPLETE");
  });
  it("không phải object → incomplete; thiếu giờ kết xuất → dùng `now`", () => {
    expect(mapKvgsResponse(null, "CARGO", NOW).ok).toBe(false);
    const r = mapKvgsResponse({ ...camel, exportedAt: undefined }, "CARGO", NOW);
    expect(r.ok && r.value.exportedAt).toBe(NOW.toISOString());
  });
  it("phản hồi KVGSRes của apps/fpt-mock (key .NET kiểu Việt) cũng map được cho cả hai mẫu", () => {
    const mock = {
      reF_ID: "R", tranG_THAI: "12", tK_SOTK: "307072510200", tK_NGAYDK: "14/01/2025", mA_DV: "0106502680", teN_DV: "CONG TY MO PHONG", chiCucKhuVuc: "CCKV", haiQuanCuaKhau: "HQCK", chiCucGiamSat: "CCGS",
      phaiNiemPhong: true, tK_TRANGTHAI: "Thông quan", teN_LH: "Nhập kinh doanh", tK_LUONG: "Xanh", sO_QUAN_LY: "QL1", mA_VACH: "*307072510200*", ngaY_KET_XUAT: "2026-03-01T02:00:00.000Z",
      danH_SACH_CONT: [{ coN_SO: "FBIU5802429", seL_SO: "SEAL0001", seL_HQ: "", mA_VACH: "b1" }], hanG_LE: { sO_LUONG: "10", sO_LUONG_DVT: "CTN", tronG_LUONG: "125.500", tronG_LUONG_DVT: "KGM" },
    };
    const c = mapKvgsResponse(mock, "CONTAINER", NOW);
    expect(c.ok && c.value).toMatchObject({ cargoControlNo: "QL1", declarationDate: "2025-01-14", sealRequired: true, containers: [{ containerNo: "FBIU5802429", customsSealNo: null, barcode: "b1" }] });
    const l = mapKvgsResponse(mock, "CARGO", NOW);
    expect(l.ok && l.value).toMatchObject({ barcode: "*307072510200*", cargo: { quantity: "10", weightUnit: "KGM" } });
  });
});
