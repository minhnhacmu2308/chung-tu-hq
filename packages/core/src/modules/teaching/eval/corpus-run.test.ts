import { describe, expect, it } from "vitest";
import { isDeclarationFile } from "./corpus-run.js";

describe("kho dữ liệu", () => {
  it("nhận ra file tờ khai thật theo tên", () => {
    expect(isDeclarationFile("TK 107139226350.pdf")).toBe(true);
    expect(isDeclarationFile("ToKhaiHQ7N_106794645160.pdf")).toBe(true);
    expect(isDeclarationFile("Tờ khai lô 12.pdf")).toBe(true);
    expect(isDeclarationFile("INV 88 & 100.pdf")).toBe(false);
  });
});
