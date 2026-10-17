import { describe, expect, it } from "vitest";
import { fieldDefForFptIndex } from "./fpt-index.js";

describe("fieldDefForFptIndex – mã chỉ tiêu lỗi FPT → số chỉ tiêu Phụ lục II", () => {
  it.each([
    ["IDA", "ICB", "1.4"], ["IDA", "TK_ICB", "1.4"], ["IDA", "EPN", "1.20"], ["IDA", "EP3", "1.22"],
    ["IDA", "IP2", "1.44"], ["IDA", "IP4", "1.44"], ["IDA", "SN2", "1.38"], ["IDA", "OL3", "1.37"],
    ["IDA", "ST", "1.29"], ["IDA", "GWT", "1.28"], ["IDA", "CMD", "1.74"], ["IDA", "QT1", "1.83"], ["IDA", "VLD", "1.50"],
    ["EDA", "ECB", "2.4"], ["EDA", "CGA", "2.21"], ["EDA", "CAS", "2.21"], ["EDA", "DSC", "2.28"], ["EDA", "SYM", "2.31"], ["EDA", "FKK", "2.40"], ["EDA", "OL2", "2.80"],
  ] as const)("%s %s → %s", (kind, code, no) => {
    expect(fieldDefForFptIndex(kind, code)?.no).toBe(no);
  });
  it("mã không có trong catalog / rỗng → undefined", () => {
    expect(fieldDefForFptIndex("IDA", "LIST_FILE")).toBeUndefined();
    expect(fieldDefForFptIndex("EDA", "")).toBeUndefined();
    expect(fieldDefForFptIndex("IDA", null)).toBeUndefined();
  });
});
