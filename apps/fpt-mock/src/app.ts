// Server giả lập FPT.VNACCS (chỉ dev/test – KHÔNG gọi cổng thật vì cổng thật là production).
// Đúng theo mẫu curl thật (docdungapivnacss): /api/auth/login, /api/EDA + 2 lỗi A0004, S1139.
// GIẢ ĐỊNH (chưa có mẫu): IDA, EDC/IDC, HYS, IEX, mã HTTP lỗi – response có header `X-Mock-Assumed: 1`.
import { randomInt } from "node:crypto";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { z } from "zod";
import { buildDeclarationResult, msgResult, validateDeclaration, type DeclarationRequest, type Kind } from "./declaration.js";
import { fptEnvelope, mockError, WRONG_PASSWORD, type FptError } from "./envelope.js";
import { issueToken, verifyToken } from "./jwt.js";
import { createHscodeproMock } from "./hscodepro.js";
import { vnDate } from "./vn-time.js";

export type MockOptions = {
  now?: () => Date;
  /** Tài khoản API (đăng nhập lấy token): username → password. */
  apiUsers?: Record<string, string>;
  /** Mật khẩu VNACCS hợp lệ (objVNACCS_ACCOUNT.password). Sai → A0004. */
  vnaccsPassword?: string;
  tokenTtlSeconds?: number;
  jwtSecret?: string;
  /** Số tờ khai mới (12 số). Mặc định: XK 30xxxxxxxxxx, NK 10xxxxxxxxxx ngẫu nhiên. */
  nextDeclarationNo?: (kind: Kind) => string;
  /** Khóa X-Internal-Api-Key cho HSCodePro giả lập (/internal/v1/hs-classifications). */
  hscodeproKey?: string;
  /** Số lần hỏi IEX sau khai chính thức thì thông quan. */
  pollsToClear?: number;
  log?: (line: string) => void;
};

type Channel = 0 | 1 | 2 | 3;
export type MockDeclaration = {
  kind: Kind; declarationNo: string; tkId: string; userId: string; createdAt: string;
  state: "A" | "C" | "R"; channel: Channel; cleared: boolean; polls: number; result: Record<string, unknown>;
};

const ISSUER = "https://fpt-mock.local";
const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body, null, 4));
};
const ASSUMED = { "x-mock-assumed": "1" };
const readBody = (req: IncomingMessage) => new Promise<string>((resolve, reject) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c)).on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))).on("error", reject);
});

const Rec = z.record(z.string(), z.unknown());
const AccountSchema = z.looseObject({ useR_ID: z.string().nullish(), password: z.string().nullish(), terminaL_ID: z.string().nullish(), terminaL_ACCESS_KEY: z.string().nullish() });
const WithAccount = z.looseObject({ objVNACCS_ACCOUNT: AccountSchema });
const LoginSchema = z.object({ username: z.string(), password: z.string() });

/** ASP.NET Core trả ValidationProblemDetails khi body không parse được (giả định). */
const problem = (res: ServerResponse, errors: Record<string, string[]>) =>
  json(res, 400, { type: "https://tools.ietf.org/html/rfc9110#section-15.5.1", title: "One or more validation errors occurred.", status: 400, errors, traceId: `00-${randomInt(1e9)}-mock-00` }, ASSUMED);
const zodProblem = (res: ServerResponse, e: z.ZodError) => problem(res, Object.fromEntries(e.issues.map((i) => [`$.${i.path.join(".")}`, [i.message]])));

/** Channel mặc định theo số cuối số tờ khai: 0-5 xanh, 6-8 vàng, 9 đỏ. Đổi được qua /__mock. */
const channelFor = (no: string): Channel => { const d = Number(no.at(-1)); return d <= 5 ? 1 : d <= 8 ? 2 : 3; };

export function createFptMock(opts: MockOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const apiUsers = opts.apiUsers ?? { test: "test" };
  const vnaccsPassword = opts.vnaccsPassword ?? "12345678";
  const ttl = opts.tokenTtlSeconds ?? 3 * 3600;
  const secret = opts.jwtSecret ?? "fpt-mock-secret";
  const pollsToClear = opts.pollsToClear ?? 2;
  const nextNo = opts.nextDeclarationNo ?? ((k: Kind) => `${k === "EDA" ? "30" : "10"}${String(randomInt(1e9)).padStart(9, "0")}0`);
  const log = opts.log ?? (() => {});
  const byNo = new Map<string, MockDeclaration>();
  const byTkId = new Map<string, string>();
  let hysSeq = 0;

  const accountErrors = (acc: z.infer<typeof AccountSchema>): FptError[] => {
    if (acc.password !== vnaccsPassword) return [WRONG_PASSWORD, WRONG_PASSWORD]; // FPT trả trùng 2 lần (mẫu thật)
    const missing = (["useR_ID", "terminaL_ID", "terminaL_ACCESS_KEY"] as const).filter((k) => !acc[k]);
    return missing.map((k) => mockError("MOCK-REQ", k.toUpperCase(), "VNACCS account", `Thiếu ${k} trong objVNACCS_ACCOUNT.`));
  };
  const reply = (res: ServerResponse, account: unknown, patch: Parameters<typeof fptEnvelope>[1], extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    json(res, 200, { ...fptEnvelope(account, patch), ...extra }, headers);
  const envKey = (k: Kind) => (k === "EDA" ? "objEDA" : "objIDA");

  async function declaration(kind: Kind, body: unknown, res: ServerResponse) {
    const p = `objVN_${kind}`;
    const parsed = WithAccount.extend({ [p]: Rec, [`${p}_HANG`]: z.array(Rec).nullish(), [`${p}_CON`]: Rec.nullish(), [`${p}_CTHQ`]: Rec.nullish() }).safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const b = parsed.data as Record<string, unknown> & { objVNACCS_ACCOUNT: z.infer<typeof AccountSchema> };
    const headers = kind === "IDA" ? ASSUMED : {};
    const accErr = accountErrors(b.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: accErr }, {}, headers);
    const extra = Object.fromEntries(Object.entries(b).filter(([k]) => k.startsWith(`${p}_`) && ![`${p}_HANG`, `${p}_CON`, `${p}_CTHQ`].includes(k)));
    const req: DeclarationRequest = { account: b.objVNACCS_ACCOUNT, head: b[p] as Record<string, unknown>, con: (b[`${p}_CON`] ?? null) as Record<string, unknown> | null, cthq: (b[`${p}_CTHQ`] ?? null) as Record<string, unknown> | null, items: (b[`${p}_HANG`] ?? []) as Record<string, unknown>[], extra };
    const errors = validateDeclaration(kind, req, now());
    if (errors.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: errors }, {}, headers);
    // Gửi lại cùng tK_ID (cùng tài khoản) → giữ số tờ khai cũ, khai trước lại (giả định).
    const tkId = String(req.head["tK_ID"] ?? "");
    const idKey = `${kind}|${b.objVNACCS_ACCOUNT.useR_ID}|${tkId}`;
    const no = (tkId && byTkId.get(idKey)) || nextNo(kind);
    const result = buildDeclarationResult(kind, req, no, now());
    byNo.set(no, { kind, declarationNo: no, tkId, userId: String(b.objVNACCS_ACCOUNT.useR_ID), createdAt: now().toISOString(), state: "A", channel: 0, cleared: false, polls: 0, result });
    if (tkId) byTkId.set(idKey, no);
    log(`${kind} ${tkId} → số tờ khai ${no}`);
    return reply(res, b.objVNACCS_ACCOUNT, { [envKey(kind)]: [result] }, {}, headers);
  }

  /** Kết quả rút gọn cho EDC/IDC/IEX: objMsgResult + head + TRANGTHAI hiện tại. */
  const statusResult = (d: MockDeclaration, fn: string, code: string, name: string) => {
    const p = `objVN_${d.kind}`;
    return {
      ...d.result, objMsgResult: msgResult(fn, code, name, d.declarationNo, now()),
      [`${p}_TRANGTHAI`]: { ...(d.result[`${p}_TRANGTHAI`] as object), tK_LUONG: String(d.channel), tK_TRANGTHAI: d.state, tK_THONGQUAN: d.cleared ? "1" : "0", ...(d.cleared ? { tK_K86: vnDate(now()) } : {}) },
    };
  };
  const findDecl = (b: Record<string, unknown>) => {
    const no = String(b["tK_ECN"] ?? b["tK_ICN"] ?? b["tK_SOTK"] ?? "");
    return { no, d: byNo.get(no) };
  };
  const notFound = (no: string, field: string) => mockError("MOCK-REQ", field, "Declaration Number", `Không tìm thấy tờ khai số "${no}" (mock chỉ biết tờ khai đã khai trước qua chính nó).`);

  async function register(kind: "EDC" | "IDC", body: unknown, res: ServerResponse) {
    const parsed = WithAccount.safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const b = parsed.data;
    const accErr = accountErrors(b.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: accErr }, {}, ASSUMED);
    const field = kind === "EDC" ? "tK_ECN" : "tK_ICN";
    const { no, d } = findDecl(b);
    const expected = kind === "EDC" ? "EDA" : "IDA";
    if (!d || d.kind !== expected) return reply(res, b.objVNACCS_ACCOUNT, { errorList: [notFound(no, field.slice(3))] }, {}, ASSUMED);
    if (d.state === "C") log(`${kind} ${no}: đã khai chính thức – trả lại kết quả cũ`);
    else { d.state = "C"; d.channel = d.channel || channelFor(no); }
    log(`${kind} ${no} → luồng ${d.channel}`);
    const name = kind === "EDC" ? "Đăng Ký Tờ Khai Xuất Khẩu" : "Đăng Ký Tờ Khai Nhập Khẩu";
    return reply(res, b.objVNACCS_ACCOUNT, { [envKey(d.kind)]: [statusResult(d, kind, kind === "EDC" ? "VAE1LF0" : "VAD1AC0", name)] }, {}, ASSUMED);
  }

  async function iex(body: unknown, res: ServerResponse) {
    const parsed = WithAccount.safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const b = parsed.data;
    const accErr = accountErrors(b.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: accErr }, {}, ASSUMED);
    const { no, d } = findDecl(b);
    if (!d) return reply(res, b.objVNACCS_ACCOUNT, { errorList: [notFound(no, "SOTK")] }, {}, ASSUMED);
    if (d.state === "C" && !d.cleared && ++d.polls >= pollsToClear) d.cleared = true;
    return reply(res, b.objVNACCS_ACCOUNT, { [envKey(d.kind)]: [statusResult(d, "IEX", "VAS0LA0", "Tham Chiếu Tờ Khai")] }, {}, ASSUMED);
  }

  const HysSchema = WithAccount.extend({ lisT_FILE: z.array(z.object({ filE_NAME: z.string(), filE_BASE64: z.string() })).nullish() });
  async function hys(body: unknown, res: ServerResponse) {
    const parsed = HysSchema.safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const b = parsed.data as z.infer<typeof HysSchema> & Record<string, unknown>;
    const accErr = accountErrors(b.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: accErr }, {}, ASSUMED);
    const files = b.lisT_FILE ?? [];
    const errors: FptError[] = [];
    if (!String(b["tK_CH"] ?? "")) errors.push(mockError("MOCK-REQ", "CH", "Customs Office", "Chưa nhập mã chi cục (tK_CH)."));
    if (!String(b["tK_TSB"] ?? "")) errors.push(mockError("MOCK-REQ", "TSB", "Procedure Type", "Chưa nhập phân loại thủ tục (tK_TSB)."));
    if (!files.length) errors.push(mockError("MOCK-REQ", "LIST_FILE", "Attachments", "Chưa đính kèm file nào."));
    const bytes = files.reduce((s, f) => s + Buffer.from(f.filE_BASE64, "base64").length, 0);
    if (bytes >= 2 * 1024 * 1024) errors.push(mockError("MOCK-FMT", "LIST_FILE", "Attachments", `Tổng dung lượng ${bytes} byte – phải nhỏ hơn 2MB.`));
    if (errors.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: errors }, {}, ASSUMED);
    const jno = `${vnDate(now()).slice(-4)}${String(++hysSeq).padStart(8, "0")}`;
    log(`HYS ${files.length} file → số tiếp nhận ${jno}`);
    const { objVNACCS_ACCOUNT, lisT_FILE: _files, ...fields } = b;
    return reply(res, objVNACCS_ACCOUNT, {}, { ...fields, tK_JNO: jno, tK_TNM: "Hồ sơ đính kèm", tK_YMD: vnDate(now()), tK_SNM: null, tK_SAD: null }, ASSUMED);
  }

  const hs = createHscodeproMock({ apiKey: opts.hscodeproKey ?? "dev-hs-key", now, log });

  const handler: RequestListener = async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const path = url.pathname.replace(/\/+$/, "");
    try {
      // ---- HSCodePro giả lập (phân loại HS) – cùng cổng cho tiện dev
      if (path.startsWith("/internal/v1/hs-classifications")) return await hs.handle(req, res, path);
      // ---- điều khiển mock (không có ở FPT thật)
      if (path === "/__mock/health") return json(res, 200, { ok: true, declarations: byNo.size });
      if (path === "/__mock/declarations" && req.method === "GET") return json(res, 200, [...byNo.values()].map(({ result: _r, ...d }) => d));
      if (path === "/__mock/reset" && req.method === "POST") { byNo.clear(); byTkId.clear(); hysSeq = 0; return json(res, 200, { ok: true }); }
      const ctl = /^\/__mock\/declarations\/(\d+)$/.exec(path);
      if (ctl && req.method === "POST") {
        const d = byNo.get(ctl[1]!);
        if (!d) return json(res, 404, { error: "not found" });
        const p = z.object({ channel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(), cleared: z.boolean().optional(), rejected: z.boolean().optional() }).safeParse(JSON.parse((await readBody(req)) || "{}"));
        if (!p.success) return zodProblem(res, p.error);
        if (p.data.channel) d.channel = p.data.channel;
        if (p.data.cleared !== undefined) d.cleared = p.data.cleared;
        if (p.data.rejected) d.state = "R";
        const { result: _r, ...view } = d;
        return json(res, 200, view);
      }

      if (req.method !== "POST") return json(res, 405, undefined, { allow: "POST" });
      // Giả lập sự cố hạ tầng để thử retry: header X-Mock-Fail: 500 | 502 | 503 | 429 | timeout.
      const fail = String(req.headers["x-mock-fail"] ?? "");
      if (fail === "timeout") return; // không trả lời – client tự timeout
      if (/^(429|5\d\d)$/.test(fail)) return json(res, Number(fail), undefined, ASSUMED);

      const raw = await readBody(req);
      let body: unknown;
      try { body = raw ? JSON.parse(raw) : {}; } catch (e) { return problem(res, { $: [`JSON không hợp lệ: ${(e as Error).message}`] }); }

      if (path === "/api/auth/login") {
        const p = LoginSchema.safeParse(body);
        if (!p.success) return zodProblem(res, p.error);
        if (apiUsers[p.data.username] !== p.data.password) return json(res, 401, undefined, ASSUMED); // mã/thân lỗi đăng nhập: giả định
        const { token, exp } = issueToken({ username: p.data.username, now: now(), ttlSeconds: ttl, secret, issuer: ISSUER });
        log(`login ${p.data.username}`);
        return json(res, 200, { token, expiration: new Date(exp * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") });
      }

      const auth = verifyToken(req.headers.authorization, now(), secret);
      if (!auth.ok) {
        const www = auth.reason === "missing" ? "Bearer" : auth.reason === "expired" ? `Bearer error="invalid_token", error_description="The token expired at '${new Date((auth.exp ?? 0) * 1000).toUTCString()}'"` : `Bearer error="invalid_token"`;
        return json(res, 401, undefined, { "www-authenticate": www });
      }
      log(`POST ${path} (${auth.username})`);
      switch (path) {
        case "/api/EDA": return await declaration("EDA", body, res);
        case "/api/IDA": return await declaration("IDA", body, res);
        case "/api/EDC": return await register("EDC", body, res);
        case "/api/IDC": return await register("IDC", body, res);
        case "/api/IEX": return await iex(body, res);
        case "/api/HYS": return await hys(body, res);
        default: return json(res, 404, undefined);
      }
    } catch (e) {
      log(`500 ${path}: ${(e as Error).stack ?? String(e)}`);
      if (!res.headersSent) json(res, 500, { error: (e as Error).message });
    }
  };
  return { handler, declarations: byNo };
}
