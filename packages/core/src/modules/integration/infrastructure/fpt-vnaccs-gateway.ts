// Adapter FPT.VNACCS: dựng/kiểm payload bằng Zod của @kb/contracts/fpt; phần HTTP (đăng nhập, token, đường dẫn) cô lập trong FptHttpClient.
// Vỏ phản hồi theo mẫu thật (docdungapivnacss): { objVNACCS_ACCOUNT, errorList, objIDA: [...], objEDA: [...], ... };
// mỗi phần tử objEDA/objIDA = { objMsgResult, objVN_<KIND>, objVN_<KIND>_TRANGTHAI, … }.
// externalId = số tờ khai VNACCS (tK_ECN/tK_ICN) – EDC/IDC/IEX tra theo số này.
import { AmaRequestSchema, EdaRequestSchema, FPT_DECLARATION_STATES, FptResponseEnvelopeSchema, IdaRequestSchema, type CustomsOperation, type FptVnaccsCredentials } from "@kb/contracts";
import { z } from "zod";
import { domainError } from "../../../shared/errors.js";
import type { CustomsGateway, GatewayError, GatewaySendResult, GatewayStatus } from "../application/customs-ports.js";
import { buildFptRequest, type DeclarationPayload } from "../domain/declaration-to-fpt.js";
import { parseCustomsInfo } from "../domain/customs-info.js";
import { describeSchemaIssue } from "../domain/schema-issues.js";

export type FptOperation = "IDA" | "IDC" | "EDA" | "EDC" | "HYS" | "IEX" | "AMA";
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
    const { errors, result } = await this.call(orgId, msg.kind, { [numberField(kind)]: Number(msg.externalId) });
    if (errors) return { accepted: false, errors };
    const channel = channelOf(sub(result?.item, `objVN_${kind}_TRANGTHAI`)["tK_LUONG"]);
    return { accepted: true, ...(channel ? { channel } : {}), ...(result ? { info: parseCustomsInfo(result.kind, result.item, new Date()) } : {}) };
  }

  async attachDocuments(orgId: string, msg: { externalId: string; files: { name: string; bytes: Buffer }[]; declaration?: DeclarationPayload }) {
    // TK_CH bắt buộc ở HYS; lấy lại từ tờ khai (FPT trả tK_CH = null trong phản hồi EDA nên không đọc được từ đó).
    const req = msg.declaration ? (buildFptRequest(msg.declaration).request as Obj) : {};
    const head = sub(req, msg.declaration?.kind === "IDA" ? "objVN_IDA" : "objVN_EDA");
    const { env, errors } = await this.call(orgId, "HYS", {
      tK_CH: head["tK_CH"] ?? "", tK_CHB: head["tK_CHB"] ?? "", tK_TSB: "A99", tK_REF: msg.externalId,
      lisT_FILE: msg.files.map((f) => ({ filE_NAME: f.name, filE_BASE64: f.bytes.toString("base64") })),
    });
    if (errors) return { errors };
    const jno = env["tK_JNO"];
    return jno ? { receiptNo: String(jno) } : {};
  }

  /**
   * AMA: payload theo VNACCS_AMA v1.3 (objVN_AMA + objVN_AMA_HANG). Đường dẫn /api/AMA và vị trí số tờ khai bổ sung trong phản hồi
   * (objAMA[0].objVN_AMA.tK_SYN) là SUY LUẬN theo mẫu EDA – cần đối chiếu T1.
   * Nghiệp vụ còn lại chưa có đặc tả API FPT trong bộ tài liệu (AMB, AMC, IDB…) → báo rõ, không retry.
   */
  async send(orgId: string, msg: { op: CustomsOperation; request?: unknown }): Promise<GatewaySendResult> {
    if (msg.op === "AMA") {
      const parsed = AmaRequestSchema.safeParse(msg.request);
      if (!parsed.success) return { errors: parsed.error.issues.map(describeSchemaIssue) };
      const { env, errors } = await this.call(orgId, "AMA", parsed.data);
      if (errors) return { errors };
      const list = env["objAMA"];
      const head = Array.isArray(list) && list[0] && typeof list[0] === "object" ? sub(list[0] as Obj, "objVN_AMA") : {};
      const syn = head["tK_SYN"];
      return { ...(syn ? { receiptNo: String(syn) } : {}), note: "Hải quan tiếp nhận bản khai bổ sung" };
    }
    throw domainError("NOT_SUPPORTED", `Nghiệp vụ ${msg.op} chưa kết nối FPT.VNACCS (chưa có đặc tả API FPT) – thực hiện trên phần mềm khai báo`);
  }

  async queryStatus(orgId: string, externalId: string): Promise<GatewayStatus> {
    const { errors, result } = await this.call(orgId, "IEX", { tK_SOTK: externalId });
    if (errors) throw domainError("GATEWAY_ERROR", `Tra cứu tờ khai ${externalId} lỗi: ${errors.map((e) => `${e.code}: ${e.message}`).join("; ")}`);
    if (!result) throw domainError("GATEWAY_ERROR", `FPT không trả thông tin tờ khai ${externalId}`);
    const tt = sub(result.item, `objVN_${result.kind}_TRANGTHAI`);
    const no = sub(result.item, `objVN_${result.kind}`)[numberField(result.kind)];
    const code = String(tt["tK_TRANGTHAI"] ?? "");
    const cleared = Number(tt["tK_THONGQUAN"] ?? 0) === 1;
    const channel = channelOf(tt["tK_LUONG"]);
    const label = cleared ? "Đã thông quan" : (FPT_DECLARATION_STATES as Record<string, string>)[code] ?? code;
    return { status: label, cleared, info: parseCustomsInfo(result.kind, result.item, new Date()), ...(code === "R" ? { rejected: true } : {}), ...(no ? { declarationNo: String(no) } : {}), ...(channel ? { channel } : {}) };
  }
}
