import { describe, expect, it } from "vitest";
import { classifyByFileName, extensionOf, sniffMime, validateUpload } from "../upload-rules.js";
import { nextDossierCode } from "../code.js";
import { canCancel, canChangeStep, isLocked } from "../status.js";

describe("nextDossierCode", () => {
  it("HS-{NK|XK}-{YYMM}-{NNN} tăng theo số lớn nhất trong tháng", () => {
    const now = new Date("2026-10-14T00:00:00Z");
    expect(nextDossierCode("NK", now, [])).toBe("HS-NK-2610-001");
    expect(nextDossierCode("XK", now, ["HS-XK-2610-007", "HS-XK-2609-120", "HS-NK-2610-050"])).toBe("HS-XK-2610-008");
  });
});

describe("sniffMime – nhận diện loại file theo byte đầu", () => {
  it("PDF/PNG/JPEG/ZIP theo magic bytes; PDF cho phép rác trước %PDF-; khác → null", () => {
    expect(sniffMime(Buffer.from("%PDF-1.7\n%âãÏÓ"))).toBe("application/pdf");
    expect(sniffMime(Buffer.concat([Buffer.alloc(100, 0x20), Buffer.from("%PDF-1.4")]))).toBe("application/pdf");
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBe("application/zip");
    expect(sniffMime(Buffer.from("MZ\u0090\u0000 chuong trinh .exe doi ten"))).toBeNull();
    expect(sniffMime(Buffer.from("<html>"))).toBeNull();
    expect(sniffMime(Buffer.from([0x25]))).toBeNull();
  });
  it("extensionOf: đuôi lưu trữ theo loại thật", () => {
    expect(["application/pdf", "image/png", "image/jpeg", "application/zip"].map((m) => extensionOf(m as never))).toEqual(["pdf", "png", "jpg", "zip"]);
  });
});

describe("status", () => {
  it("SUBMITTED/CLEARED là khóa; DRAFT/NEEDS_REVIEW không", () => {
    expect(isLocked("SUBMITTED")).toBe(true);
    expect(isLocked("CLEARED")).toBe(true);
    expect(isLocked("NEEDS_REVIEW")).toBe(false);
  });
  it("canChangeStep: lùi về bước trước được, tiến tới submit chỉ khi APPROVED", () => {
    expect(canChangeStep({ status: "NEEDS_REVIEW", step: "agent" }, "ocr").ok).toBe(true);
    expect(canChangeStep({ status: "NEEDS_REVIEW", step: "review" }, "submit").ok).toBe(false);
    expect(canChangeStep({ status: "APPROVED", step: "review" }, "submit").ok).toBe(true);
    expect(canChangeStep({ status: "SUBMITTED", step: "submit" }, "ocr").ok).toBe(false);
  });
  it("canCancel: không hủy khi đã truyền", () => {
    expect(canCancel("SUBMITTED").ok).toBe(false);
    expect(canCancel("DRAFT").ok).toBe(true);
  });
});

describe("upload-rules", () => {
  it.each([
    ["Commercial Invoice HPS-2610.pdf", "INVOICE"],
    ["PL_hansol.pdf", "PACKING_LIST"],
    ["HBL HPSEL2610078.pdf", "BILL_OF_LADING"],
    ["AWB 618-44021375.pdf", "AIR_WAYBILL"],
    ["CO form AK.pdf", "CERT_OF_ORIGIN"],
    ["arrival notice.pdf", "ARRIVAL_NOTICE"],
    ["hoa don cuoc.pdf", "FREIGHT_INVOICE"],
    ["sales contract.pdf", "SALES_CONTRACT"],
    ["scan001.pdf", "OTHER"],
  ])("classifyByFileName(%s) → %s", (name, kind) => {
    expect(classifyByFileName(name)).toBe(kind);
  });
  it("validateUpload: từ chối mime lạ, file > 25MB, PDF mật khẩu, > 60 trang; chấp nhận PDF thường", () => {
    const ok = validateUpload({ name: "a.pdf", mime: "application/pdf", sizeBytes: 1000, pages: 3, encrypted: false }, { maxPagesPerFile: 60 });
    expect(ok.ok).toBe(true);
    expect(validateUpload({ name: "a.exe", mime: "application/x-msdownload", sizeBytes: 1, pages: 1, encrypted: false }, { maxPagesPerFile: 60 }).ok).toBe(false);
    expect(validateUpload({ name: "a.pdf", mime: "application/pdf", sizeBytes: 26 * 1024 * 1024, pages: 1, encrypted: false }, { maxPagesPerFile: 60 }).ok).toBe(false);
    const enc = validateUpload({ name: "a.pdf", mime: "application/pdf", sizeBytes: 1, pages: 1, encrypted: true }, { maxPagesPerFile: 60 });
    expect(enc.ok).toBe(false);
    if (!enc.ok) expect(enc.error.message).toMatch(/mật khẩu/);
    expect(validateUpload({ name: "a.pdf", mime: "application/pdf", sizeBytes: 1, pages: 61, encrypted: false }, { maxPagesPerFile: 60 }).ok).toBe(false);
  });
});
