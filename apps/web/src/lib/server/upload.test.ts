import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { readUploadFiles } from "./upload";

describe("readUploadFiles", () => {
  it("đọc nhiều file từ multipart, giữ tên/mime/bytes; bỏ phần không phải file", async () => {
    const form = new FormData();
    form.append("files", new File([new Uint8Array([37, 80, 68, 70])], "INV.pdf", { type: "application/pdf" }));
    form.append("files", new File([new Uint8Array([1])], "PL.pdf", { type: "application/pdf" }));
    form.append("note", "x");
    const req = new NextRequest("http://localhost/api/x", { method: "POST", body: form });
    const files = await readUploadFiles(req);
    expect(files.map((f) => f.name)).toEqual(["INV.pdf", "PL.pdf"]);
    expect(files[0]?.mime).toBe("application/pdf");
    expect(files[0]?.bytes.length).toBe(4);
  });
  it("không có file → ném HttpError 400 FILE_INVALID; file > 25MB → FILE_TOO_LARGE", async () => {
    const empty = new NextRequest("http://localhost/api/x", { method: "POST", body: new FormData() });
    await expect(readUploadFiles(empty)).rejects.toMatchObject({ status: 400, code: "FILE_INVALID" });
    const form = new FormData();
    form.append("files", new File([new Uint8Array(26 * 1024 * 1024)], "big.pdf", { type: "application/pdf" }));
    await expect(readUploadFiles(new NextRequest("http://localhost/api/x", { method: "POST", body: form }))).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });
});
