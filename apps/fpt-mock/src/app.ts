// Server giả lập FPT.VNACCS (chỉ dev/test – KHÔNG gọi cổng thật vì cổng thật là production).
// Đúng theo mẫu curl thật (docdungapivnacss): /api/auth/login, /api/EDA + 2 lỗi A0004, S1139.
// Đủ 35 API của Postman "API-VNACCS NEW" (21/04/2026) – tài liệu: docs/vnaccs-api/. Body theo Postman; phản hồi ngoài EDA/login là
// GIẢ ĐỊNH (header `X-Mock-Assumed: 1`). Trạng thái tờ khai theo VN_IDA_TRANGTHAI: T lưu tạm · A khai tạm · C khai chính thức ·
// TE lưu tạm sửa đổi (sau IDD/EDD) · A01 khai tạm sửa đổi · E khai chính thức sửa đổi · R hủy.
// Xác thực: Bearer token từ /api/auth/login cho mọi API (FPT đã bỏ HTTP Basic – Postman 21/04/2026 còn ghi Basic là bản cũ).
import { randomInt } from "node:crypto";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { hysExtensionAllowed } from "@kb/contracts";
import { z } from "zod";
import { buildDeclarationResult, msgResult, validateDeclaration, type DeclarationRequest, type Kind } from "./declaration.js";
import { fptEnvelope, mockError, WRONG_PASSWORD, type FptError } from "./envelope.js";
import { createRefApis, pick } from "./ref-apis.js";
import { issueToken, verifyToken } from "./jwt.js";
import { createHscodeproMock } from "./hscodepro.js";
import { vnDate, vnHms } from "./vn-time.js";

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
  /** Số lần hỏi IEX/IID/VNACCSREP sau khai chính thức thì thông quan. */
  pollsToClear?: number;
  /** Số lần hỏi kết quả (V5Response, V5IdentifierRes, TachVanDonRes, ContainerRes) thì Hải quan chấp nhận. */
  pollsToAccept?: number;
  log?: (line: string) => void;
};

type Channel = 0 | 1 | 2 | 3;
type DeclState = "T" | "A" | "C" | "TE" | "A01" | "E" | "R";
const REGISTERED: DeclState[] = ["C", "E"];
type Rec0 = Record<string, unknown>;
export type MockDeclaration = {
  kind: Kind; declarationNo: string; tkId: string; userId: string; createdAt: string;
  state: DeclState; channel: Channel; amendments: number; cleared: boolean; polls: number; result: Record<string, unknown>;
  /** Thời điểm khai chính thức (EDC/IDC) và thông quan – trả ngày giờ đăng ký / cấp phép (GIẢ ĐỊNH theo đặc tả VNACCS). */
  registeredAt?: Date; clearedAt?: Date;
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


/** Mã thông điệp (REP_VNACCS V1.1 cho nhóm xuất / AMA / HYS). Nhóm nhập khẩu chưa có trong REP – mã VAD… là GIẢ ĐỊNH theo quy ước. */
const MSG = {
  EDB: ["VAE4000", "Khai Báo Trước Thông Tin Xuất Khẩu"], IDB: ["VAD4000", "Khai Báo Trước Thông Tin Nhập Khẩu"],
  EDD: ["VAE4110", "Gọi thông tin sửa đổi tờ khai xuất khẩu"], IDD: ["VAD4110", "Gọi thông tin sửa đổi tờ khai nhập khẩu"],
  EDA01: ["VAE0LB0", "Khai báo sửa đổi tờ khai xuất khẩu"], IDA01: ["VAD0LB0", "Khai báo sửa đổi tờ khai nhập khẩu"],
  IEX: ["VAE0LC0", "Tham chiếu thông tin tờ khai xuất khẩu"], IID: ["VAD0LC0", "Tham chiếu thông tin tờ khai nhập khẩu"],
} as const satisfies Record<string, readonly [string, string]>;
const channelMsg = (kind: Kind, ch: Channel) => (kind === "EDA" ? [`VAE${ch}LD0`, "Tờ khai hàng hóa xuất khẩu (thông báo kết quả phân luồng)"] : [`VAD${ch}LD0`, "Tờ khai hàng hóa nhập khẩu (thông báo kết quả phân luồng)"]) as [string, string];
const clearMsg = (kind: Kind) => (kind === "EDA" ? ["VAE1LF0", "Tờ khai hàng hóa xuất khẩu (thông quan)"] : ["VAD1LF0", "Tờ khai hàng hóa nhập khẩu (thông quan)"]) as [string, string];
const amendMsg = (kind: Kind, ch: Channel) => (kind === "EDA" ? [`VAE${Math.max(2, ch)}LE0`, "Tờ khai bổ sung hàng hóa xuất khẩu (người khai Hải quan thực hiện)"] : [`VAD${Math.max(2, ch)}LE0`, "Tờ khai bổ sung hàng hóa nhập khẩu (người khai Hải quan thực hiện)"]) as [string, string];

type AmaRecord = { syn: string; userId: string; state: "A" | "C"; result: Rec0 };

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
  const amas = new Map<string, AmaRecord>();
  /** Thông điệp loại P chờ VNACCSREP lấy, theo user VNACCS. */
  const inbox = new Map<string, { kind: "objIDA" | "objEDA" | "objAMA"; item: Rec0 }[]>();
  const refApis = createRefApis({ now, log, pollsToAccept: opts.pollsToAccept ?? 2 });
  let hysSeq = 0;
  let amaSeq = 0;

  const accountErrors = (acc: z.infer<typeof AccountSchema>): FptError[] => {
    if (acc.password !== vnaccsPassword) return [WRONG_PASSWORD, WRONG_PASSWORD]; // FPT trả trùng 2 lần (mẫu thật)
    const missing = (["useR_ID", "terminaL_ID", "terminaL_ACCESS_KEY"] as const).filter((k) => !acc[k]);
    return missing.map((k) => mockError("MOCK-REQ", k.toUpperCase(), "VNACCS account", `Thiếu ${k} trong objVNACCS_ACCOUNT.`));
  };
  const reply = (res: ServerResponse, account: unknown, patch: Parameters<typeof fptEnvelope>[1], extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    json(res, 200, { ...fptEnvelope(account, patch), ...extra }, headers);
  const envKey = (k: Kind) => (k === "EDA" ? "objEDA" : "objIDA") as "objEDA" | "objIDA";
  const push = (userId: string, kind: "objIDA" | "objEDA" | "objAMA", item: Rec0) => {
    const q = inbox.get(userId) ?? [];
    q.push({ kind, item });
    inbox.set(userId, q);
  };

  /** Tờ khai nhánh (TK_FIC/TK_BNO/TK_DNO): tờ 1 ghi "F" (hoặc bỏ trống) và nhận số mới; tờ k ≥ 2 phải tham chiếu số tờ khai đầu tiên mock này đã cấp. */
  const branchErrors = (kind: Kind, head: Record<string, unknown>): FptError[] => {
    const bno = Number(head["tK_BNO"] ?? head["TK_BNO"] ?? 1) || 1;
    const dno = Number(head["tK_DNO"] ?? head["TK_DNO"] ?? 0) || 0;
    if (dno > 0 && bno > dno) return [mockError("MOCK-REQ", "BNO", "Branch Number", `Số nhánh (tK_BNO ${bno}) lớn hơn tổng số tờ khai (tK_DNO ${dno}).`)];
    if (bno < 2) return [];
    const fic = String(head["tK_FIC"] ?? head["TK_FIC"] ?? "").trim();
    const first = byNo.get(fic);
    const firstBno = Number(first?.result[`objVN_${kind}`] && (first.result[`objVN_${kind}`] as Record<string, unknown>)["tK_BNO"]) || 1;
    if (first && first.kind === kind && firstBno === 1) return [];
    return [mockError("MOCK-REQ", "FIC", "First Declaration Number", `Tờ khai nhánh ${bno}: số tờ khai đầu tiên "${fic}" (tK_FIC) chưa được khai trước qua mock (tờ 1 ghi "F").`)];
  };

  /**
   * IDA/EDA (khai tạm) và IDA01/EDA01 (khai tạm sửa đổi). Khai tạm lại cùng tờ (cùng tK_ID, hoặc head có số tờ khai) giữ số cũ –
   * chỉ khi tờ khai còn ở T/A (chưa đăng ký). IDA01/EDA01 chỉ nhận tờ khai đã gọi sửa đổi (TE) hoặc khai tạm sửa đổi lại (A01).
   */
  async function declaration(kind: Kind, body: unknown, res: ServerResponse, mode: "new" | "amend" = "new") {
    const p = `objVN_${kind}`;
    const parsed = WithAccount.extend({ [p]: Rec, [`${p}_HANG`]: z.array(Rec).nullish(), [`${p}_CON`]: Rec.nullish(), [`${p}_CTHQ`]: Rec.nullish() }).safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const b = parsed.data as Record<string, unknown> & { objVNACCS_ACCOUNT: z.infer<typeof AccountSchema> };
    const headers = kind === "IDA" || mode === "amend" ? ASSUMED : {};
    const accErr = accountErrors(b.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: accErr }, {}, headers);
    const extra = Object.fromEntries(Object.entries(b).filter(([k]) => k.startsWith(`${p}_`) && ![`${p}_HANG`, `${p}_CON`, `${p}_CTHQ`].includes(k)));
    const req: DeclarationRequest = { account: b.objVNACCS_ACCOUNT, head: b[p] as Record<string, unknown>, con: (b[`${p}_CON`] ?? null) as Record<string, unknown> | null, cthq: (b[`${p}_CTHQ`] ?? null) as Record<string, unknown> | null, items: (b[`${p}_HANG`] ?? []) as Record<string, unknown>[], extra };
    const errors = [...validateDeclaration(kind, req, now()), ...(mode === "new" ? branchErrors(kind, req.head) : [])];
    const tkId = String(req.head["tK_ID"] ?? "");
    const idKey = `${kind}|${b.objVNACCS_ACCOUNT.useR_ID}|${tkId}`;
    const numberField = kind === "EDA" ? "tK_ECN" : "tK_ICN";
    const given = String(req.head[numberField] ?? "").trim();
    const existing = byNo.get(given) ?? (tkId ? byNo.get(byTkId.get(idKey) ?? "") : undefined);
    const op = mode === "amend" ? `${kind}01` : kind;
    if (mode === "amend") {
      if (!existing || existing.kind !== kind) errors.push(mockError("MOCK-REQ", numberField.slice(3).toUpperCase(), "Declaration Number", `${op}: không tìm thấy tờ khai số "${given}".`));
      else if (!["TE", "A01"].includes(existing.state)) errors.push(mockError("MOCK-REQ", "STATE", "Declaration Status", `${op}: tờ khai ${existing.declarationNo} đang ở trạng thái ${existing.state} – phải gọi ${kind === "EDA" ? "EDD" : "IDD"} trước.`));
    } else if (existing && !["T", "A"].includes(existing.state)) {
      errors.push(mockError("MOCK-REQ", "STATE", "Declaration Status", `Tờ khai ${existing.declarationNo} đã đăng ký (trạng thái ${existing.state}) – sửa bằng ${kind === "EDA" ? "EDD → EDA01 → EDE" : "IDD → IDA01 → IDE"}.`));
    }
    if (errors.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: errors }, {}, headers);
    const no = existing?.declarationNo ?? nextNo(kind);
    const result = buildDeclarationResult(kind, req, no, now());
    if (mode === "amend") {
      const [code, name] = MSG[op as "EDA01" | "IDA01"];
      result["objMsgResult"] = msgResult(op, code, name, no, now());
    }
    const prev = existing;
    byNo.set(no, {
      ...(prev ?? { kind, declarationNo: no, tkId, userId: String(b.objVNACCS_ACCOUNT.useR_ID), createdAt: now().toISOString(), channel: 0 as Channel, cleared: false, polls: 0, amendments: 0 }),
      state: mode === "amend" ? "A01" : "A", result,
    });
    if (tkId) byTkId.set(idKey, no);
    log(`${op} ${tkId} → số tờ khai ${no}`);
    const view = byNo.get(no)!;
    return reply(res, b.objVNACCS_ACCOUNT, { [envKey(kind)]: [mode === "amend" ? statusResult(view, op, MSG[op as "EDA01" | "IDA01"][0], MSG[op as "EDA01" | "IDA01"][1]) : result] }, {}, headers);
  }

  /** Kết quả rút gọn: objMsgResult + head + TRANGTHAI hiện tại. */
  const statusResult = (d: MockDeclaration, fn: string, code: string, name: string, type: "C" | "P" = "C") => {
    const p = `objVN_${d.kind}`;
    const eda = d.kind === "EDA";
    // Ngày giờ đăng ký (TK_K10/TK_RT1 · TK_A09/TK_AD11), mã phân loại kiểm tra (TK_K07 · TK_A06), cấp phép (TK_K86/TK_AD5 · TK_C21/TK_AD4).
    const reg = d.registeredAt ? { [eda ? "tK_K10" : "tK_A09"]: vnDate(d.registeredAt), [eda ? "tK_RT1" : "tK_AD11"]: vnHms(d.registeredAt), [eda ? "tK_K07" : "tK_A06"]: String(d.channel) } : {};
    const permit = d.cleared && d.clearedAt ? { [eda ? "tK_K86" : "tK_C21"]: vnDate(d.clearedAt), [eda ? "tK_AD5" : "tK_AD4"]: vnHms(d.clearedAt) } : {};
    return {
      ...d.result, objMsgResult: { ...msgResult(fn, code, name, d.declarationNo, now()), type },
      [p]: { ...(d.result[p] as object), ...reg },
      [`${p}_TRANGTHAI`]: { ...(d.result[`${p}_TRANGTHAI`] as object), tK_LUONG: String(d.channel), tK_TRANGTHAI: d.state, tK_THONGQUAN: d.cleared ? "1" : "0", ...permit },
    };
  };
  const findDecl = (b: Record<string, unknown>) => {
    const no = String(b["tK_ECN"] ?? b["tK_ICN"] ?? b["tK_SOTK"] ?? "");
    return { no, d: byNo.get(no) };
  };
  const notFound = (no: string, field: string) => mockError("MOCK-REQ", field, "Declaration Number", `Không tìm thấy tờ khai số "${no}" (mock chỉ biết tờ khai đã khai trước qua chính nó).`);

  /** Đăng ký (IDC/EDC từ A; IDE/EDE từ A01) → phân luồng, đẩy thông điệp phân luồng (loại P) cho VNACCSREP. */
  async function register(op: "EDC" | "IDC" | "EDE" | "IDE", body: unknown, res: ServerResponse) {
    const parsed = WithAccount.safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const b = parsed.data;
    const accErr = accountErrors(b.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: accErr }, {}, ASSUMED);
    const kind: Kind = op.startsWith("E") ? "EDA" : "IDA";
    const field = kind === "EDA" ? "tK_ECN" : "tK_ICN";
    const { no, d } = findDecl(b);
    if (!d || d.kind !== kind) return reply(res, b.objVNACCS_ACCOUNT, { errorList: [notFound(no, field.slice(3).toUpperCase())] }, {}, ASSUMED);
    const amend = op.endsWith("E") && op.length === 3 && op !== "IDC" && op !== "EDC";
    const from: DeclState = amend ? "A01" : "A";
    const to: DeclState = amend ? "E" : "C";
    if (d.state === to) log(`${op} ${no}: đã đăng ký – trả lại kết quả cũ`);
    else if (d.state !== from) return reply(res, b.objVNACCS_ACCOUNT, { errorList: [mockError("MOCK-REQ", "STATE", "Declaration Status", `${op}: tờ khai ${no} đang ở trạng thái ${d.state}, cần ${from}.`)] }, {}, ASSUMED);
    else {
      d.state = to; d.channel = d.channel || channelFor(no); d.registeredAt = now(); d.polls = 0;
      if (amend) d.amendments++;
      push(d.userId, envKey(kind), statusResult(d, op, ...(amend ? amendMsg(kind, d.channel) : channelMsg(kind, d.channel)), "P"));
    }
    log(`${op} ${no} → luồng ${d.channel}`);
    const name = kind === "EDA" ? "Đăng Ký Tờ Khai Xuất Khẩu" : "Đăng Ký Tờ Khai Nhập Khẩu";
    const code = amend ? amendMsg(kind, d.channel)[0] : kind === "EDA" ? "VAE1LF0" : "VAD1AC0";
    return reply(res, b.objVNACCS_ACCOUNT, { [envKey(kind)]: [statusResult(d, op, code, name)] }, {}, ASSUMED);
  }

  /** Gọi lại: IDB/EDB (A → T, rồi khai IDA/EDA lại) · IDD/EDD (C/E chưa thông quan → TE, rồi IDA01/EDA01). */
  async function recall(op: "IDB" | "EDB" | "IDD" | "EDD", body: unknown, res: ServerResponse) {
    const parsed = WithAccount.safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const b = parsed.data;
    const accErr = accountErrors(b.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: accErr }, {}, ASSUMED);
    const kind: Kind = op.startsWith("E") ? "EDA" : "IDA";
    const { no, d } = findDecl(b);
    if (!d || d.kind !== kind) return reply(res, b.objVNACCS_ACCOUNT, { errorList: [notFound(no, kind === "EDA" ? "ECN" : "ICN")] }, {}, ASSUMED);
    const preDecl = op.endsWith("B");
    const ok = preDecl ? ["T", "A"].includes(d.state) : REGISTERED.includes(d.state) || d.state === "TE" || d.state === "A01";
    if (!ok || (!preDecl && d.cleared)) {
      const why = d.cleared ? "đã thông quan – khai bổ sung sau thông quan (AMA)" : preDecl ? `đã đăng ký (trạng thái ${d.state}) – dùng ${kind === "EDA" ? "EDD" : "IDD"}` : `chưa đăng ký (trạng thái ${d.state}) – dùng ${kind === "EDA" ? "EDB" : "IDB"}`;
      return reply(res, b.objVNACCS_ACCOUNT, { errorList: [mockError("MOCK-REQ", "STATE", "Declaration Status", `${op}: tờ khai ${no} ${why}.`)] }, {}, ASSUMED);
    }
    d.state = preDecl ? "T" : "TE";
    log(`${op} ${no} → ${d.state}`);
    return reply(res, b.objVNACCS_ACCOUNT, { [envKey(kind)]: [statusResult(d, op, MSG[op][0], MSG[op][1])] }, {}, ASSUMED);
  }

  /** Một lượt "Hải quan xử lý": tờ khai đã đăng ký đủ số lần hỏi → thông quan + thông điệp thông quan (loại P). */
  const progress = (d: MockDeclaration) => {
    if (REGISTERED.includes(d.state) && !d.cleared && ++d.polls >= pollsToClear) {
      d.cleared = true; d.clearedAt = now();
      push(d.userId, envKey(d.kind), statusResult(d, d.kind === "EDA" ? "EDC" : "IDC", ...clearMsg(d.kind), "P"));
      log(`${d.declarationNo} → thông quan`);
    }
  };

  /** Tham chiếu: IEX (xuất, tK_ECN) / IID (nhập, tK_ICN). Nhận cả tK_SOTK (bản cũ của app). */
  async function reference(op: "IEX" | "IID", body: unknown, res: ServerResponse) {
    const parsed = WithAccount.safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const b = parsed.data;
    const accErr = accountErrors(b.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: accErr }, {}, ASSUMED);
    const { no, d } = findDecl(b);
    if (!d) return reply(res, b.objVNACCS_ACCOUNT, { errorList: [notFound(no, op === "IEX" ? "ECN" : "ICN")] }, {}, ASSUMED);
    progress(d);
    return reply(res, b.objVNACCS_ACCOUNT, { [envKey(d.kind)]: [statusResult(d, op, MSG[op][0], MSG[op][1])] }, {}, ASSUMED);
  }

  /** VNACCSREP: trả mọi thông điệp loại P đang chờ của user (lấy xong thì xóa – GIẢ ĐỊNH) và cho tờ khai đã đăng ký tiến một lượt. */
  async function vnaccsRep(body: unknown, res: ServerResponse) {
    const parsed = AccountSchema.safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const acc = parsed.data;
    const accErr = accountErrors(acc);
    if (accErr.length) return reply(res, acc, { errorList: accErr }, {}, ASSUMED);
    const user = String(acc.useR_ID);
    for (const d of byNo.values()) if (d.userId === user) progress(d);
    const msgs = inbox.get(user) ?? [];
    inbox.delete(user);
    const group = (k: "objIDA" | "objEDA" | "objAMA") => { const xs = msgs.filter((m) => m.kind === k).map((m) => m.item); return xs.length ? xs : undefined; };
    const patch = Object.fromEntries((["objIDA", "objEDA", "objAMA"] as const).map((k) => [k, group(k)]).filter(([, v]) => v));
    log(`VNACCSREP ${user}: ${msgs.length} thông điệp`);
    return reply(res, acc, patch, {}, ASSUMED);
  }

  /** HYS theo Excel VNACCS_HYS v1.2: phẳng, danh sách file `lisT_FILE`. Postman (có thể cũ) bọc `objVN_HYS { …, lisT_FILE_HYS[] }` – vẫn nhận. */
  const FileSchema = z.object({ filE_NAME: z.string(), filE_BASE64: z.string() });
  const HysSchema = WithAccount.extend({ objVN_HYS: Rec.nullish(), lisT_FILE: z.array(FileSchema).nullish() });
  async function hys(body: unknown, res: ServerResponse) {
    const parsed = HysSchema.safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const top = parsed.data as z.infer<typeof HysSchema> & Record<string, unknown>;
    const accErr = accountErrors(top.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, top.objVNACCS_ACCOUNT, { errorList: accErr }, {}, ASSUMED);
    const wrapped = !!top.objVN_HYS;
    const b: Record<string, unknown> = wrapped ? top.objVN_HYS! : top;
    const filesParsed = z.array(FileSchema).nullish().safeParse(b["lisT_FILE"] ?? b["lisT_FILE_HYS"]);
    if (!filesParsed.success) return zodProblem(res, filesParsed.error);
    const files = filesParsed.data ?? [];
    const errors: FptError[] = [];
    if (!String(b["tK_CH"] ?? "")) errors.push(mockError("MOCK-REQ", "CH", "Customs Office", "Chưa nhập mã chi cục (tK_CH)."));
    if (!String(b["tK_TSB"] ?? "")) errors.push(mockError("MOCK-REQ", "TSB", "Procedure Type", "Chưa nhập phân loại thủ tục (tK_TSB)."));
    if (!files.length) errors.push(mockError("MOCK-REQ", "LIST_FILE", "Attachments", "Chưa đính kèm file nào."));
    const bytes = files.reduce((s, f) => s + Buffer.from(f.filE_BASE64, "base64").length, 0);
    if (bytes >= 2 * 1024 * 1024) errors.push(mockError("MOCK-FMT", "LIST_FILE", "Attachments", `Tổng dung lượng ${bytes} byte – phải nhỏ hơn 2MB.`));
    for (const f of files) if (!hysExtensionAllowed(f.filE_NAME)) errors.push(mockError("MOCK-FMT", "LIST_FILE", "Attachments", `Đuôi file không được phép: ${f.filE_NAME}.`));
    // Kịch bản từ chối: tK_KJJ chứa "REJECT" → lỗi nghiệp vụ kèm cách khắc phục.
    if (String(b["tK_KJJ"] ?? "").toUpperCase().includes("REJECT")) errors.push(mockError("MOCK-REJ", "KJJ", "Attachment Note", "Hồ sơ đính kèm bị từ chối (kịch bản mock tK_KJJ chứa REJECT)."));
    if (errors.length) return reply(res, top.objVNACCS_ACCOUNT, { errorList: errors }, {}, ASSUMED);
    const jno = `${vnDate(now()).slice(-4)}${String(++hysSeq).padStart(8, "0")}`;
    log(`HYS ${files.length} file → số tiếp nhận ${jno}`);
    const { lisT_FILE: _a, lisT_FILE_HYS: _b, objVNACCS_ACCOUNT: _c, objVN_HYS: _d, ...fields } = b;
    const out = { ...fields, tK_JNO: jno, tK_TNM: b["tK_TNM"] ?? "Hồ sơ đính kèm", tK_YMD: vnDate(now()), tK_SNM: b["tK_SNM"] ?? null, tK_SAD: b["tK_SAD"] ?? null };
    // REP_VNACCS: HYS → VAL0020 (khối vaL0020); các trường cũng trả ở cấp ngoài (cột Response của sheet HYS – app đọc ở đây).
    return reply(res, top.objVNACCS_ACCOUNT, { vaL0020: out }, out, ASSUMED);
  }

  /** AMA – khai tạm tờ khai bổ sung sau thông quan; khai lại với tK_SYN đã cấp (sau AMB) giữ số. */
  async function ama(body: unknown, res: ServerResponse) {
    const parsed = WithAccount.extend({ objVN_AMA: Rec, objVN_AMA_HANG: z.array(Rec).nullish() }).safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const b = parsed.data;
    const accErr = accountErrors(b.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: accErr }, {}, ASSUMED);
    const head = b.objVN_AMA;
    const lines = b.objVN_AMA_HANG ?? [];
    const errors: FptError[] = [];
    if (!String(head["tK_ICN"] ?? "")) errors.push(mockError("MOCK-REQ", "ICN", "Declaration Number", "Chưa nhập số tờ khai cần bổ sung (tK_ICN)."));
    if (!String(head["tK_REC"] ?? "")) errors.push(mockError("MOCK-REQ", "REC", "Reason Code", "Chưa nhập mã lý do khai bổ sung (tK_REC)."));
    if (!lines.length) errors.push(mockError("MOCK-REQ", "RAN", "Line", "Chưa có dòng hàng khai bổ sung."));
    const prev = amas.get(String(head["tK_SYN"] ?? ""));
    if (prev?.state === "C") errors.push(mockError("MOCK-REQ", "SYN", "Amendment Number", `Tờ khai bổ sung ${prev.syn} đã đăng ký (AMC) – lập tờ khai bổ sung mới.`));
    if (errors.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: errors }, {}, ASSUMED);
    const syn = prev?.syn ?? `3${String(head["tK_ICN"]).slice(1, 11)}${++amaSeq}`;
    log(`AMA ${String(head["tK_ICN"])} (${lines.length} dòng) → số tờ khai bổ sung ${syn}`);
    const result = {
      objMsgResult: msgResult("AMA", "VAL8000", "Tờ khai bổ sung sau thông quan (chưa đăng ký)", syn, now()),
      objVN_AMA: { ...head, tK_SYN: syn, tK_ADD: `${vnDate(now()).slice(-4)}${String(amaSeq).padStart(8, "0")}`, tK_A02: vnDate(now()), tK_AD1: vnHms(now()), tK_A25: lines.length },
      objVN_AMA_HANG: lines,
      objVN_AMA_TRANGTHAI: { tK_TRANGTHAI: "Đã tiếp nhận", tK_KETQUAXYLY: 0 },
    };
    amas.set(syn, { syn, userId: String(b.objVNACCS_ACCOUNT.useR_ID), state: "A", result });
    return reply(res, b.objVNACCS_ACCOUNT, { objAMA: [result] }, {}, ASSUMED);
  }

  /** AMB (gọi lại tờ khai bổ sung đang khai tạm) / AMC (đăng ký → Hải quan chấp nhận: thông điệp VAL8050 loại P). Body: tài khoản + tK_SYN. */
  async function amaStep(op: "AMB" | "AMC", body: unknown, res: ServerResponse) {
    const parsed = WithAccount.safeParse(body);
    if (!parsed.success) return zodProblem(res, parsed.error);
    const b = parsed.data;
    const accErr = accountErrors(b.objVNACCS_ACCOUNT);
    if (accErr.length) return reply(res, b.objVNACCS_ACCOUNT, { errorList: accErr }, {}, ASSUMED);
    const syn = String(b["tK_SYN"] ?? "");
    const a = amas.get(syn);
    if (!a) return reply(res, b.objVNACCS_ACCOUNT, { errorList: [mockError("MOCK-REQ", "SYN", "Amendment Number", `Không tìm thấy tờ khai bổ sung số "${syn}".`)] }, {}, ASSUMED);
    if (a.state === "C") return reply(res, b.objVNACCS_ACCOUNT, { errorList: [mockError("MOCK-REQ", "SYN", "Amendment Number", `${op}: tờ khai bổ sung ${syn} đã đăng ký.`)] }, {}, ASSUMED);
    const [code, name] = op === "AMB" ? ["VAL8010", "Khai Báo Trước Thông Tin Sửa Đổi"] : ["VAL8020", "Tờ khai bổ sung sau thông quan (đã đăng ký)"];
    const item = { ...a.result, objMsgResult: msgResult(op, code, name, syn, now()) };
    if (op === "AMC") {
      a.state = "C";
      push(a.userId, "objAMA", { ...a.result, objMsgResult: { ...msgResult("AMC", "VAL8050", "Tờ khai bổ sung sau thông quan (được chấp nhận)", syn, now()), type: "P" } });
    }
    log(`${op} ${syn}`);
    return reply(res, b.objVNACCS_ACCOUNT, { objAMA: [item] }, {}, ASSUMED);
  }

  const hs = createHscodeproMock({ apiKey: opts.hscodeproKey ?? "dev-hs-key", now, log });
  /** Đường dẫn FPT không phân biệt hoa thường (Postman: /api/hys, mẫu cũ: /api/HYS). */
  const refOps = new Map(refApis.ops.map((op) => [op.toLowerCase(), op]));

  const handler: RequestListener = async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const path = url.pathname.replace(/\/+$/, "");
    try {
      // ---- HSCodePro giả lập (phân loại HS) – cùng cổng cho tiện dev
      if (path.startsWith("/internal/v1/hs-classifications")) return await hs.handle(req, res, path);
      // ---- điều khiển mock (không có ở FPT thật)
      if (path === "/__mock/health") return json(res, 200, { ok: true, declarations: byNo.size });
      if (path === "/__mock/declarations" && req.method === "GET") return json(res, 200, [...byNo.values()].map(({ result: _r, ...d }) => d));
      if (path === "/__mock/messages" && req.method === "GET") return json(res, 200, Object.fromEntries([...inbox].map(([u, q]) => [u, q.map((m) => (m.item["objMsgResult"] as Rec0)["code"])])));
      if (path === "/__mock/reset" && req.method === "POST") { byNo.clear(); byTkId.clear(); amas.clear(); inbox.clear(); refApis.reset(); hysSeq = 0; amaSeq = 0; return json(res, 200, { ok: true }); }
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

      if (path.toLowerCase() === "/api/auth/login") {
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
      const op = path.replace(/^\/api\//i, "");
      switch (op.toUpperCase()) {
        case "EDA": return await declaration("EDA", body, res);
        case "IDA": return await declaration("IDA", body, res);
        case "EDA01": return await declaration("EDA", body, res, "amend");
        case "IDA01": return await declaration("IDA", body, res, "amend");
        case "EDC": case "IDC": case "EDE": case "IDE": return await register(op.toUpperCase() as "EDC", body, res);
        case "EDB": case "IDB": case "EDD": case "IDD": return await recall(op.toUpperCase() as "EDB", body, res);
        case "IEX": case "IID": return await reference(op.toUpperCase() as "IEX", body, res);
        case "VNACCSREP": return await vnaccsRep(body, res);
        case "HYS": return await hys(body, res);
        case "AMA": return await ama(body, res);
        case "AMB": case "AMC": return await amaStep(op.toUpperCase() as "AMB", body, res);
      }
      const refOp = refOps.get(op.toLowerCase());
      if (refOp) {
        if (!body || typeof body !== "object" || Array.isArray(body)) return problem(res, { $: ["Body phải là object JSON."] });
        return json(res, 200, await refApis.handle(refOp, body as Rec0), ASSUMED);
      }
      return json(res, 404, undefined);
    } catch (e) {
      log(`500 ${path}: ${(e as Error).stack ?? String(e)}`);
      if (!res.headersSent) json(res, 500, { error: (e as Error).message });
    }
  };
  return { handler, declarations: byNo };
}
