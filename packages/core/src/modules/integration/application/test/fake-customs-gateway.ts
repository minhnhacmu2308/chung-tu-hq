// Cổng Hải quan GIẢ (dev/test/demo) – deterministic theo id hồ sơ: số tờ khai 12 số, phân luồng 60/30/10,
// HYS lỗi lần đầu khi hash%7==0 (thử "Gửi lại"), trạng thái tiến dần qua các lần hỏi. Không mạng. Dùng được trong test use case
// (đặt ở application/test) và tái xuất qua infrastructure cho container.
import type { CustomsInfo, CustomsOperation } from "@kb/contracts";
import type { CustomsGateway, GatewayError, GatewaySendResult } from "../customs-ports.js";

export function hashId(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Thông tin Hải quan trả về (mô phỏng) – thời điểm nhận do use case ghi đè bằng clock. */
const info = (patch: Partial<CustomsInfo>): CustomsInfo => ({ receivedAt: "1970-01-01T00:00:00.000Z", exchangeRates: [], taxes: [], items: [], directives: [], ...patch });
const INSPECTION = { GREEN: "1", YELLOW: "2", RED: "3" } as const;

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
    const no = this.declarationNoFor(msg.dossierId, msg.kind);
    return {
      externalId: `fpt-${hashId(msg.dossierId)}`, declarationNo: no,
      info: info({ declarationNo: no, customsOfficeName: "CCHQ mô phỏng", exchangeRates: [{ currency: "USD", rate: "26150" }], taxes: [{ code: "N", name: "Thuế NK", amountVnd: "0" }], totalTaxVnd: "0" }),
    };
  }
  async declare(_orgId: string, msg: { kind: "IDC" | "EDC"; externalId: string; dossierId: string }) {
    const channel = this.channelFor(msg.dossierId);
    return {
      accepted: true, channel,
      info: info({ registeredDate: "2026-10-14", registeredTime: "10:00:00", inspectionCode: INSPECTION[channel], ...(channel === "GREEN" ? {} : { directives: [{ title: "Nộp chứng từ", content: "Nộp bộ chứng từ qua HYS" }] }) }),
    };
  }
  async attachDocuments(_orgId: string, msg: { externalId: string; dossierId: string; files: { name: string; bytes: Buffer }[] }) {
    const n = (this.hysAttempts.get(msg.dossierId) ?? 0) + 1;
    this.hysAttempts.set(msg.dossierId, n);
    if ((this.opts.flakyHys ?? true) && n === 1 && hashId(msg.dossierId) % 7 === 0) return { errors: [{ code: "E-SIG-401", message: "Phiên ký số hết hạn", solution: "Ký lại bằng chứng thư số và gửi lại HYS" }] };
    if (msg.files.length === 0) return { errors: [{ code: "E-HYS-000", message: "Không có tệp đính kèm", solution: "Tải chứng từ lên hồ sơ" }] };
    return { receiptNo: `HYS${String(hashId(msg.dossierId + n) % 100_000_000).padStart(8, "0")}` };
  }
  /** Nghiệp vụ còn lại của luồng (mô phỏng): gọi sửa, khai tạm/chính thức sửa đổi, container qua KVGS, lệ phí cảng biển (số tiền KHÔNG phải biểu phí thật). */
  async send(_orgId: string, msg: { op: CustomsOperation; externalId: string; dossierId: string; request?: unknown }): Promise<GatewaySendResult> {
    const ref = (prefix: string) => `${prefix}${String(hashId(msg.dossierId + msg.op + (this.sends.get(msg.dossierId) ?? 0)) % 100_000_000).padStart(8, "0")}`;
    this.sends.set(msg.dossierId, (this.sends.get(msg.dossierId) ?? 0) + 1);
    switch (msg.op) {
      case "IDB": case "EDB": case "IDD": case "EDD": case "AMB":
        return { note: "Hải quan cho phép gọi tờ khai về để sửa" };
      case "IDA01": case "EDA01": case "AMA":
        return { receiptNo: ref("SD"), note: "Hải quan tiếp nhận bản khai tạm sửa đổi" };
      case "IDE": case "EDE":
        return { channel: this.channelFor(msg.dossierId), note: "Hải quan chấp nhận khai sửa đổi bổ sung" };
      case "AMC":
        return { receiptNo: ref("AMC"), note: "Hải quan chấp nhận khai sửa đổi sau thông quan" };
      case "CONT": {
        const containers = ((msg.request as { containers?: string[] } | undefined)?.containers ?? []).filter(Boolean);
        if (!containers.length) return { errors: [{ code: "E-CONT-000", message: "Không có số container", solution: "Bổ sung số container trên vận đơn" }] };
        return { receiptNo: ref("KVGS"), note: `${containers.length} container được phép qua khu vực giám sát: ${containers.join(", ")}` };
      }
      case "PORT_FEE":
        return { receiptNo: ref("LP"), note: "Cảng vụ tiếp nhận tờ khai lệ phí cảng biển (mô phỏng – số tiền theo thông báo của cảng)" };
      default:
        return { errors: [{ code: "E-OP", message: `Nghiệp vụ ${msg.op} không gửi qua send()` }] };
    }
  }
  private sends = new Map<string, number>();

  async queryStatus(_orgId: string, externalId: string, dossierId: string) {
    const n = (this.polls.get(externalId) ?? 0) + 1;
    this.polls.set(externalId, n);
    const channel = this.channelFor(dossierId);
    const cleared = channel === "GREEN" || n >= (this.opts.clearAfterPolls ?? 3);
    return {
      declarationNo: this.declarationNoFor(dossierId, "IDA"), channel, status: cleared ? "Đã thông quan" : channel === "YELLOW" ? "Chờ kiểm tra chi tiết hồ sơ" : "Chờ kiểm tra thực tế hàng hóa", cleared,
      ...(cleared ? { info: info({ permitDate: "2026-10-14", permitTime: "11:00:00" }) } : {}),
    };
  }
}
