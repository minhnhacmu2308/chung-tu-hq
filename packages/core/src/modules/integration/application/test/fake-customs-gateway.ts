// Cổng Hải quan GIẢ (dev/test/demo) – deterministic theo id hồ sơ: số tờ khai 12 số, phân luồng 60/30/10,
// HYS lỗi lần đầu khi hash%7==0 (thử "Gửi lại"), trạng thái tiến dần qua các lần hỏi IID/IEX và các lượt lấy VNACCSREP (pullMessages). Không mạng. Dùng được trong test use case
// (đặt ở application/test) và tái xuất qua infrastructure cho container.
import type { CustomsInfo, CustomsOperation, KvgsSheet } from "@kb/contracts";
import { systemClock, type Clock } from "../../../../shared/clock.js";
import type { ContainerListGatewayRequest, CustomsGateway, GatewayError, GatewayMessage, GatewaySendResult, HysGatewayRequest, HysGatewayResult, IdentifierGatewayRequest, IdentifierGatewayResult, KvgsFetchResult, KvgsGatewayRequest, RefResult } from "../customs-ports.js";

/** Ảnh mã vạch mô phỏng: PNG 1×1 Base64 thuần (mẫu của đặc tả API-KVGS). */
export const FAKE_BARCODE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAIAAAUAAYRcDQAAAAAASUVORK5CYII=";

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
  /** Số lần gọi attachDocuments (test kiểm không gửi lại). */
  hysCalls: HysGatewayRequest[] = [];
  /**
   * clearAfterPolls: số lần hỏi trước khi luồng vàng/đỏ được thông quan; flakyHys: HYS lỗi lần đầu khi hash%7==0;
   * rejectHys: Hải quan từ chối mọi bộ HYS; clock: ngày tiếp nhận HYS (giờ VN).
   */
  constructor(private opts: {
    clearAfterPolls?: number; alwaysGreen?: boolean; flakyHys?: boolean; rejectHys?: boolean; clock?: Clock;
    /** Số lần hỏi (V5ContainerRes) còn PENDING trước khi có kết quả (mặc định 0 = có ngay). */
    refPendingPolls?: number;
    /** Kịch bản KVGS: ACCEPTED (mặc định, đủ trường) · REJECTED (errorList) · INCOMPLETE (thiếu số định danh → REJECTED KVGS_RESPONSE_INCOMPLETE, giữ raw). */
    kvgsOutcome?: "ACCEPTED" | "REJECTED" | "INCOMPLETE";
    /** Loại hàng API trả về (isContainer); mặc định CONTAINER. */
    kvgsKind?: "CONTAINER" | "CARGO";
    /** Định danh: ASYNC = V5IdentifierReq chỉ trả REF_ID (hỏi V5IdentifierRes, áp refPendingPolls); mặc định SYNC như cổng thật (kết quả ngay). MST bắt đầu bằng 9 → Hải quan từ chối. */
    identifierMode?: "SYNC" | "ASYNC";
  } = {}) {}
  /** Lời gọi danh sách container / KVGS (test kiểm nội dung gửi). */
  containerListCalls: ContainerListGatewayRequest[] = [];
  kvgsCalls: KvgsGatewayRequest[] = [];
  identifierCalls: IdentifierGatewayRequest[] = [];
  private identifierRefs = new Map<string, IdentifierGatewayRequest>();
  /** V5ContainerRes không trả lại dòng: nhớ dòng đã gửi theo REF_ID để quyết định từ chối (seal bắt đầu bằng REJECT). */
  private refRows = new Map<string, ContainerListGatewayRequest["rows"]>();
  private refPolls = new Map<string, number>();
  private refSeq = 0;
  private today() {
    return new Date((this.opts.clock ?? systemClock).now().getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  }
  private pending(refId: string) {
    const n = (this.refPolls.get(refId) ?? 0) + 1;
    this.refPolls.set(refId, n);
    return n <= (this.opts.refPendingPolls ?? 0);
  }

  async sendContainerList(_orgId: string, req: ContainerListGatewayRequest, _idempotencyKey?: string) {
    this.containerListCalls.push(req);
    const errors: GatewayError[] = [];
    req.rows.forEach((r, i) => { if (!r.sealNo.trim()) errors.push({ code: "E-CONT-SEL", field: "SEL_SO", message: `Dòng ${i + 1}: chưa nhập số seal`, line: i + 1 }); });
    if (!req.rows.length) errors.push({ code: "E-CONT-000", field: "HANG_CONT", message: "Chưa có container nào" });
    if (errors.length) return { errors };
    const refId = `FAKE-CL-${++this.refSeq}-${hashId(req.declarationNo)}`;
    this.refRows.set(refId, req.rows);
    return { refId };
  }
  async containerListResult(_orgId: string, req: Omit<ContainerListGatewayRequest, "rows"> & { refId: string }): Promise<RefResult> {
    if (this.pending(req.refId)) return { state: "PENDING" };
    const rows = this.refRows.get(req.refId) ?? [];
    const bad = rows.map((r, i) => ({ r, line: i + 1 })).filter(({ r }) => r.sealNo.toUpperCase().startsWith("REJECT"));
    if (bad.length) return { state: "REJECTED", errors: bad.map(({ line }) => ({ code: "E-CONT-REJ", field: "SEL_SO", message: `Dòng ${line}: số seal không hợp lệ`, solution: "Sửa số seal và khai lại", line })) };
    return { state: "ACCEPTED", receiptNo: String(hashId(req.refId) % 100_000_000).padStart(8, "0"), receiptDate: this.today() };
  }
  /** KVGS một bước (POST /api/KVGS): loại hàng theo kịch bản `kvgsKind` (mặc định CONTAINER – API thật tự quyết theo tờ khai). */
  /** Định danh: số 12 chữ số theo MST + ngày (deterministic), ảnh QR mô phỏng; MST bắt đầu bằng 9 → từ chối (tranG_THAI 10). */
  private identifierOutcome(req: IdentifierGatewayRequest, refId: string): IdentifierGatewayResult {
    const receipt = { refId, receiptNo: String(hashId(refId) % 1_000_000_000_000).padStart(12, "0"), receiptDate: this.today() };
    if (req.taxCode.startsWith("9")) return { state: "REJECTED", ...receipt, customsState: "10", resultText: "Doanh nghiệp không đủ điều kiện cấp số định danh", errors: [{ code: "E-IDENT-REJ", field: "MA_DV", message: "Doanh nghiệp không đủ điều kiện cấp số định danh", solution: "Kiểm tra mã số thuế" }] };
    const no = `1226${String(hashId(req.taxCode + refId) % 100_000_000_000).padStart(11, "0")}`;
    return { state: "ACCEPTED", ...receipt, customsState: "15", identifierNo: no, identifiedOn: this.today(), qrPng: FAKE_BARCODE_PNG, resultText: `Số định danh là [${no}]` };
  }
  async sendIdentifier(_orgId: string, req: IdentifierGatewayRequest, _idempotencyKey?: string): Promise<IdentifierGatewayResult> {
    this.identifierCalls.push(req);
    const refId = `FAKE-DD-${++this.refSeq}-${hashId(req.taxCode)}`;
    if (this.opts.identifierMode === "ASYNC") {
      this.identifierRefs.set(refId, req);
      return { state: "PENDING", refId, customsState: "11" };
    }
    return this.identifierOutcome(req, refId);
  }
  async identifierResult(_orgId: string, req: IdentifierGatewayRequest & { refId: string }): Promise<IdentifierGatewayResult> {
    if (this.pending(req.refId)) return { state: "PENDING", refId: req.refId, customsState: "12" };
    return this.identifierOutcome(this.identifierRefs.get(req.refId) ?? req, req.refId);
  }
  async fetchKvgs(_orgId: string, req: KvgsGatewayRequest, _idempotencyKey?: string): Promise<KvgsFetchResult> {
    this.kvgsCalls.push(req);
    const outcome = this.opts.kvgsOutcome ?? "ACCEPTED";
    if (outcome === "REJECTED") {
      const errors = [{ code: "E-KVGS-001", message: "Tờ khai chưa đủ điều kiện qua khu vực giám sát", solution: "Kiểm tra trạng thái tờ khai" }];
      return { state: "REJECTED", errors, raw: { errorList: [{ errorCode: "E-KVGS-001", indexCode: "000", nameCode: "000", errorContent: errors[0]!.message, proposedSolution: errors[0]!.solution, rowPosition: "0" }], serviceMessage: null } };
    }
    if (outcome === "INCOMPLETE") return { state: "REJECTED", raw: { errorList: [], serviceMessage: { soToKhai: req.declarationNo, soDinhDanh: null } }, errors: [{ code: "KVGS_RESPONSE_INCOMPLETE", message: "Phản hồi của Hải quan thiếu thông tin để in (soDinhDanh)" }] };
    const kind = this.opts.kvgsKind ?? "CONTAINER";
    const sheet: KvgsSheet = {
      kind, regionOffice: "Chi cục Hải quan khu vực II (mô phỏng)", customsOffice: "Hải quan cửa khẩu cảng Sài Gòn khu vực 1 (mô phỏng)", supervisionOffice: "Hải quan cửa khẩu cảng Sài Gòn khu vực 1 - 02CIS01: Kho mô phỏng",
      sealRequired: kind === "CONTAINER", companyName: "CONG TY MO PHONG", taxCode: req.taxCode, declarationNo: req.declarationNo, declarationStatus: "Thông quan", declarationDate: req.registeredOn, declarationDateTo: null,
      typeName: "Nhập kinh doanh", channel: "Xanh", cargoControlNo: `${req.declarationNo.slice(0, 6)}000001`, barcode: kind === "CARGO" ? req.declarationNo : null,
      containers: kind === "CONTAINER" ? [{ containerNo: "FBIU5802429", sealNo: "SEAL0001", customsSealNo: "HQ000001", barcodeImage: FAKE_BARCODE_PNG }] : [],
      cargo: { quantity: "10", quantityUnit: "CTN", grossWeight: "125.5", weightUnit: "KGM" },
      exportedAt: (this.opts.clock ?? systemClock).now().toISOString(),
    };
    return { state: "ACCEPTED", sheet, raw: { errorList: [], serviceMessage: { soToKhai: req.declarationNo, isContainer: kind === "CONTAINER" ? 1 : 0 } } };
  }

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
  async declare(orgId: string, msg: { kind: "IDC" | "EDC"; externalId: string; dossierId: string }) {
    const channel = this.channelFor(msg.dossierId);
    const kind = msg.kind === "IDC" ? "IDA" : "EDA";
    this.registered.set(`${orgId}|${this.declarationNoFor(msg.dossierId, kind)}`, { orgId, dossierId: msg.dossierId, kind, pulls: 0 });
    return {
      accepted: true, channel,
      info: info({ registeredDate: "2026-10-14", registeredTime: "10:00:00", inspectionCode: INSPECTION[channel], ...(channel === "GREEN" ? {} : { directives: [{ title: "Nộp chứng từ", content: "Nộp bộ chứng từ qua HYS" }] }) }),
    };
  }
  /** HYS: số tiếp nhận 12 ký tự "3" + 11 chữ số, ngày tiếp nhận theo clock (giờ VN, YYYY-MM-DD). */
  async attachDocuments(_orgId: string, req: HysGatewayRequest, idempotencyKey: string): Promise<HysGatewayResult> {
    this.hysCalls.push(req);
    const n = (this.hysAttempts.get(req.dossierId) ?? 0) + 1;
    this.hysAttempts.set(req.dossierId, n);
    if ((this.opts.flakyHys ?? true) && n === 1 && hashId(req.dossierId) % 7 === 0) return { errors: [{ code: "E-SIG-401", message: "Phiên ký số hết hạn", solution: "Ký lại bằng chứng thư số và gửi lại HYS" }] };
    if (req.files.length === 0) return { errors: [{ code: "E-HYS-000", message: "Không có tệp đính kèm", solution: "Tải chứng từ lên hồ sơ" }] };
    if (this.opts.rejectHys) return { errors: [{ code: "E-HYS-TSB", field: "TK_TSB", message: "Phân loại thủ tục không phù hợp", solution: "Chọn đúng mã thủ tục HYS" }] };
    const vn = new Date((this.opts.clock ?? systemClock).now().getTime() + 7 * 3_600_000);
    return { receiptNo: `3${String(hashId(`${req.dossierId}:${idempotencyKey}`) % 100_000_000_000).padStart(11, "0")}`, registeredOn: vn.toISOString().slice(0, 10) };
  }
  /** Nghiệp vụ còn lại của luồng (mô phỏng): gọi sửa, khai tạm/chính thức sửa đổi, container qua KVGS, lệ phí cảng biển (số tiền KHÔNG phải biểu phí thật). */
  async send(orgId: string, msg: { op: CustomsOperation; externalId: string; dossierId: string; request?: unknown }): Promise<GatewaySendResult> {
    const ref = (prefix: string) => `${prefix}${String(hashId(msg.dossierId + msg.op + (this.sends.get(msg.dossierId) ?? 0)) % 100_000_000).padStart(8, "0")}`;
    this.sends.set(msg.dossierId, (this.sends.get(msg.dossierId) ?? 0) + 1);
    switch (msg.op) {
      case "IDB": case "EDB": case "IDD": case "EDD": case "AMB":
        return { note: "Hải quan cho phép gọi tờ khai về để sửa" };
      case "IDA01": case "EDA01": case "AMA":
        return { receiptNo: ref("SD"), note: "Hải quan tiếp nhận bản khai tạm sửa đổi" };
      case "IDE": case "EDE": {
        // Khai chính thức sửa đổi → lại chờ thông quan (job customs-poll) → VNACCSREP mô phỏng báo lại.
        const kind = msg.op === "IDE" ? "IDA" : "EDA";
        this.registered.set(`${orgId}|${this.declarationNoFor(msg.dossierId, kind)}`, { orgId, dossierId: msg.dossierId, kind, pulls: 0 });
      }
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

  /** Tờ khai đã khai chính thức (IDC/EDC), chờ thông điệp VNACCSREP – khóa `orgId|số tờ khai`. */
  private registered = new Map<string, { orgId: string; dossierId: string; kind: "IDA" | "EDA"; pulls: number }>();
  /**
   * VNACCSREP mô phỏng: lượt lấy đầu sau khai chính thức → thông điệp phân luồng; luồng xanh thông quan ngay, vàng/đỏ thông quan
   * ở lượt lấy thứ `clearAfterPolls` (mặc định 3). Đã báo thông quan thì thôi trả (FPT không trả lại thông điệp đã lấy).
   * Giới hạn: lô nhiều tờ dùng chung số tờ khai mô phỏng → thông điệp chỉ khớp một tờ (bấm "Tra cứu trạng thái" cho các tờ còn lại).
   */
  async pullMessages(orgId: string): Promise<GatewayMessage[]> {
    const out: GatewayMessage[] = [];
    for (const [key, d] of this.registered) {
      if (d.orgId !== orgId) continue;
      d.pulls += 1;
      const channel = this.channelFor(d.dossierId);
      const cleared = channel === "GREEN" || d.pulls >= (this.opts.clearAfterPolls ?? 3);
      const declarationNo = key.slice(orgId.length + 1);
      const prefix = d.kind === "IDA" ? "VAD1" : "VAE1";
      if (cleared) {
        this.registered.delete(key);
        out.push({ kind: d.kind, code: `${prefix}LF0`, name: "Thông quan", declarationNo, status: { status: "Đã thông quan", cleared: true, channel, info: info({ permitDate: "2026-10-14", permitTime: "11:00:00" }) } });
      } else if (d.pulls === 1) {
        out.push({ kind: d.kind, code: `${prefix}LD0`, name: "Phân luồng", declarationNo, status: { status: channel === "YELLOW" ? "Chờ kiểm tra chi tiết hồ sơ" : "Chờ kiểm tra thực tế hàng hóa", cleared: false, channel } });
      }
    }
    return out;
  }

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
