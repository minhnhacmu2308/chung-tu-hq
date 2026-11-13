import { describe, expect, it } from "vitest";
import { REASON_TEXT_VI } from "../reason-codes.js";
import { checkContainerList, isValidContainerNo, KvgsSheetSchema, normalizeContainerNo, type ContainerListRow } from "./index.js";

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
  it("nhận mẫu container", () => {
    const sheet = {
      kind: "CONTAINER", regionOffice: "Chi cục Hải quan khu vực II", customsOffice: "Hải quan cửa khẩu cảng Sài Gòn khu vực 1",
      supervisionOffice: "02CI – CTYCP Cảng Cát Lái", sealRequired: false, companyName: "CÔNG TY A", taxCode: "0312345678",
      declarationNo: "309096721420", declarationStatus: "Thông quan", declarationDate: "2026-02-27", declarationDateTo: null,
      typeName: "Nhập kinh doanh", channel: "Luồng xanh", cargoControlNo: "122600049332258", barcode: null,
      containers: [{ containerNo: "FBIU5802429", sealNo: "NA", customsSealNo: null, barcode: "FBIU5802429" }], cargo: null, exportedAt: "2026-02-27T03:00:00Z",
    };
    expect(KvgsSheetSchema.parse(sheet).containers[0]?.containerNo).toBe("FBIU5802429");
    expect(KvgsSheetSchema.safeParse({ ...sheet, declarationDate: "27/02/2026" }).success).toBe(false);
  });
});

describe("mã lý do KVGS", () => {
  it("có câu tiếng Việt", () => {
    for (const c of ["KVGS_REQUIRES_CLEARANCE", "KVGS_REQUIRES_CONTAINER_LIST", "CONT_LIST_NOT_APPLICABLE", "CONT_LIST_REQUIRES_DECLARATION_NUMBER", "CONT_LIST_INVALID", "KVGS_ALREADY_SENDING", "KVGS_RESPONSE_INCOMPLETE", "CONT_LIST_LOCKED"]) {
      expect(REASON_TEXT_VI).toHaveProperty(c);
    }
  });
});
