import { domainError } from "../../../../shared/errors.js";
import type { ObjectStorage, PdfInspector, ProgressEvent, ProgressPublisher, Unzipper } from "../ports.js";

/** Storage trong bộ nhớ; `fakeZip` tạo "zip" giả: danh sách tên file ngăn bởi \n (unzip thật ở infrastructure). */
export class InMemoryStorage implements ObjectStorage {
  private files = new Map<string, { body: Buffer; mime: string }>();
  static fakeZip(names: string[]) {
    return Buffer.from(`FAKEZIP\n${names.join("\n")}`);
  }
  async put(key: string, body: Buffer, mime: string) {
    this.files.set(key, { body, mime });
  }
  async get(key: string) {
    const f = this.files.get(key);
    if (!f) throw new Error(`không có ${key}`);
    return f.body;
  }
  async presignGet(key: string, ttlSec: number) {
    return `memory://${key}?ttl=${ttlSec}`;
  }
  async exists(key: string) {
    return this.files.has(key);
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  keys() {
    return [...this.files.keys()];
  }
}

/** Đọc "PDF giả": nội dung `%PDF-fake-<tên>-<trang>`; `%PDF-encrypted` → có mật khẩu; ảnh → 1 trang. */
export class FakePdfInspector implements PdfInspector {
  async inspect(bytes: Buffer, mime: string) {
    if (mime.startsWith("image/")) return { pages: 1, encrypted: false };
    const s = bytes.toString("utf8");
    if (s.startsWith("%PDF-encrypted")) return { pages: 1, encrypted: true };
    const m = /-(\d+)$/.exec(s);
    if (!s.startsWith("%PDF")) throw domainError("FILE_INVALID", "Không phải PDF");
    return { pages: m ? Number(m[1]) : 1, encrypted: false };
  }
}

export class RecordingPublisher implements ProgressPublisher {
  readonly events: ({ orgId: string; dossierId: string } & ProgressEvent)[] = [];
  async publish(orgId: string, dossierId: string, event: ProgressEvent) {
    this.events.push({ orgId, dossierId, ...event });
  }
}

/** Bung zip giả (FAKEZIP) cho test; infrastructure dùng thư viện thật. */
export class FakeUnzipper implements Unzipper {
  async entries(bytes: Buffer) {
    const s = bytes.toString("utf8");
    if (!s.startsWith("FAKEZIP\n")) return [];
    return s.split("\n").slice(1).filter(Boolean).map((name) => ({ name, bytes: Buffer.from(`%PDF-fake-${name}-1`) }));
  }
}
