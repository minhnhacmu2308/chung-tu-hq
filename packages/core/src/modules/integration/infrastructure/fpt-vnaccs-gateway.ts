// Adapter FPT.VNACCS: dựng/kiểm payload bằng Zod của @kb/contracts/fpt; phần HTTP (đăng nhập, token, đường dẫn) cô lập trong FptHttpClient.
// Vỏ phản hồi theo mẫu thật (docdungapivnacss): { objVNACCS_ACCOUNT, errorList, objIDA: [...], objEDA: [...], ... };
// mỗi phần tử objEDA/objIDA = { objMsgResult, objVN_<KIND>, objVN_<KIND>_TRANGTHAI, … }.
// externalId = số tờ khai VNACCS (tK_ECN/tK_ICN) – gọi lại/đăng ký/tra cứu theo số này. Đặc tả từng nghiệp vụ: docs/vnaccs-api
// (nguồn lệch nhau: phản hồi thật > Excel đặc tả > Postman). Mã thông điệp theo REP_VNACCS.
import { AmaRequestSchema, EdaRequestSchema, FPT_DECLARATION_STATES, FptResponseEnvelopeSchema, HYS_LIST_FILE_KEY, HysRequestSchema, HysResponseSchema, IdaRequestSchema, type CustomsOperation, type FptVnaccsCredentials } from "@kb/contracts";
import { z } from "zod";
import { domainError } from "../../../shared/errors.js";
import type { CustomsGateway, GatewayError, GatewayMessage, GatewaySendResult, GatewayStatus, HysGatewayRequest, HysGatewayResult } from "../application/customs-ports.js";
import { parseCustomsInfo } from "../domain/customs-info.js";
import { describeSchemaIssue } from "../domain/schema-issues.js";

export type FptOperation =
  | "IDA" | "IDB" | "IDC" | "IDD" | "IDA01" | "IDE" | "IID"
  | "EDA" | "EDB" | "EDC" | "EDD" | "EDA01" | "EDE" | "IEX"
  | "AMA" | "AMB" | "AMC" | "HYS" | "VNACCSREP";
export interface FptHttpClient {
  /** Gửi `body` (client tự thêm `objVNACCS_ACCOUNT` + token); trả JSON thô. */
  post(op: FptOperation, body: unknown, creds: FptVnaccsCredentials): Promise<unknown>;
}
export interface VnaccsCredentialsReader {
  get(orgId: string): Promise<FptVnaccsCredentials | null>;
}

/** Chưa cấu hình HTTP: mọi lời gọi đều báo lỗi nghiệp vụ rõ ràng, không retry. */
export class FptHttpClientStub implements FptHttpClient {
  async post(op: FptOperation): Promise<never> {
    throw domainError("GATEWAY_ERROR", `Chưa cấu hình HTTP FPT.VNACCS cho ${op} – đặt FPT_API_BASE_URL/FPT_API_USERNAME/FPT_API_PASSWORD (dev: apps/fpt-mock)`);
  }
}

type Obj = Record<string, unknown>;
const ResultItemSchema = z.looseObject({ objMsgResult: z.looseObject({ decNumber: z.string().nullish(), code: z.string().nullish(), name: z.string().nullish() }).nullish() });
/** Phần tử đầu của objEDA/objIDA (FPT trả mảng, mỗi lần gửi một tờ khai). */
const firstResult = (env: Obj): { kind: "IDA" | "EDA"; item: Obj } | null => {
  for (const kind of ["EDA", "IDA"] as const) {
    const list = env[`obj${kind}`];
    if (Array.isArray(list) && list[0] && typeof list[0] === "object") return { kind, item: ResultItemSchema.parse(list[0]) as Obj };
  }
  return null;
};
const sub = (item: Obj | undefined, key: string) => ((item?.[key] ?? {}) as Obj);
const toErrors = (env: { errorList?: { errorCode?: string | null | undefined; indexCode?: string | null | undefined; errorContent?: string | null | undefined; proposedSolution?: string | null | undefined; rowPosition?: string | null | undefined }[] | null | undefined }): GatewayError[] | undefined =>
  env.errorList?.length
    ? env.errorList.map((e) => ({
        code: e.errorCode ?? "FPT",
        ...(e.indexCode ? { field: e.indexCode } : {}),
        message: `${(e.errorContent ?? "Lỗi FPT").trim()}${e.rowPosition && e.rowPosition !== "0000" ? ` (dòng hàng ${Number(e.rowPosition)})` : ""}`,
        ...(e.proposedSolution ? { solution: e.proposedSolution.trim() } : {}),
        ...(e.rowPosition && Number(e.rowPosition) > 0 ? { line: Number(e.rowPosition) } : {}),
      }))
    : undefined;
const channelOf = (luong: unknown): "GREEN" | "YELLOW" | "RED" | undefined => {
  const n = Number(luong ?? 0);
  return n === 1 ? "GREEN" : n === 2 ? "YELLOW" : n === 3 ? "RED" : undefined;
};
const numberField = (kind: "IDA" | "EDA") => (kind === "IDA" ? "tK_ICN" : "tK_ECN");
/** Chiều của nghiệp vụ tờ khai: E… = xuất (EDA, EDB…, IEX), còn lại nhập. */
const kindOfOp = (op: string): "IDA" | "EDA" => (op.startsWith("E") || op === "IEX" ? "EDA" : "IDA");
/** Số tờ khai VNACCS: tờ khai xuất bắt đầu bằng 3, nhập bằng 1 (quy ước đánh số VNACCS). */
const directionOfNo = (no: string): "NK" | "XK" => (no.trim().startsWith("3") ? "XK" : "NK");
const msgOf = (item: Obj | undefined) => (item?.["objMsgResult"] ?? {}) as Obj;
/** Ngày FPT `dd/MM/yyyy` (có thể kèm giờ phía sau) → `YYYY-MM-DD`; dạng khác → không có. */
const fptDateToIso = (v: unknown): string | undefined => {
  const m = typeof v === "string" ? /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim()) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};

export class FptVnaccsGateway implements CustomsGateway {
  readonly name = "fpt-vnaccs";
  constructor(private http: FptHttpClient, private creds: VnaccsCredentialsReader) {}
  private async credsFor(orgId: string) {
    const c = await this.creds.get(orgId);
    if (!c) throw domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình tài khoản VNACCS (USER_ID, PASSWORD, TERMINAL_ID, TERMINAL_ACCESS_KEY) ở Tài khoản & tích hợp");
    return c;
  }
  private async call(orgId: string, op: FptOperation, body: unknown) {
    const env = FptResponseEnvelopeSchema.parse(await this.http.post(op, body, await this.credsFor(orgId)));
    return { env: env as Obj, errors: toErrors(env), result: firstResult(env as Obj) };
  }

  async preDeclare(orgId: string, msg: { kind: "IDA" | "EDA"; request: unknown }) {
    const parsed = (msg.kind === "IDA" ? IdaRequestSchema : EdaRequestSchema).safeParse(msg.request);
    if (!parsed.success) return { externalId: "", errors: parsed.error.issues.map(describeSchemaIssue) };
    const { errors, result } = await this.call(orgId, msg.kind, parsed.data);
    if (errors) return { externalId: "", errors };
    const head = sub(result?.item, `objVN_${msg.kind}`);
    const no = String(head[numberField(msg.kind)] ?? (result?.item["objMsgResult"] as Obj | undefined)?.["decNumber"] ?? "");
    if (!no) return { externalId: "", errors: [{ code: "E-FPT-NO-NUMBER", message: "FPT trả thành công nhưng không có số tờ khai", solution: "Tra cứu trạng thái hoặc liên hệ FPT" }] };
    return { externalId: no, declarationNo: no, ...(result ? { info: parseCustomsInfo(result.kind, result.item, new Date()) } : {}) };
  }

  async declare(orgId: string, msg: { kind: "IDC" | "EDC"; externalId: string }) {
    const kind = msg.kind === "IDC" ? "IDA" : "EDA";
    const no = declarationNoOf(msg.externalId);
    if (!no) return { accepted: false, errors: [noNumberError(msg.kind)] };
    const { errors, result } = await this.call(orgId, msg.kind, { [numberField(kind)]: Number(no) });
    if (errors) return { accepted: false, errors };
    const channel = channelOf(sub(result?.item, `objVN_${kind}_TRANGTHAI`)["tK_LUONG"]);
    return { accepted: true, ...(channel ? { channel } : {}), ...(result ? { info: parseCustomsInfo(result.kind, result.item, new Date()) } : {}) };
  }

  /** HYS (VNACCS_HYS v1.2): bộ → HysRequestSchema (kiểm trước khi gửi); phản hồi → HysResponseSchema (tK_JNO, tK_YMD dd/MM/yyyy → YYYY-MM-DD). */
  async attachDocuments(orgId: string, req: HysGatewayRequest): Promise<HysGatewayResult> {
    const body = {
      tK_CH: req.customsOffice, tK_CHB: req.processingUnit, tK_TSB: req.procedureCode, tK_STL: req.phone ?? "", tK_REF: req.internalRef ?? "", tK_KJJ: req.note ?? "",
      [HYS_LIST_FILE_KEY]: req.files.map((f) => ({ filE_NAME: f.name, filE_BASE64: f.bytes.toString("base64") })),
    };
    // Tài khoản VNACCS là chỉ tiêu bắt buộc của sheet HYS; client gửi trong objVNACCS_ACCOUNT – ở đây chỉ để kiểm đủ schema.
    const parsed = HysRequestSchema.safeParse({ ...(await this.credsFor(orgId)), ...body });
    if (!parsed.success) return { errors: parsed.error.issues.map(describeSchemaIssue) };
    const { env, errors } = await this.call(orgId, "HYS", body);
    if (errors) return { errors };
    // Chỉ tiêu vô hướng FPT trả dạng số (tK_JNO, tK_STL…) → chuỗi. Phản hồi vẫn sai dạng → lỗi VĨNH VIỄN (DomainError):
    // Hải quan có thể đã tiếp nhận – không để worker coi là lỗi tạm và gửi lại thông điệp.
    const response = HysResponseSchema.safeParse(Object.fromEntries(Object.entries(env).map(([k, v]) => [k, typeof v === "number" ? String(v) : v])));
    if (!response.success) throw domainError("GATEWAY_ERROR", `Phản hồi HYS của FPT không đúng định dạng (${response.error.issues.map((i) => i.path.join(".")).join(", ")}) – tra cứu số tiếp nhận trên VNACCS rồi nhập tay vào 1.63, không gửi lại`);
    const res = response.data;
    const registeredOn = fptDateToIso(res.tK_YMD);
    return { ...(res.tK_JNO ? { receiptNo: String(res.tK_JNO) } : {}), ...(registeredOn ? { registeredOn } : {}) };
  }

  /**
   * Nghiệp vụ còn lại (Postman FPT 21/04/2026 + Excel đặc tả):
   * - gọi lại IDB/EDB (tờ khai tạm) · IDD/EDD (tờ khai đã đăng ký) – body số tờ khai;
   * - khai tạm sửa đổi IDA01/EDA01 – như IDA/EDA, head mang số tờ khai;
   * - đăng ký sửa đổi IDE/EDE – body số tờ khai, trả phân luồng;
   * - AMA (objVN_AMA + objVN_AMA_HANG, VNACCS_AMA v1.4) → số tờ khai bổ sung tK_SYN; AMB/AMC – body tK_SYN.
   * Container qua khu vực giám sát / lệ phí cảng: chưa nối (V5ContainerReq, KVGS – docs/vnaccs-api).
   */
  async send(orgId: string, msg: { op: CustomsOperation; externalId?: string; request?: unknown }): Promise<GatewaySendResult> {
    const op = msg.op;
    if (op === "AMA") {
      const parsed = AmaRequestSchema.safeParse(msg.request);
      if (!parsed.success) return { errors: parsed.error.issues.map(describeSchemaIssue) };
      const { env, errors } = await this.call(orgId, "AMA", parsed.data);
      if (errors) return { errors };
      const list = env["objAMA"];
      const head = Array.isArray(list) && list[0] && typeof list[0] === "object" ? sub(list[0] as Obj, "objVN_AMA") : {};
      const syn = head["tK_SYN"];
      return { ...(syn ? { receiptNo: String(syn) } : {}), note: "Hải quan tiếp nhận bản khai bổ sung" };
    }
    if (op === "AMB" || op === "AMC") {
      const syn = declarationNoOf(String((msg.request as Obj | undefined)?.["tK_SYN"] ?? ""));
      if (!syn) return { errors: [{ code: "E-AMA-NO-SYN", message: `${op}: chưa có số tờ khai bổ sung (tK_SYN) – khai AMA trước` }] };
      const { errors } = await this.call(orgId, op, { tK_SYN: Number(syn) });
      if (errors) return { errors };
      return { receiptNo: syn, note: op === "AMB" ? "Đã gọi bản khai bổ sung về sửa" : "Hải quan đã đăng ký bản khai bổ sung" };
    }
    if (op === "IDB" || op === "EDB" || op === "IDD" || op === "EDD") {
      const kind = kindOfOp(op);
      const no = declarationNoOf(msg.externalId);
      if (!no) return { errors: [noNumberError(op)] };
      const { errors, result } = await this.call(orgId, op, { [numberField(kind)]: Number(no) });
      if (errors) return { errors };
      const code = msgOf(result?.item)["code"];
      return { note: `${op === "IDB" || op === "EDB" ? "Đã gọi tờ khai tạm về sửa" : "Đã gọi tờ khai về sửa đổi bổ sung"}${code ? ` (${String(code)})` : ""}` };
    }
    if (op === "IDA01" || op === "EDA01") {
      const kind = kindOfOp(op);
      const no = declarationNoOf(msg.externalId);
      if (!no) return { errors: [noNumberError(op)] };
      const parsed = (kind === "IDA" ? IdaRequestSchema : EdaRequestSchema).safeParse(msg.request);
      if (!parsed.success) return { errors: parsed.error.issues.map(describeSchemaIssue) };
      // Khai tạm sửa đổi: cùng cấu trúc IDA/EDA, đầu tờ khai mang số tờ khai đã đăng ký.
      const body = parsed.data as Obj;
      const head = { ...((body[`objVN_${kind}`] ?? {}) as Obj), [numberField(kind)]: Number(no) };
      const { errors } = await this.call(orgId, op, { ...body, [`objVN_${kind}`]: head });
      if (errors) return { errors };
      return { note: "Hải quan tiếp nhận khai tạm sửa đổi" };
    }
    if (op === "IDE" || op === "EDE") {
      const kind = kindOfOp(op);
      const no = declarationNoOf(msg.externalId);
      if (!no) return { errors: [noNumberError(op)] };
      const { errors, result } = await this.call(orgId, op, { [numberField(kind)]: Number(no) });
      if (errors) return { errors };
      const channel = channelOf(sub(result?.item, `objVN_${kind}_TRANGTHAI`)["tK_LUONG"]);
      return { ...(channel ? { channel } : {}), note: "Hải quan đăng ký sửa đổi bổ sung" };
    }
    throw domainError("NOT_SUPPORTED", `Nghiệp vụ ${op} chưa kết nối FPT.VNACCS – thực hiện trên phần mềm khai báo`);
  }

  /** IID (nhập, body tK_ICN) / IEX (xuất, body tK_ECN) – theo Postman FPT; trạng thái theo VN_IDA/EDA_TRANGTHAI. */
  async queryStatus(orgId: string, externalId: string, _dossierId?: string, direction?: "NK" | "XK"): Promise<GatewayStatus> {
    const dir = direction ?? directionOfNo(externalId);
    const op = dir === "XK" ? "IEX" : "IID";
    const no = declarationNoOf(externalId);
    if (!no) throw domainError("GATEWAY_ERROR", `Tra cứu: số tờ khai "${externalId}" không hợp lệ`);
    const { errors, result } = await this.call(orgId, op, { [numberField(dir === "XK" ? "EDA" : "IDA")]: Number(no) });
    if (errors) throw domainError("GATEWAY_ERROR", `Tra cứu tờ khai ${externalId} lỗi: ${errors.map((e) => `${e.code}: ${e.message}`).join("; ")}`);
    if (!result) throw domainError("GATEWAY_ERROR", `FPT không trả thông tin tờ khai ${externalId}`);
    return statusOf(result.kind, result.item);
  }

  /** VNACCSREP: thông điệp loại P của tài khoản VNACCS (objIDA/objEDA/objAMA, mỗi phần tử có objMsgResult). Lỗi tài khoản → ném (người gọi bỏ qua lượt này). */
  async pullMessages(orgId: string): Promise<GatewayMessage[]> {
    const env = FptResponseEnvelopeSchema.parse(await this.http.post("VNACCSREP", {}, await this.credsFor(orgId))) as Obj;
    const errors = toErrors(env as Parameters<typeof toErrors>[0]);
    if (errors) throw domainError("GATEWAY_ERROR", `Lấy thông điệp Hải quan lỗi: ${errors.map((e) => `${e.code}: ${e.message}`).join("; ")}`);
    const out: GatewayMessage[] = [];
    for (const kind of ["IDA", "EDA", "AMA"] as const) {
      const list = env[`obj${kind}`];
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Obj;
        const m = msgOf(item);
        const head = sub(item, `objVN_${kind}`);
        const no = String(kind === "AMA" ? head["tK_SYN"] ?? m["decNumber"] ?? "" : head[numberField(kind)] ?? m["decNumber"] ?? "");
        if (!no) continue;
        out.push({ kind, code: String(m["code"] ?? ""), name: String(m["name"] ?? ""), declarationNo: no, ...(m["time"] ? { at: String(m["time"]) } : {}), ...(kind === "AMA" ? {} : { status: statusOf(kind, item) }) });
      }
    }
    return out;
  }
}

/** Trạng thái tờ khai từ một phần tử objIDA/objEDA (TRANGTHAI: T/A/C/TE/A01/E/R, luồng, thông quan). */
function statusOf(kind: "IDA" | "EDA", item: Obj): GatewayStatus {
  const tt = sub(item, `objVN_${kind}_TRANGTHAI`);
  const no = sub(item, `objVN_${kind}`)[numberField(kind)];
  const code = String(tt["tK_TRANGTHAI"] ?? "");
  const cleared = Number(tt["tK_THONGQUAN"] ?? 0) === 1;
  const channel = channelOf(tt["tK_LUONG"]);
  const label = cleared ? "Đã thông quan" : (FPT_DECLARATION_STATES as Record<string, string>)[code] ?? code;
  return { status: label, cleared, info: parseCustomsInfo(kind, item, new Date()), ...(code === "R" ? { rejected: true } : {}), ...(no ? { declarationNo: String(no) } : {}), ...(channel ? { channel } : {}) };
}

/** Số tờ khai gửi FPT (FPT nhận kiểu số): thiếu hoặc không phải chữ số → null (báo lỗi tại chỗ, không gửi tK_…: 0). */
function declarationNoOf(externalId: string | null | undefined): string | null {
  const s = String(externalId ?? "").trim();
  return /^\d+$/.test(s) ? s : null;
}
const noNumberError = (op: string): GatewayError => ({ code: "E-NO-DECLARATION-NO", message: `${op}: chưa có số tờ khai – khai tạm (IDA/EDA) trước`, solution: "Tra cứu trạng thái tờ khai hoặc khai lại" });
