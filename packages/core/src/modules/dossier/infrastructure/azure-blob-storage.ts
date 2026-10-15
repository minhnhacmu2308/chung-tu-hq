import { BlobSASPermissions, BlobServiceClient, RestError, type ContainerClient } from "@azure/storage-blob";
import type { ObjectStorage } from "../application/ports.js";

/**
 * Azure Blob Storage (STORAGE=azure). Container riêng tư (không public); trình duyệt xem file qua link SAS chỉ đọc, hết hạn theo `ttlSec`.
 * Connection string phải có AccountKey (Azure Portal → Storage account → Access keys) – SAS ký bằng khóa tài khoản.
 */
export class AzureBlobObjectStorage implements ObjectStorage {
  private container: ContainerClient;
  private ready: Promise<unknown> | null = null;
  constructor(connectionString: string, containerName: string) {
    this.container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  }
  /** Tạo container lần đầu (không public). Lỗi thì lần gọi sau thử lại. */
  private ensure() {
    this.ready ??= this.container.createIfNotExists().catch((e: unknown) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }
  async put(key: string, body: Buffer, mime: string) {
    await this.ensure();
    await this.container.getBlockBlobClient(key).uploadData(body, { blobHTTPHeaders: { blobContentType: mime } });
  }
  async get(key: string) {
    try {
      return await this.container.getBlockBlobClient(key).downloadToBuffer();
    } catch (e) {
      // Cùng tên lỗi với S3 → worker coi là lỗi vĩnh viễn (file không còn), không retry.
      if (e instanceof RestError && e.statusCode === 404) throw Object.assign(new Error(`Không còn file trong storage: ${key}`), { name: "NoSuchKey" });
      throw e;
    }
  }
  presignGet(key: string, ttlSec: number) {
    return this.container.getBlockBlobClient(key).generateSasUrl({ permissions: BlobSASPermissions.parse("r"), startsOn: new Date(Date.now() - 60_000), expiresOn: new Date(Date.now() + ttlSec * 1000) });
  }
  async delete(key: string) {
    await this.container.getBlockBlobClient(key).deleteIfExists();
  }
}
