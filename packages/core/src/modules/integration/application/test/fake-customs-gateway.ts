// Cổng Hải quan GIẢ (dev/test/demo) – deterministic theo id hồ sơ: số tờ khai 12 số, phân luồng 60/30/10,
// HYS lỗi lần đầu khi hash%7==0 (thử "Gửi lại"), trạng thái tiến dần qua các lần hỏi. Không mạng. Dùng được trong test use case
// (đặt ở application/test) và tái xuất qua infrastructure cho container.
import type { CustomsGateway, GatewayError } from "../customs-ports.js";

export function hashId(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export class FakeCustomsGateway implements CustomsGateway {
  readonly name = "fake-customs";
  /** Số lần hỏi trạng thái theo tờ khai (mô phỏng Hải quan xử lý dần). */
  private polls = new Map<string, number>();
  private hysAttempts = new Map<string, number>();
  /** Số lần hỏi trước khi luồng vàng/đỏ được thông quan. */
  constructor(private opts: { clearAfterPolls?: number; alwaysGreen?: boolean; flakyHys?: boolean } = {}) {}

  channelFor(dossierId: string): "GREEN" | "YELLOW" | "RED" {
    if (this.opts.alwaysGreen) return "GREEN";
    const r = hashId(dossierId) % 10;
    return r < 6 ? "GREEN" : r < 9 ? "YELLOW" : "RED";
  }
  declarationNoFor(dossierId: string, kind: "IDA" | "EDA") {
    return `${kind === "IDA" ? "107" : "307"}${String(hashId(dossierId) % 1_000_000_000).padStart(9, "0")}`;
  }

  async preDeclare(_orgId: string, msg: { kind: "IDA" | "EDA"; request: unknown; dossierId: string }) {
    const req = msg.request as Record<string, Record<string, unknown>>;
    const tk = req["objVN_IDA"] ?? req["objVN_EDA"] ?? {};
    const errors: GatewayError[] = [];
    if (!tk["tK_ICB"] && !tk["tK_ECB"]) errors.push({ code: "E-ICB-001", field: "TK_ICB", message: "Thiếu mã loại hình", solution: "Khai mã loại hình (A11, B11…)" });
    if (errors.length) return { externalId: `fpt-${hashId(msg.dossierId)}`, errors };
    return { externalId: `fpt-${hashId(msg.dossierId)}`, declarationNo: this.declarationNoFor(msg.dossierId, msg.kind) };
  }
  async declare(_orgId: string, msg: { kind: "IDC" | "EDC"; externalId: string; dossierId: string }) {
    return { accepted: true, channel: this.channelFor(msg.dossierId) };
  }
  async attachDocuments(_orgId: string, msg: { externalId: string; dossierId: string; files: { name: string; bytes: Buffer }[] }) {
    const n = (this.hysAttempts.get(msg.dossierId) ?? 0) + 1;
    this.hysAttempts.set(msg.dossierId, n);
    if ((this.opts.flakyHys ?? true) && n === 1 && hashId(msg.dossierId) % 7 === 0) return { errors: [{ code: "E-SIG-401", message: "Phiên ký số hết hạn", solution: "Ký lại bằng chứng thư số và gửi lại HYS" }] };
    if (msg.files.length === 0) return { errors: [{ code: "E-HYS-000", message: "Không có tệp đính kèm", solution: "Tải chứng từ lên hồ sơ" }] };
    return { receiptNo: `HYS${String(hashId(msg.dossierId + n) % 100_000_000).padStart(8, "0")}` };
  }
  async queryStatus(_orgId: string, externalId: string, dossierId: string) {
    const n = (this.polls.get(externalId) ?? 0) + 1;
    this.polls.set(externalId, n);
    const channel = this.channelFor(dossierId);
    const cleared = channel === "GREEN" || n >= (this.opts.clearAfterPolls ?? 3);
    return { declarationNo: this.declarationNoFor(dossierId, "IDA"), channel, status: cleared ? "Đã thông quan" : channel === "YELLOW" ? "Chờ kiểm tra chi tiết hồ sơ" : "Chờ kiểm tra thực tế hàng hóa", cleared };
  }
}
