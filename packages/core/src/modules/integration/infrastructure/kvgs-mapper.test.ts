import { describe, expect, it } from "vitest";
import { mapKvgsResponse } from "./kvgs-mapper.js";

const NOW = new Date("2026-11-13T05:00:00.000Z");
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAIAAAUAAYRcDQAAAAAASUVORK5CYII=";

/** Mẫu hàng container – đặc tả API-KVGS §3 (HTTP 200). */
const containerSample = () => ({
  errorList: [],
  serviceMessage: {
    ghi_Chu: null, ngayTau: null, maPTVC: null, soDinhDanh: "101126000001", maDDGS: "02CIS01", tenDDGS: "Địa điểm giám sát mẫu", isContainer: 1,
    dvT_So_Luong_Hang: "PK", dvT_Tong_Trong_Luong_Hang: "KGM", so_Luong_Hang: 120, tong_Trong_Luong_Hang: 12450.5,
    tenChiCucHaiQuanGS: "Chi cục Hải quan giám sát mẫu", tenCucHaiQuan: "Cục Hải quan mẫu", tenChiCucHaiQuan: "Chi cục Hải quan đăng ký mẫu",
    tenDonViXNK: "Công ty Xuất nhập khẩu Mẫu", maSoThue: "0312345678", soToKhai: "106123456780", ngayToKhai: "10/11/2026", loaiHinh: "A11",
    tenLoaiHinh: "Nhập kinh doanh tiêu dùng", maTrangThaiToKhai: null, trangThaiToKhai: "Thông quan", luongToKhai: "Xanh", thongBaoLoi: null,
    thoiGianLayDuLieu: "13/11/2026 09:30:00",
    bangKeMaVachContainer: [{ soContainer: "MSCU1234566", soSeal: "SL001234", soSealHQ: "HQ005678", barcodeImage: PNG }] as Record<string, unknown>[],
  } as Record<string, unknown>,
});
/** Mẫu hàng lẻ – đặc tả API-KVGS §4. */
const cargoSample = () => {
  const s = containerSample();
  Object.assign(s.serviceMessage, { soDinhDanh: "111126000002", isContainer: 0, so_Luong_Hang: 25, tong_Trong_Luong_Hang: 680.5, soToKhai: "106123456790", ngayToKhai: "11/11/2026", thoiGianLayDuLieu: "13/11/2026 09:35:00", bangKeMaVachContainer: [] });
  return s;
};

describe("mapKvgsResponse (đặc tả API-KVGS)", () => {
  it("mẫu container → KvgsSheet đúng từng trường (ngày → YYYY-MM-DD, giờ VN → UTC, số → chuỗi thập phân)", () => {
    const r = mapKvgsResponse(containerSample(), NOW);
    expect(r).toEqual({
      state: "ACCEPTED",
      sheet: {
        kind: "CONTAINER", regionOffice: "Cục Hải quan mẫu", customsOffice: "Chi cục Hải quan đăng ký mẫu",
        supervisionOffice: "Chi cục Hải quan giám sát mẫu - 02CIS01: Địa điểm giám sát mẫu", sealRequired: true,
        companyName: "Công ty Xuất nhập khẩu Mẫu", taxCode: "0312345678", declarationNo: "106123456780", declarationStatus: "Thông quan",
        declarationDate: "2026-11-10", declarationDateTo: null, typeName: "Nhập kinh doanh tiêu dùng", channel: "Xanh", cargoControlNo: "101126000001",
        barcode: null,
        containers: [{ containerNo: "MSCU1234566", sealNo: "SL001234", customsSealNo: "HQ005678", barcodeImage: PNG }],
        cargo: { quantity: "120", quantityUnit: "PK", grossWeight: "12450.5", weightUnit: "KGM" },
        exportedAt: "2026-11-13T02:30:00.000Z",
      },
    });
  });
  it("mẫu hàng lẻ → CARGO, barcode = số tờ khai (Code128), không container, không niêm phong", () => {
    const r = mapKvgsResponse(cargoSample(), NOW);
    expect(r.state).toBe("ACCEPTED");
    if (r.state !== "ACCEPTED") return;
    expect(r.sheet).toMatchObject({ kind: "CARGO", barcode: "106123456790", containers: [], sealRequired: false, cargoControlNo: "111126000002", declarationDate: "2026-11-11", exportedAt: "2026-11-13T02:35:00.000Z" });
    expect(r.sheet.cargo).toEqual({ quantity: "25", quantityUnit: "PK", grossWeight: "680.5", weightUnit: "KGM" });
  });
  it("API quyết định loại hàng (isContainer), không theo phương thức vận chuyển", () => {
    const s = containerSample();
    s.serviceMessage["isContainer"] = 0;
    s.serviceMessage["bangKeMaVachContainer"] = [];
    const r = mapKvgsResponse(s, NOW);
    expect(r.state === "ACCEPTED" && r.sheet.kind).toBe("CARGO");
  });
  it("không có seal Hải quan ở dòng nào → sealRequired false; seal rỗng → null", () => {
    const s = containerSample();
    s.serviceMessage["bangKeMaVachContainer"] = [{ soContainer: "MSCU1234566", soSeal: "", soSealHQ: null, barcodeImage: null }];
    const r = mapKvgsResponse(s, NOW);
    expect(r.state === "ACCEPTED" && r.sheet.sealRequired).toBe(false);
    expect(r.state === "ACCEPTED" && r.sheet.containers).toEqual([{ containerNo: "MSCU1234566", sealNo: null, customsSealNo: null, barcodeImage: null }]);
  });
  it("số lượng/trọng lượng không lỗi dấu phẩy động, không dạng mũ", () => {
    const s = cargoSample();
    Object.assign(s.serviceMessage, { so_Luong_Hang: 0.3, tong_Trong_Luong_Hang: 1e21 });
    const r = mapKvgsResponse(s, NOW);
    expect(r.state === "ACCEPTED" && r.sheet.cargo).toMatchObject({ quantity: "0.3", grossWeight: "1000000000000000000000" });
  });
  it("địa điểm giám sát thiếu phần nào thì bỏ phần đó", () => {
    const s = containerSample();
    Object.assign(s.serviceMessage, { tenChiCucHaiQuanGS: null, tenDDGS: null });
    const r = mapKvgsResponse(s, NOW);
    expect(r.state === "ACCEPTED" && r.sheet.supervisionOffice).toBe("02CIS01");
    Object.assign(s.serviceMessage, { tenChiCucHaiQuanGS: "CCGS", maDDGS: null, tenDDGS: "Kho A" });
    const r2 = mapKvgsResponse(s, NOW);
    expect(r2.state === "ACCEPTED" && r2.sheet.supervisionOffice).toBe("CCGS - Kho A");
  });
  it("thiếu thời gian lấy dữ liệu → dùng `now`", () => {
    const s = cargoSample();
    s.serviceMessage["thoiGianLayDuLieu"] = null;
    const r = mapKvgsResponse(s, NOW);
    expect(r.state === "ACCEPTED" && r.sheet.exportedAt).toBe(NOW.toISOString());
  });

  it("errorList (thiếu TK_SOTK, đặc tả §5) → REJECTED với lỗi chuẩn hóa; rowPosition 0 không thành dòng", () => {
    const r = mapKvgsResponse({ errorList: [{ errorCode: "000", indexCode: "000", nameCode: "TK_SOTK", errorContent: "Không được để trống TK_SOTK", proposedSolution: "Vui lòng nhập TK_SOTK", rowPosition: "0" }], serviceMessage: null }, NOW);
    expect(r).toEqual({ state: "REJECTED", errors: [{ code: "000", field: "TK_SOTK", message: "Không được để trống TK_SOTK", solution: "Vui lòng nhập TK_SOTK" }] });
  });
  it("errorList có rowPosition > 0 → line; nameCode '000' / 'Lỗi hệ thống' không phải tên trường", () => {
    const r = mapKvgsResponse({ errorList: [{ errorCode: "E1", indexCode: "000", nameCode: "000", errorContent: "Hải quan báo lỗi", proposedSolution: "", rowPosition: "2" }, { errorCode: "E2", nameCode: "Lỗi hệ thống", errorContent: "Ngoại lệ" }], serviceMessage: null }, NOW);
    expect(r).toEqual({ state: "REJECTED", errors: [{ code: "E1", message: "Hải quan báo lỗi", line: 2 }, { code: "E2", message: "Ngoại lệ" }] });
  });

  const incomplete = (raw: unknown) => {
    const r = mapKvgsResponse(raw, NOW);
    expect(r.state).toBe("REJECTED");
    return r.state === "REJECTED" ? r.errors[0] : undefined;
  };
  it("serviceMessage null mà errorList rỗng → KVGS_RESPONSE_INCOMPLETE", () => {
    expect(incomplete({ errorList: [], serviceMessage: null })?.code).toBe("KVGS_RESPONSE_INCOMPLETE");
  });
  it("thiếu soToKhai hoặc soDinhDanh → incomplete", () => {
    for (const k of ["soToKhai", "soDinhDanh"]) {
      const s = containerSample();
      s.serviceMessage[k] = null;
      expect(incomplete(s)).toMatchObject({ code: "KVGS_RESPONSE_INCOMPLETE", message: expect.stringContaining(k) });
    }
  });
  it("hàng container mà bảng kê rỗng (đặc tả: có thể xảy ra) → incomplete", () => {
    const s = containerSample();
    s.serviceMessage["bangKeMaVachContainer"] = [];
    expect(incomplete(s)?.code).toBe("KVGS_RESPONSE_INCOMPLETE");
  });
  it("hàng lẻ không có số lượng → incomplete", () => {
    const s = cargoSample();
    s.serviceMessage["so_Luong_Hang"] = null;
    expect(incomplete(s)?.code).toBe("KVGS_RESPONSE_INCOMPLETE");
  });
  it("ảnh mã vạch không phải Base64 thuần → incomplete (không in ảnh hỏng)", () => {
    const s = containerSample();
    (s.serviceMessage["bangKeMaVachContainer"] as Record<string, unknown>[])[0]!["barcodeImage"] = "<script>alert(1)</script>";
    expect(incomplete(s)?.code).toBe("KVGS_RESPONSE_INCOMPLETE");
  });
  it("ngày tờ khai sai định dạng / không phải object / kiểu sai → incomplete", () => {
    const s = containerSample();
    s.serviceMessage["ngayToKhai"] = "2026/11/10";
    expect(incomplete(s)?.code).toBe("KVGS_RESPONSE_INCOMPLETE");
    expect(incomplete(null)?.code).toBe("KVGS_RESPONSE_INCOMPLETE");
    expect(incomplete({ errorList: "x" })?.code).toBe("KVGS_RESPONSE_INCOMPLETE");
  });
});
