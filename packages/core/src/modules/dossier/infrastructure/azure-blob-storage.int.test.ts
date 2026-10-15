import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AzureBlobObjectStorage } from "./azure-blob-storage.js";

// Azurite: bộ giả lập Azure Storage chính thức; tài khoản/khóa dưới đây là khóa dev công khai của Azurite.
const ACCOUNT_KEY = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";
let azurite: StartedTestContainer;
let storage: AzureBlobObjectStorage;

beforeAll(async () => {
  azurite = await new GenericContainer("mcr.microsoft.com/azure-storage/azurite").withCommand(["azurite-blob", "--blobHost", "0.0.0.0", "--skipApiVersionCheck"]).withExposedPorts(10000).start();
  const endpoint = `http://${azurite.getHost()}:${azurite.getMappedPort(10000)}/devstoreaccount1`;
  storage = new AzureBlobObjectStorage(`DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=${ACCOUNT_KEY};BlobEndpoint=${endpoint};`, "khaibao-test");
});
afterAll(async () => {
  await azurite?.stop();
});

describe("AzureBlobObjectStorage (Azurite)", () => {
  const key = "org_a/dos_1/doc_1/Commercial Invoice.pdf";
  it("tự tạo container lần đầu; put → get trả đúng bytes", async () => {
    await storage.put(key, Buffer.from("%PDF-1.4 hoá đơn"), "application/pdf");
    expect((await storage.get(key)).toString("utf8")).toBe("%PDF-1.4 hoá đơn");
  });
  it("link SAS chỉ đọc: tải được đúng file với Content-Type đã lưu; hết hạn thì 403", async () => {
    const res = await fetch(await storage.presignGet(key, 600));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).toString("utf8")).toBe("%PDF-1.4 hoá đơn");
    const expired = await storage.presignGet(key, -120);
    expect((await fetch(expired)).status).toBe(403);
  });
  it("link SAS không cho ghi đè/xóa", async () => {
    const url = await storage.presignGet(key, 600);
    expect((await fetch(url, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob" }, body: "hack" })).status).toBe(403);
    expect((await fetch(url, { method: "DELETE" })).status).toBe(403);
  });
  it("delete xóa file; xóa lần nữa không lỗi; get file không tồn tại → NoSuchKey", async () => {
    await storage.delete(key);
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toMatchObject({ name: "NoSuchKey" }); // worker coi là lỗi vĩnh viễn như S3
  });
});
