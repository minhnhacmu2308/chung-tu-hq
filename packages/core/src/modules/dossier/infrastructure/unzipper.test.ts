import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { FflateUnzipper } from "./unzipper.js";

describe("FflateUnzipper", () => {
  it("liệt kê file trong zip, bỏ thư mục và file ẩn __MACOSX", async () => {
    const zip = Buffer.from(zipSync({ "INV.pdf": new Uint8Array([1, 2]), "sub/PL.pdf": new Uint8Array([3]), "__MACOSX/._INV.pdf": new Uint8Array([9]), "dir/": new Uint8Array(0) }));
    const entries = await new FflateUnzipper().entries(zip);
    expect(entries.map((e) => e.name).sort()).toEqual(["INV.pdf", "sub/PL.pdf"]);
    expect(entries.find((e) => e.name === "INV.pdf")?.bytes.length).toBe(2);
  });
  it("zip hỏng → ném DomainError FILE_INVALID", async () => {
    await expect(new FflateUnzipper().entries(Buffer.from("xx"))).rejects.toMatchObject({ code: "FILE_INVALID" });
  });
});
