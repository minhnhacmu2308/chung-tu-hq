import { describe, expect, it } from "vitest";
import { REASON_TEXT_VI } from "../reason-codes.js";
import { FptKvgsResponseSchema } from "../fpt/kvgs.js";
import { checkContainerList, isPlainBase64, isValidContainerNo, KvgsSheetSchema, normalizeContainerNo, SaveContainerListInputSchema, type ContainerListRow } from "./index.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAIAAAUAAYRcDQAAAAAASUVORK5CYII=";
const row = (o: Partial<ContainerListRow> = {}): ContainerListRow => ({ billNo: "122600049332258", containerNo: "FBIU5802429", sealNo: "NA", note: "", source: "USER", ...o });

describe("số container ISO 6346", () => {
  it("chuẩn hóa: bỏ khoảng trắng/gạch/chấm, viết hoa", () => {
    expect(normalizeContainerNo(" fbiu 580242-9 ")).toBe("FBIU5802429");
    expect(normalizeContainerNo("csqu.305438.3")).toBe("CSQU3054383");
  });
  it("kiểm chữ số kiểm", () => {
    expect(isValidContainerNo("FBIU5802429")).toBe(true);
    expect(isValidContainerNo("CSQU3054383")).toBe(true);
    expect(isValidContainerNo("CSQU3054384")).toBe(false);
    expect(isValidContainerNo("FBIA5802429")).toBe(false);
    expect(isValidContainerNo("FBIU580242")).toBe(false);
  });
});

describe("checkContainerList", () => {
  it("bảng rỗng → REQUIRED", () => {
    expect(checkContainerList([])).toEqual([{ row: 0, field: "containerNo", code: "REQUIRED" }]);
  });
  it("hợp lệ → không lỗi; số viết thường/có gạch vẫn hợp lệ", () => {
    expect(checkContainerList([row(), row({ containerNo: "csqu 305438-3" })])).toEqual([]);
  });
  it("trùng số container → dòng 2 DUPLICATE", () => {
    expect(checkContainerList([row(), row({ containerNo: "fbiu 580242-9" })])).toEqual([{ row: 2, field: "containerNo", code: "DUPLICATE" }]);
  });
  it("seal rỗng → REQUIRED; số sai → INVALID_CONTAINER_NO; quá dài → TOO_LONG", () => {
    expect(checkContainerList([row({ sealNo: "" })])).toEqual([{ row: 1, field: "sealNo", code: "REQUIRED" }]);
    expect(checkContainerList([row({ containerNo: "CSQU3054384" })])).toEqual([{ row: 1, field: "containerNo", code: "INVALID_CONTAINER_NO" }]);
    expect(checkContainerList([row({ note: "x".repeat(256) })])).toEqual([{ row: 1, field: "note", code: "TOO_LONG" }]);
    expect(checkContainerList([row({ billNo: "" })])).toEqual([{ row: 1, field: "billNo", code: "REQUIRED" }]);
  });
});

describe("KvgsSheetSchema", () => {
  const sheet = {
    kind: "CONTAINER", regionOffice: "Chi cục Hải quan khu vực II", customsOffice: "Hải quan cửa khẩu cảng Sài Gòn khu vực 1",
    supervisionOffice: "02CI – CTYCP Cảng Cát Lái", sealRequired: false, companyName: "CÔNG TY A", taxCode: "0312345678",
    declarationNo: "309096721420", declarationStatus: "Thông quan", declarationDate: "2026-02-27", declarationDateTo: null,
    typeName: "Nhập kinh doanh", channel: "Luồng xanh", cargoControlNo: "122600049332258", barcode: null,
    containers: [{ containerNo: "FBIU5802429", sealNo: "NA", customsSealNo: null, barcodeImage: PNG }], cargo: null, exportedAt: "2026-02-27T03:00:00Z",
  };
  it("nhận mẫu container", () => {
    expect(KvgsSheetSchema.parse(sheet).containers[0]?.containerNo).toBe("FBIU5802429");
    expect(KvgsSheetSchema.safeParse({ ...sheet, declarationDate: "27/02/2026" }).success).toBe(false);
  });
  it("barcodeImage: Base64 thuần hoặc null; chuỗi rác / data URL / quá dài bị từ chối", () => {
    const withImg = (barcodeImage: unknown) => KvgsSheetSchema.safeParse({ ...sheet, containers: [{ ...sheet.containers[0], barcodeImage }] }).success;
    expect(withImg(PNG)).toBe(true);
    expect(withImg(null)).toBe(true);
    expect(withImg("không phải base64!")).toBe(false);
    expect(withImg("data:image/png;base64," + PNG)).toBe(false);
    expect(withImg("")).toBe(false);
    expect(withImg("A".repeat(300 * 1024))).toBe(false);
    expect(isPlainBase64(PNG)).toBe(true);
    expect(isPlainBase64("<svg/>")).toBe(false);
  });
});

describe("FptKvgsResponseSchema (POST /api/KVGS)", () => {
  it("nhận đúng tên trường của đặc tả, số lượng là number, chuỗi có thể null", () => {
    const r = FptKvgsResponseSchema.parse({ errorList: [], serviceMessage: { isContainer: 1, so_Luong_Hang: 120, tong_Trong_Luong_Hang: 12450.5, dvT_So_Luong_Hang: "PK", ghi_Chu: null, soToKhai: "106123456780", bangKeMaVachContainer: [{ soContainer: "MSCU1234566", soSeal: null, soSealHQ: "HQ005678", barcodeImage: PNG }] } });
    expect(r.serviceMessage?.so_Luong_Hang).toBe(120);
    expect(r.serviceMessage?.bangKeMaVachContainer?.[0]?.soSealHQ).toBe("HQ005678");
  });
  it("lỗi: errorList các trường chuỗi, serviceMessage null", () => {
    const r = FptKvgsResponseSchema.parse({ errorList: [{ errorCode: "000", indexCode: "000", nameCode: "TK_SOTK", errorContent: "Không được để trống TK_SOTK", proposedSolution: "Vui lòng nhập TK_SOTK", rowPosition: "0" }], serviceMessage: null });
    expect(r.errorList?.[0]?.nameCode).toBe("TK_SOTK");
    expect(r.serviceMessage).toBeNull();
  });
  it("kiểu sai (errorList không phải mảng) → không parse", () => {
    expect(FptKvgsResponseSchema.safeParse({ errorList: "x", serviceMessage: null }).success).toBe(false);
  });
});

describe("mã lý do KVGS", () => {
  it("có câu tiếng Việt", () => {
    for (const c of ["KVGS_REQUIRES_CLEARANCE", "KVGS_REQUIRES_CONTAINER_LIST", "CONT_LIST_NOT_APPLICABLE", "CONT_LIST_REQUIRES_DECLARATION_NUMBER", "CONT_LIST_INVALID", "KVGS_ALREADY_SENDING", "KVGS_RESPONSE_INCOMPLETE", "CONT_LIST_LOCKED"]) {
      expect(REASON_TEXT_VI).toHaveProperty(c);
    }
  });
});

describe("SaveContainerListInputSchema", () => {
  it("tối đa 500 dòng", () => {
    expect(SaveContainerListInputSchema.safeParse({ rows: Array.from({ length: 500 }, () => row()) }).success).toBe(true);
    expect(SaveContainerListInputSchema.safeParse({ rows: Array.from({ length: 501 }, () => row()) }).success).toBe(false);
  });
});
