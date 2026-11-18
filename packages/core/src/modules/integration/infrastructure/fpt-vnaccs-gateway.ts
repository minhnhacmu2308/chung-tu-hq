// Adapter FPT.VNACCS: dựng/kiểm payload bằng Zod của @kb/contracts/fpt; phần HTTP (đăng nhập, token, đường dẫn) cô lập trong FptHttpClient.
// Vỏ phản hồi theo mẫu thật (docdungapivnacss): { objVNACCS_ACCOUNT, errorList, objIDA: [...], objEDA: [...], ... };
// mỗi phần tử objEDA/objIDA = { objMsgResult, objVN_<KIND>, objVN_<KIND>_TRANGTHAI, … }.
// externalId = số tờ khai VNACCS (tK_ECN/tK_ICN) – gọi lại/đăng ký/tra cứu theo số này. Đặc tả từng nghiệp vụ: docs/vnaccs-api
// (nguồn lệch nhau: phản hồi thật > Excel đặc tả > Postman). Mã thông điệp theo REP_VNACCS.
import { AmaRequestSchema, shapeAmaBody, FPT_DECLARATION_STATES, FptIdentifierQuerySchema, FptIdentifierRequestSchema, FptKvgsRequestSchema, FptRefIdResponseSchema, FptResponseEnvelopeSchema, HYS_LIST_FILE_KEY, HysRequestSchema, HysResponseSchema, V5ContainerResSchema, V5IdentifierResSchema, type CustomsOperation, type FptVnaccsCredentials } from "@kb/contracts";
import { z } from "zod";
import { domainError } from "../../../shared/errors.js";
import type { ContainerListGatewayRequest, CustomsGateway, GatewayError, GatewayMessage, GatewaySendResult, GatewayStatus, HysGatewayRequest, HysGatewayResult, IdentifierGatewayRequest, IdentifierGatewayResult, KvgsFetchResult, KvgsGatewayRequest, RefResult } from "../application/customs-ports.js";
import { parseCustomsInfo } from "../domain/customs-info.js";
import { identifierState } from "../domain/identifier.js";
import { describeSchemaIssue } from "../domain/schema-issues.js";
import { fptContentBody, fptNumberField } from "../domain/fpt-content-body.js";
import { fptErrorCode, mapKvgsResponse } from "./kvgs-mapper.js";

export type FptOperation =
  | "IDA" | "IDB" | "IDC" | "IDD" | "IDA01" | "IDE" | "IID"
  | "EDA" | "EDB" | "EDC" | "EDD" | "EDA01" | "EDE" | "IEX"
  | "AMA" | "AMB" | "AMC" | "HYS" | "VNACCSREP" | "V5ContainerReq" | "V5ContainerRes" | "V5IdentifierReq" | "V5IdentifierRes" | "KVGS";
/** Lời gọi của doanh nghiệp / hồ sơ nào – cho nhật ký gỡ lỗi (FPT_DEBUG_TRACE). Không có dossierId = lời gọi chung (VNACCSREP). */
export type FptCallMeta = { orgId: string; dossierId?: string };
export interface FptHttpClient {
  /**
   * Gửi `body` (client tự thêm `objVNACCS_ACCOUNT` + token); trả JSON thô. `creds` = tài khoản VNACCS của doanh nghiệp: null chỉ hợp lệ với nghiệp vụ body phẳng
   * (V5Container…, KVGS – không gửi tài khoản); nghiệp vụ khác thiếu `creds` → INTEGRATION_NOT_CONFIGURED.
   */
  post(op: FptOperation, body: unknown, creds: FptVnaccsCredentials | null, meta?: FptCallMeta): Promise<unknown>;
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
/**
 * Cách nhận ra kết quả của chính tờ khai vừa gửi: khai tạm lần đầu (IDA/EDA – chưa có số) theo TK_ID ta gửi kèm; các nghiệp vụ sau theo số tờ khai.
 * API FPT hút cả hộp thư VNACCS trong mỗi lời gọi nên objIDA/objEDA/objAMA có thể kèm thông điệp của tờ khai khác – không lấy phần tử đầu.
 */
type ResultMatch = { tkId: string } | { no: string };
const textOf = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
/** Phần tử objIDA/objEDA của tờ khai cần tìm (theo `match`); không có → null. Chỉ xét danh sách đúng chiều `kind`. */
const resultFor = (env: Obj, kind: "IDA" | "EDA", match: ResultMatch): { kind: "IDA" | "EDA"; item: Obj } | null => {
  const list = env[`obj${kind}`];
  if (!Array.isArray(list)) return null;
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const item = x as Obj;
    const head = sub(item, `objVN_${kind}`);
    const hit = "tkId" in match
      ? textOf(head["tK_ID"]) === match.tkId
      : repNo(head[numberField(kind)]) === match.no || repNo(msgOf(item)["decNumber"]) === match.no;
    if (hit) return { kind, item };
  }
  return null;
};
const sub = (item: Obj | undefined, key: string) => ((item?.[key] ?? {}) as Obj);
const toErrors = (env: { errorList?: { errorCode?: string | null | undefined; indexCode?: string | null | undefined; errorContent?: string | null | undefined; proposedSolution?: string | null | undefined; rowPosition?: string | null | undefined }[] | null | undefined }): GatewayError[] | undefined =>
  env.errorList?.length
    ? env.errorList.map((e) => ({
        code: fptErrorCode(e.errorCode ?? "FPT", e.errorContent ?? ""),
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
const numberField = fptNumberField;
/** Chiều của nghiệp vụ tờ khai: E… = xuất (EDA, EDB…, IEX), còn lại nhập. */
const kindOfOp = (op: string): "IDA" | "EDA" => (op.startsWith("E") || op === "IEX" ? "EDA" : "IDA");
/** Số tờ khai VNACCS: tờ khai xuất bắt đầu bằng 3, nhập bằng 1 (quy ước đánh số VNACCS). */
const directionOfNo = (no: string): "NK" | "XK" => (no.trim().startsWith("3") ? "XK" : "NK");
const msgOf = (item: Obj | undefined) => (item?.["objMsgResult"] ?? {}) as Obj;

// ---------------------------------------------------------------- VNACCSREP
/** objMsgResult của một phần tử VNACCSREP (C# MsgResult: Time = giờ máy chủ FPT lúc xử lý, DecNumber = tiêu đề thông điệp). Sai kiểu → coi như trống. */
const RepMsgSchema = z.looseObject({
  code: z.string().nullish(), name: z.string().nullish(), type: z.string().nullish(), time: z.string().nullish(),
  decNumber: z.union([z.string(), z.number()]).nullish(), ediBase64: z.string().nullish(),
});
const RepItemSchema = z.looseObject({ objMsgResult: RepMsgSchema.nullish().catch(null) });
type RepItem = z.infer<typeof RepItemSchema>;
type RepMsg = z.infer<typeof RepMsgSchema>;
/** Khối thông báo trong phản hồi VNACCSREP (C# objVnaccsList) → loại + trường số (đặc tả docs/vnaccs-api: số tờ khai tK_ICN/tK_ECN, kiểm tra thực tế tK_K02, HYS số tiếp nhận tK_JNO). */
const REP_NOTICE_BLOCKS = [
  { key: "vaF8010", kind: "TAX", noField: "tK_ICN" },
  { key: "vaF8030", kind: "FEE", noField: "tK_ICN" },
  { key: "vaD8000", kind: "INSTRUCTION", noField: "tK_ICN", direction: "NK" },
  { key: "vaE8000", kind: "INSTRUCTION", noField: "tK_ECN", direction: "XK" },
  { key: "vaD4870", kind: "INSPECTION", noField: "tK_K02", direction: "NK" },
  { key: "vaE4740", kind: "INSPECTION", noField: "tK_K02", direction: "XK" },
  { key: "vaL0020", kind: "HYS", noField: "tK_JNO" },
] as const;
/** Danh sách phần tử của một khối (mảng; một đối tượng đơn cũng nhận). Phần tử không phải đối tượng bỏ qua (không có gì để giữ). */
const repItems = (v: unknown): RepItem[] => (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []).flatMap((x) => {
  const p = RepItemSchema.safeParse(x);
  return p.success ? [p.data] : [];
});
/** Số tờ khai / số tiếp nhận: FPT trả number (Decimal) hoặc chuỗi; số không nguyên / 0 / rỗng → "". */
const repNo = (v: unknown): string => {
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0 ? String(v) : "";
  if (typeof v === "string") return /^\d+$/.test(v.trim()) && Number(v.trim()) > 0 ? v.trim() : "";
  return "";
};
const repHead = (kind: GatewayMessage["kind"], m: RepMsg, no: string): GatewayMessage => ({
  kind, code: m.code ?? "", name: m.name ?? "", declarationNo: no, ...(m.time ? { at: m.time } : {}), ...(m.type ? { msgType: m.type } : {}), ...(m.ediBase64 ? { ediBase64: m.ediBase64 } : {}),
});
/** Nội dung thô để lưu hộp thư – bỏ ediBase64 (đã giữ riêng ở thông điệp). */
const repDetail = (item: RepItem): Record<string, unknown> => {
  const { objMsgResult, ...rest } = item;
  if (!objMsgResult) return rest;
  const { ediBase64: _edi, ...msg } = objMsgResult;
  return { ...rest, objMsgResult: msg };
};
/** Ngày FPT `dd/MM/yyyy` (có thể kèm giờ phía sau) → `YYYY-MM-DD`; dạng khác → không có. */
const fptDateToIso = (v: unknown): string | undefined => {
  const m = typeof v === "string" ? /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim()) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};

/** Ngày `YYYY-MM-DD` → `dd/MM/yyyy` (chỉ đổi định dạng ở cổng). */
const isoToFptDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

export class FptVnaccsGateway implements CustomsGateway {
  readonly name = "fpt-vnaccs";
  private readonly now: () => Date;
  constructor(private http: FptHttpClient, private creds: VnaccsCredentialsReader, opts: { now?: () => Date } = {}) {
    this.now = opts.now ?? (() => new Date());
  }
  private async credsFor(orgId: string) {
    const c = await this.creds.get(orgId);
    if (!c) throw domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình tài khoản VNACCS (USER_ID, PASSWORD, TERMINAL_ID, TERMINAL_ACCESS_KEY) ở Tài khoản & tích hợp");
    return c;
  }
  private async call(orgId: string, op: FptOperation, body: unknown, dossierId?: string) {
    const env = FptResponseEnvelopeSchema.parse(await this.http.post(op, body, await this.credsFor(orgId), { orgId, ...(dossierId ? { dossierId } : {}) }));
    return { env: env as Obj, errors: toErrors(env) };
  }

  /**
   * Khai tạm IDA/EDA. Lần đầu: đầu tờ khai không có số, chọn kết quả theo tK_ID (= `ref`). Khai tạm lại sau gọi sửa (IDB/EDB):
   * `declarationNo` = số đã cấp → gửi ở tK_ICN/tK_ECN (VNACCS hiểu là sửa đúng tờ khai tạm đó, không cấp số mới) và chọn kết quả theo số.
   */
  async preDeclare(orgId: string, msg: { kind: "IDA" | "EDA"; request: unknown; dossierId?: string; ref: string; declarationNo?: string }) {
    const sentNo = declarationNoOf(msg.declarationNo);
    const built = fptContentBody(msg.kind, msg.request, { ref: msg.ref, declarationNo: sentNo });
    if (!built.ok) return { externalId: "", errors: built.issues };
    const headKey = `objVN_${msg.kind}`;
    const { env, errors } = await this.call(orgId, msg.kind, built.body, msg.dossierId);
    if (errors) return { externalId: "", errors };
    const result = (sentNo ? resultFor(env, msg.kind, { no: sentNo }) : null) ?? resultFor(env, msg.kind, { tkId: msg.ref });
    const head = sub(result?.item, headKey);
    const no = repNo(head[numberField(msg.kind)]) || repNo(msgOf(result?.item)["decNumber"]);
    if (!no) return { externalId: "", errors: [{ code: "E-FPT-NO-NUMBER", message: `FPT trả thành công nhưng không có số tờ khai cho tờ này (TK_ID ${msg.ref})`, solution: "Tra cứu trạng thái hoặc liên hệ FPT" }] };
    return { externalId: no, declarationNo: no, ...(result ? { info: parseCustomsInfo(result.kind, result.item, new Date()) } : {}) };
  }

  async declare(orgId: string, msg: { kind: "IDC" | "EDC"; externalId: string; dossierId?: string }) {
    const kind = msg.kind === "IDC" ? "IDA" : "EDA";
    const no = declarationNoOf(msg.externalId);
    if (!no) return { accepted: false, errors: [noNumberError(msg.kind)] };
    const { env, errors } = await this.call(orgId, msg.kind, { [numberField(kind)]: Number(no) }, msg.dossierId);
    if (errors) return { accepted: false, errors };
    const result = resultFor(env, kind, { no });
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
    const { env, errors } = await this.call(orgId, "HYS", body, req.dossierId);
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
   * Lệ phí cảng: chưa nối. Container qua khu vực giám sát đi riêng (sendContainerList / containerListResult / fetchKvgs).
   */
  async send(orgId: string, msg: { op: CustomsOperation; externalId?: string; request?: unknown; dossierId?: string }): Promise<GatewaySendResult> {
    const op = msg.op;
    if (op === "AMA") {
      const parsed = AmaRequestSchema.safeParse(msg.request);
      if (!parsed.success) return { errors: parsed.error.issues.map(describeSchemaIssue) };
      // Đủ 79 / 120 key theo mẫu request FPT (ô trống vẫn gửi) – shapeAmaBody.
      const { env, errors } = await this.call(orgId, "AMA", shapeAmaBody(parsed.data as Record<string, unknown>), msg.dossierId);
      if (errors) return { errors };
      // Chọn bản khai bổ sung của chính tờ khai này: khai lại (đã có tK_SYN) theo tK_SYN, lần đầu theo số tờ khai gốc tK_ICN.
      const req = sub(parsed.data as Obj, "objVN_AMA");
      const wantSyn = repNo(req["tK_SYN"]);
      const wantIcn = repNo(req["tK_ICN"]) || declarationNoOf(msg.externalId);
      const list = Array.isArray(env["objAMA"]) ? (env["objAMA"] as unknown[]) : [];
      const head = list.map((x) => (x && typeof x === "object" ? sub(x as Obj, "objVN_AMA") : {}))
        .find((h) => (wantSyn ? repNo(h["tK_SYN"]) === wantSyn : false) || (!!wantIcn && repNo(h["tK_ICN"]) === wantIcn));
      const syn = repNo(head?.["tK_SYN"]);
      if (!syn) return { errors: [{ code: "E-AMA-NO-SYN", message: "FPT trả thành công nhưng không có số tờ khai bổ sung (tK_SYN) cho tờ khai này", solution: "Tra cứu thông điệp Hải quan hoặc liên hệ FPT – chưa có số thì không gửi AMB/AMC được" }] };
      return { receiptNo: syn, note: "Hải quan tiếp nhận bản khai bổ sung" };
    }
    if (op === "AMB" || op === "AMC") {
      const syn = declarationNoOf(String((msg.request as Obj | undefined)?.["tK_SYN"] ?? ""));
      if (!syn) return { errors: [{ code: "E-AMA-NO-SYN", message: `${op}: chưa có số tờ khai bổ sung (tK_SYN) – khai AMA trước` }] };
      const { errors } = await this.call(orgId, op, { tK_SYN: Number(syn) }, msg.dossierId);
      if (errors) return { errors };
      return { receiptNo: syn, note: op === "AMB" ? "Đã gọi bản khai bổ sung về sửa" : "Hải quan đã đăng ký bản khai bổ sung" };
    }
    if (op === "IDB" || op === "EDB" || op === "IDD" || op === "EDD") {
      const kind = kindOfOp(op);
      const no = declarationNoOf(msg.externalId);
      if (!no) return { errors: [noNumberError(op)] };
      const { env, errors } = await this.call(orgId, op, { [numberField(kind)]: Number(no) }, msg.dossierId);
      if (errors) return { errors };
      const result = resultFor(env, kind, { no });
      const code = msgOf(result?.item)["code"];
      return { note: `${op === "IDB" || op === "EDB" ? "Đã gọi tờ khai tạm về sửa" : "Đã gọi tờ khai về sửa đổi bổ sung"}${code ? ` (${String(code)})` : ""}` };
    }
    if (op === "IDA01" || op === "EDA01") {
      const kind = kindOfOp(op);
      const no = declarationNoOf(msg.externalId);
      if (!no) return { errors: [noNumberError(op)] };
      // Khai tạm sửa đổi: cùng cấu trúc IDA/EDA, đầu tờ khai mang số tờ khai đã đăng ký; chỉ thị CTHQ nguyên văn (fptContentBody).
      const built = fptContentBody(kind, msg.request, { declarationNo: no });
      if (!built.ok) return { errors: built.issues };
      const { errors } = await this.call(orgId, op, built.body, msg.dossierId);
      if (errors) return { errors };
      return { note: "Hải quan tiếp nhận khai tạm sửa đổi" };
    }
    if (op === "IDE" || op === "EDE") {
      const kind = kindOfOp(op);
      const no = declarationNoOf(msg.externalId);
      if (!no) return { errors: [noNumberError(op)] };
      const { env, errors } = await this.call(orgId, op, { [numberField(kind)]: Number(no) }, msg.dossierId);
      if (errors) return { errors };
      const result = resultFor(env, kind, { no });
      const channel = channelOf(sub(result?.item, `objVN_${kind}_TRANGTHAI`)["tK_LUONG"]);
      return { ...(channel ? { channel } : {}), note: "Hải quan đăng ký sửa đổi bổ sung" };
    }
    throw domainError("NOT_SUPPORTED", `Nghiệp vụ ${op} chưa kết nối FPT.VNACCS – thực hiện trên phần mềm khai báo`);
  }

  /**
   * V5ContainerReq (KHAI BAO DANH SACH CONTAINER v1.1): body phẳng (không objVNACCS_ACCOUNT, không mật khẩu), USER_ID = user id tài khoản VNACCS của doanh nghiệp,
   * ngày dd/MM/yyyy. Trả REF_ID.
   */
  async sendContainerList(orgId: string, req: ContainerListGatewayRequest, _idempotencyKey?: string): Promise<{ refId?: string; errors?: GatewayError[] }> {
    requireVnaccsUser(req.userId);
    const body = { ...containerListHead(req), hanG_CONT: req.rows.map((r) => ({ vD_SO: r.billNo, coN_SO: r.containerNo, seL_SO: r.sealNo, ghI_CHU: r.note ?? "" })) };
    const { env, errors } = await this.call(orgId, "V5ContainerReq", body, req.dossierId);
    if (errors) return { errors };
    const refId = FptRefIdResponseSchema.parse(env).reF_ID;
    if (!refId) return { errors: [{ code: "E-FPT-NO-REFID", message: "FPT trả thành công nhưng không có REF_ID", solution: "Khai lại danh sách container" }] };
    return { refId };
  }

  /** V5ContainerRes: head tờ khai + REF_ID + USER_ID, KHÔNG có dòng container. 12 → ACCEPTED, 10 → REJECTED (KET_QUA nếu errorList rỗng), 0/11 → PENDING. */
  async containerListResult(orgId: string, req: Omit<ContainerListGatewayRequest, "rows"> & { refId: string }): Promise<RefResult> {
    requireVnaccsUser(req.userId);
    const { env, errors } = await this.call(orgId, "V5ContainerRes", { ...containerListHead(req), reF_ID: req.refId }, req.dossierId);
    if (errors) return { state: "REJECTED", errors };
    const res = V5ContainerResSchema.safeParse(env);
    if (!res.success) throw domainError("GATEWAY_ERROR", "Phản hồi V5ContainerRes của FPT không đúng định dạng");
    const code = res.data.tranG_THAI ?? "";
    if (code === "12") {
      const receiptDate = fptDateToIso(res.data.ngaY_TN);
      return { state: "ACCEPTED", ...(res.data.sO_TN ? { receiptNo: res.data.sO_TN } : {}), ...(receiptDate ? { receiptDate } : {}) };
    }
    if (code === "10") return { state: "REJECTED", errors: [{ code: "V5-REJECTED", message: res.data.keT_QUA?.trim() || "Hải quan từ chối danh sách container" }] };
    return { state: "PENDING" };
  }

  /**
   * KVGS (đặc tả API-KVGS): `POST /api/KVGS` một lời gọi đồng bộ, body phẳng { TK_SOTK, TK_NGAYDK dd/MM/yyyy, TK_MAHQ, MA_DV } – chuỗi để giữ số 0 đầu.
   * Kiểm body trước khi gọi (ngày sai định dạng thì controller FPT vẫn tra với ngày mặc định); body sai → DomainError (không gọi, không tính phí). errorList → REJECTED; thiếu dữ liệu để in → REJECTED
   * KVGS_RESPONSE_INCOMPLETE; `raw` luôn là phản hồi thô. HTTP 429/5xx/mạng → FptTransientError (retry); 400/401 (sau đăng nhập lại) → DomainError.
   */
  async fetchKvgs(orgId: string, req: KvgsGatewayRequest, _idempotencyKey?: string): Promise<KvgsFetchResult> {
    const body = FptKvgsRequestSchema.safeParse({ TK_SOTK: req.declarationNo.trim(), TK_NGAYDK: isoToFptDate(req.registeredOn.trim()), TK_MAHQ: req.customsOffice.trim(), MA_DV: req.taxCode.trim() });
    // Lỗi dữ liệu phía ta (thiếu MÃ HQ / MÃ DV…): chưa gọi FPT → lỗi vĩnh viễn (như sendContainerList), worker không tính phí CUSTOMS_SEND.
    if (!body.success) throw domainError("VALIDATION", `Không gọi được KVGS: ${body.error.issues.map((i) => describeSchemaIssue(i).message).join("; ")}`);
    // Không đọc tài khoản VNACCS: KVGS chỉ cần JWT (FPT_API_*), body phẳng không có objVNACCS_ACCOUNT.
    const raw = await this.http.post("KVGS", body.data, null, { orgId, ...(req.dossierId ? { dossierId: req.dossierId } : {}) });
    return { ...mapKvgsResponse(raw, this.now()), raw };
  }

  /**
   * V5IdentifierReq (KHAI BAO LAY MA DINH DANH v1.1 + Postman FPT): body phẳng { mA_DV, teN_DV, loaI_DT, loaI_HH, mA_HQ, mA_DAI_LY, teN_DAI_LY, useR_ID },
   * không gửi tài khoản/mật khẩu VNACCS. Cổng thật trả kết quả ngay (sO_DD, codE_CONTENT, tranG_THAI 15) – có thể ~45 giây; cổng chỉ trả reF_ID → PENDING.
   * Body sai (thiếu MST, USER_ID…) → DomainError, không gọi FPT.
   */
  async sendIdentifier(orgId: string, req: IdentifierGatewayRequest, _idempotencyKey?: string): Promise<IdentifierGatewayResult> {
    requireVnaccsUser(req.userId);
    const body = identifierBody(req);
    const raw = await this.http.post("V5IdentifierReq", body, null, { orgId, ...(req.dossierId ? { dossierId: req.dossierId } : {}) });
    return mapIdentifierResponse(raw);
  }

  /** V5IdentifierRes: thông tin doanh nghiệp + reF_ID (Postman FPT). Chưa xử lý xong → tranG_THAI 11, các số null → PENDING. */
  async identifierResult(orgId: string, req: IdentifierGatewayRequest & { refId: string }): Promise<IdentifierGatewayResult> {
    requireVnaccsUser(req.userId);
    const raw = await this.http.post("V5IdentifierRes", identifierQueryBody(req), null, { orgId, ...(req.dossierId ? { dossierId: req.dossierId } : {}) });
    return mapIdentifierResponse(raw);
  }

  /** IID (nhập, body tK_ICN) / IEX (xuất, body tK_ECN) – theo Postman FPT; trạng thái theo VN_IDA/EDA_TRANGTHAI. */
  async queryStatus(orgId: string, externalId: string, dossierId?: string, direction?: "NK" | "XK"): Promise<GatewayStatus> {
    const dir = direction ?? directionOfNo(externalId);
    const op = dir === "XK" ? "IEX" : "IID";
    const no = declarationNoOf(externalId);
    if (!no) throw domainError("GATEWAY_ERROR", `Tra cứu: số tờ khai "${externalId}" không hợp lệ`);
    const kind = dir === "XK" ? "EDA" : "IDA";
    const { env, errors } = await this.call(orgId, op, { [numberField(kind)]: Number(no) }, dossierId);
    if (errors) throw domainError("GATEWAY_ERROR", `Tra cứu tờ khai ${externalId} lỗi: ${errors.map((e) => `${e.code}: ${e.message}`).join("; ")}`);
    const result = resultFor(env, kind, { no });
    if (!result) throw domainError("GATEWAY_ERROR", `FPT không trả thông tin tờ khai ${externalId}`);
    return statusOf(result.kind, result.item);
  }

  /**
   * VNACCSREP: mọi thông điệp của tài khoản VNACCS – tờ khai (objIDA/objEDA/objAMA) và thông báo (vaF8010, vaF8030, vaD8000/vaE8000, vaD4870/vaE4740,
   * vaL0020). FPT lấy khỏi hộp thư VNACCS rồi mới trả (không trả lại) → KHÔNG bỏ phần tử nào: thiếu số → declarationNo rỗng (người gọi lưu UNMATCHED).
   * errorList: không kèm dữ liệu → coi là lỗi tài khoản, ném (người gọi bỏ qua lượt); kèm dữ liệu → giữ dữ liệu, lỗi thành một thông điệp ERROR.
   */
  async pullMessages(orgId: string): Promise<GatewayMessage[]> {
    const env = FptResponseEnvelopeSchema.parse(await this.http.post("VNACCSREP", {}, await this.credsFor(orgId), { orgId })) as Obj;
    const errors = toErrors(env as Parameters<typeof toErrors>[0]);
    const out: GatewayMessage[] = [];
    for (const kind of ["IDA", "EDA", "AMA"] as const) {
      for (const item of repItems(env[`obj${kind}`])) {
        const m = item.objMsgResult ?? {};
        const head = sub(item, `objVN_${kind}`);
        const no = repNo(kind === "AMA" ? head["tK_SYN"] : head[numberField(kind)]) || repNo(m.decNumber);
        out.push({ ...repHead(kind, m, no), ...(kind === "AMA" ? {} : { status: statusOf(kind, item), direction: kind === "EDA" ? "XK" as const : "NK" as const }) });
      }
    }
    for (const block of REP_NOTICE_BLOCKS) {
      for (const item of repItems(env[block.key])) {
        const m = item.objMsgResult ?? {};
        const no = repNo(item[block.noField]) || repNo(m.decNumber);
        const direction = "direction" in block ? block.direction : block.kind === "HYS" || !no ? undefined : directionOfNo(no);
        out.push({ ...repHead(block.kind, m, no), ...(direction ? { direction } : {}), detail: repDetail(item) });
      }
    }
    if (errors) {
      if (!out.length) throw domainError("GATEWAY_ERROR", `Lấy thông điệp Hải quan lỗi: ${errors.map((e) => `${e.code}: ${e.message}`).join("; ")}`);
      out.push({ kind: "ERROR", code: errors[0]!.code, name: "Lỗi Hải quan trả kèm thông điệp", declarationNo: "", errors });
    }
    return out;
  }
}

/** Body định danh FPT (chuỗi, giữ số 0 đầu); đại lý trống gửi "" như Postman. Sai → DomainError VALIDATION (không gọi FPT). */
function identifierBody(req: IdentifierGatewayRequest) {
  const body = FptIdentifierRequestSchema.safeParse({
    mA_DV: req.taxCode.trim(), teN_DV: req.companyName.trim(), loaI_DT: req.objectType, loaI_HH: req.goodsType, mA_HQ: req.customsOffice.trim(),
    mA_DAI_LY: req.agentTaxCode?.trim() ?? "", teN_DAI_LY: req.agentName?.trim() ?? "", useR_ID: req.userId.trim(),
  });
  if (!body.success) throw domainError("VALIDATION", `Không gửi được khai báo định danh: ${body.error.issues.map((i) => describeSchemaIssue(i).message).join("; ")}`);
  return body.data;
}

/** Body V5IdentifierRes đúng Postman FPT: mA_HQ, mA_DV, teN_DV, mA_DAI_LY, teN_DAI_LY, reF_ID, useR_ID (không loaI_DT/loaI_HH). */
function identifierQueryBody(req: IdentifierGatewayRequest & { refId: string }) {
  const body = FptIdentifierQuerySchema.safeParse({
    mA_HQ: req.customsOffice.trim(), mA_DV: req.taxCode.trim(), teN_DV: req.companyName.trim(), mA_DAI_LY: req.agentTaxCode?.trim() ?? "", teN_DAI_LY: req.agentName?.trim() ?? "",
    reF_ID: req.refId.trim(), useR_ID: req.userId.trim(),
  });
  if (!body.success) throw domainError("VALIDATION", `Không hỏi được kết quả định danh: ${body.error.issues.map((i) => describeSchemaIssue(i).message).join("; ")}`);
  return body.data;
}

/**
 * Phản hồi V5IdentifierReq/Res → kết quả: errorList → REJECTED; tranG_THAI theo identifierState (15 + sO_DD → ACCEPTED, 10 → REJECTED, còn lại PENDING).
 * Ngày dd/MM/yyyy → YYYY-MM-DD. Phản hồi sai dạng → DomainError (Hải quan có thể đã nhận – không để worker gửi lại).
 */
export function mapIdentifierResponse(raw: unknown): IdentifierGatewayResult {
  const env = FptResponseEnvelopeSchema.parse(raw);
  const errors = toErrors(env);
  if (errors) return { state: "REJECTED", errors };
  const res = V5IdentifierResSchema.safeParse(raw);
  if (!res.success) throw domainError("GATEWAY_ERROR", "Phản hồi khai báo định danh của FPT không đúng định dạng – bấm Hỏi kết quả, không gửi lại");
  const d = res.data;
  const text = (v: string | null | undefined) => (v ?? "").trim() || undefined;
  const receiptDate = fptDateToIso(d.ngaY_TN);
  const identifiedOn = fptDateToIso(d.ngaY_DD);
  const fields = {
    ...(text(d.reF_ID) ? { refId: text(d.reF_ID)! } : {}), ...(text(d.sO_TN) ? { receiptNo: text(d.sO_TN)! } : {}), ...(receiptDate ? { receiptDate } : {}),
    ...(text(d.tranG_THAI) ? { customsState: text(d.tranG_THAI)! } : {}), ...(text(d.sO_DD) ? { identifierNo: text(d.sO_DD)! } : {}), ...(identifiedOn ? { identifiedOn } : {}),
    ...(text(d.codE_CONTENT) ? { qrPng: text(d.codE_CONTENT)! } : {}), ...(text(d.keT_QUA) ? { resultText: text(d.keT_QUA)! } : {}),
  };
  return { state: identifierState(d.tranG_THAI, d.sO_DD), ...fields };
}

/** USER_ID rỗng = doanh nghiệp chưa cấu hình tài khoản VNACCS: báo lỗi rõ ràng (vĩnh viễn, không retry) trước khi gọi FPT. */
function requireVnaccsUser(userId: string): void {
  if (!userId.trim()) throw domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình tài khoản VNACCS của doanh nghiệp – vào Cài đặt > Tài khoản VNACCS rồi khai lại");
}

const containerListHead = (r: Omit<ContainerListGatewayRequest, "rows">) => ({
  tK_SOTK: r.declarationNo, tK_NGAYDK: isoToFptDate(r.registeredOn), tK_MALH: r.typeCode, tK_MAHQ: r.customsOffice, mA_DV: r.taxCode, teN_DV: r.companyName,
  // Mẫu Postman luôn gửi 2 ô đại lý (không có đại lý → "").
  mA_DAI_LY: r.agent?.taxCode ?? "", teN_DAI_LY: r.agent?.name ?? "", useR_ID: r.userId,
});

/** Trạng thái tờ khai từ một phần tử objIDA/objEDA (TRANGTHAI: T/A/C/TE/A01/E/R, luồng, thông quan). R = Hủy (contracts FPT_DECLARATION_STATES) – VNACCS không có trạng thái "từ chối" sau khai chính thức. */
function statusOf(kind: "IDA" | "EDA", item: Obj): GatewayStatus {
  const tt = sub(item, `objVN_${kind}_TRANGTHAI`);
  const no = sub(item, `objVN_${kind}`)[numberField(kind)];
  const code = String(tt["tK_TRANGTHAI"] ?? "");
  const cleared = Number(tt["tK_THONGQUAN"] ?? 0) === 1;
  const channel = channelOf(tt["tK_LUONG"]);
  const label = cleared ? "Đã thông quan" : (FPT_DECLARATION_STATES as Record<string, string>)[code] ?? code;
  return { status: label, cleared, info: parseCustomsInfo(kind, item, new Date()), ...(code === "R" ? { cancelled: true } : {}), ...(no ? { declarationNo: String(no) } : {}), ...(channel ? { channel } : {}) };
}

/** Số tờ khai gửi FPT (FPT nhận kiểu số): thiếu hoặc không phải chữ số → null (báo lỗi tại chỗ, không gửi tK_…: 0). */
function declarationNoOf(externalId: string | null | undefined): string | null {
  const s = String(externalId ?? "").trim();
  return /^\d+$/.test(s) ? s : null;
}
const noNumberError = (op: string): GatewayError => ({ code: "E-NO-DECLARATION-NO", message: `${op}: chưa có số tờ khai – khai tạm (IDA/EDA) trước`, solution: "Tra cứu trạng thái tờ khai hoặc khai lại" });
