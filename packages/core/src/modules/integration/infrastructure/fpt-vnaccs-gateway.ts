// Adapter FPT.VNACCS: dựng/kiểm payload bằng Zod của @kb/contracts/fpt; phần HTTP cô lập trong FptHttpClient.
// Đặc tả CHƯA có endpoint, cách xác thực HTTP, mã lỗi HTTP (BACKEND-TODO T1) → FptHttpClientStub ném GATEWAY_ERROR có hướng dẫn.
import { EdaRequestSchema, FptResponseEnvelopeSchema, IdaRequestSchema, type FptVnaccsCredentials } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import type { CustomsGateway, GatewayError, GatewayStatus } from "../application/customs-ports.js";

export type FptOperation = "IDA" | "IDC" | "EDA" | "EDC" | "HYS" | "IEX";
export interface FptHttpClient {
  post(op: FptOperation, body: unknown, creds: FptVnaccsCredentials): Promise<unknown>;
}
export interface VnaccsCredentialsReader {
  get(orgId: string): Promise<FptVnaccsCredentials | null>;
}

/** Chưa có endpoint FPT: mọi lời gọi đều báo lỗi nghiệp vụ rõ ràng, không retry. */
export class FptHttpClientStub implements FptHttpClient {
  async post(op: FptOperation): Promise<never> {
    throw domainError("GATEWAY_ERROR", `Chưa có endpoint FPT.VNACCS cho ${op} (BACKEND-TODO T1) – dùng CUSTOMS_GATEWAY=fake hoặc cấu hình FPT_API_BASE_URL khi có tài liệu`);
  }
}

const toErrors = (env: { errorList?: { errorCode?: string | null | undefined; indexCode?: string | null | undefined; errorContent?: string | null | undefined; proposedSolution?: string | null | undefined }[] | null | undefined }): GatewayError[] | undefined =>
  env.errorList?.length ? env.errorList.map((e) => ({ code: e.errorCode ?? "FPT", ...(e.indexCode ? { field: e.indexCode } : {}), message: e.errorContent ?? "Lỗi FPT", ...(e.proposedSolution ? { solution: e.proposedSolution } : {}) })) : undefined;

export class FptVnaccsGateway implements CustomsGateway {
  readonly name = "fpt-vnaccs";
  constructor(private http: FptHttpClient, private creds: VnaccsCredentialsReader) {}
  private async credsFor(orgId: string) {
    const c = await this.creds.get(orgId);
    if (!c) throw domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình tài khoản VNACCS (USER_ID, PASSWORD, TERMINAL_ID, TERMINAL_ACCESS_KEY) ở Tài khoản & tích hợp");
    return c;
  }
  async preDeclare(orgId: string, msg: { kind: "IDA" | "EDA"; request: unknown }) {
    const parsed = (msg.kind === "IDA" ? IdaRequestSchema : EdaRequestSchema).safeParse(msg.request);
    if (!parsed.success) return { externalId: "", errors: parsed.error.issues.map((i) => ({ code: "E-SCHEMA", field: i.path.join("."), message: i.message, solution: "Bổ sung chỉ tiêu trên tờ khai" })) };
    const raw = await this.http.post(msg.kind, parsed.data, await this.credsFor(orgId));
    const env = FptResponseEnvelopeSchema.parse(raw);
    const tk = ((env as Record<string, unknown>)[msg.kind === "IDA" ? "objVN_IDA" : "objVN_EDA"] ?? {}) as Record<string, unknown>;
    const errors = toErrors(env);
    return { externalId: String(tk["tK_ID"] ?? ""), ...(tk["tK_ICN"] ?? tk["tK_ECN"] ? { declarationNo: String(tk["tK_ICN"] ?? tk["tK_ECN"]) } : {}), ...(errors ? { errors } : {}) };
  }
  async declare(orgId: string, msg: { kind: "IDC" | "EDC"; externalId: string }) {
    const raw = await this.http.post(msg.kind, { tK_ID: Number(msg.externalId) }, await this.credsFor(orgId));
    const env = FptResponseEnvelopeSchema.parse(raw);
    const errors = toErrors(env);
    const tt = ((env as Record<string, unknown>)["objVN_IDA_TRANGTHAI"] ?? (env as Record<string, unknown>)["objVN_EDA_TRANGTHAI"] ?? {}) as Record<string, unknown>;
    const luong = Number(tt["tK_LUONG"] ?? 0);
    const channel: "GREEN" | "YELLOW" | "RED" | undefined = luong === 1 ? "GREEN" : luong === 2 ? "YELLOW" : luong === 3 ? "RED" : undefined;
    return { accepted: !errors, ...(channel ? { channel } : {}), ...(errors ? { errors } : {}) };
  }
  async attachDocuments(orgId: string, msg: { externalId: string; files: { name: string; bytes: Buffer }[] }) {
    const creds = await this.credsFor(orgId);
    const raw = await this.http.post("HYS", { ...creds, tK_ID: Number(msg.externalId), tK_TSB: "001", lisT_FILE: msg.files.map((f) => ({ filE_NAME: f.name, filE_BASE64: f.bytes.toString("base64") })) }, creds);
    const env = FptResponseEnvelopeSchema.parse(raw);
    const errors = toErrors(env);
    const jno = (env as Record<string, unknown>)["tK_JNO"];
    return { ...(jno ? { receiptNo: String(jno) } : {}), ...(errors ? { errors } : {}) };
  }
  async queryStatus(orgId: string, externalId: string): Promise<GatewayStatus> {
    const raw = await this.http.post("IEX", { tK_ID: Number(externalId) }, await this.credsFor(orgId));
    const env = FptResponseEnvelopeSchema.parse(raw) as Record<string, unknown>;
    const tt = (env["objVN_IDA_TRANGTHAI"] ?? env["objVN_EDA_TRANGTHAI"] ?? {}) as Record<string, unknown>;
    const luong = Number(tt["tK_LUONG"] ?? 0);
    return {
      status: String(tt["tK_TRANGTHAI"] ?? ""), cleared: Number(tt["tK_THONGQUAN"] ?? 0) === 1, ...(tt["tK_SOTK"] ? { declarationNo: String(tt["tK_SOTK"]) } : {}),
      ...(luong === 1 ? { channel: "GREEN" as const } : luong === 2 ? { channel: "YELLOW" as const } : luong === 3 ? { channel: "RED" as const } : {}),
    };
  }
}
