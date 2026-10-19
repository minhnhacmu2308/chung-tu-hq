// Bước 4–5: AI Agent (tra HS, ánh xạ, dựng tờ khai, số hóa) và tờ khai nháp (mock).
// Tiến trình agent mô phỏng theo thời gian: lưu startedAt, tính tiến độ mỗi lần đọc.
import { appFieldMeta, canEditDeclaration, declarationEditMode, extraFieldIssue, extraFieldMeta, itemFieldIssue, itemFieldMeta, parseItemFieldCode, fieldEditBlock, isDeclarationFieldEditable } from "@kb/contracts";
import { customsStageOf } from "./customs";
import { ApiError, mutate, nowIso, query } from "@/lib/mock-request";
import { buildDeclaration, computeTaxes, findHs, HS_CATALOG, ratesFor, type HsEntry, type ItemTax } from "@/mocks/declaration-builder";
import type { MockDb } from "@/mocks/db";
import type { ExchangeRateInfo, HsAnswerInput, HsReclassifyInput, LineItemHs } from "@kb/contracts";
import type { AgentRun, AgentTaskId, AgentTaskStatus, Declaration, LineItem } from "@/mocks/types";

export const declarationKeys = {
  agentRun: (id: string) => ["declaration", "agent-run", id] as const,
  items: (id: string) => ["declaration", "items", id] as const,
  view: (id: string) => ["declaration", "view", id] as const,
  hsCatalog: ["declaration", "hs-catalog"] as const,
};

export type AgentMode = AgentRun["mode"];

/** Thời lượng mô phỏng mỗi việc (giây). */
const DURATION: Record<AgentTaskId, number> = { HS_LOOKUP: 7, MAPPING: 3, BUILD_DECLARATION: 3, DIGITIZE: 4 };
const ORDER: AgentTaskId[] = ["HS_LOOKUP", "MAPPING", "BUILD_DECLARATION", "DIGITIZE"];
const TASKS_BY_MODE: Record<AgentMode, AgentTaskId[]> = {
  DECLARATION: ["HS_LOOKUP", "MAPPING", "BUILD_DECLARATION"],
  DIGITIZE: ["DIGITIZE"],
  BOTH: ORDER,
};

export type AgentLogLine = { at: string; text: string; tone: "info" | "success" | "warning" };
export type AgentRunView = {
  run: AgentRun;
  logs: AgentLogLine[];
  finished: boolean;
  /** Việc đang chạy (để hiện ở tiêu đề). */
  current?: AgentTaskId;
};

function scheduleOf(mode: AgentMode) {
  let t = 0;
  const out: Partial<Record<AgentTaskId, { start: number; end: number }>> = {};
  for (const id of TASKS_BY_MODE[mode]) {
    out[id] = { start: t, end: t + DURATION[id] };
    t += DURATION[id];
  }
  return out;
}

function computeRun(db: MockDb, run: AgentRun, now: number): AgentRunView {
  // Lần chạy trong dữ liệu mẫu đã hoàn tất sẵn.
  if (run.tasks.every((t) => t.status === "DONE" || t.status === "SKIPPED")) {
    return { run, logs: [{ at: run.startedAt, text: "Lần chạy trước đã hoàn tất.", tone: "success" }], finished: true };
  }
  const start = new Date(run.startedAt).getTime();
  const elapsed = (now - start) / 1000;
  const sched = scheduleOf(run.mode);
  const items = db.lineItems.filter((i) => i.dossierId === run.dossierId);
  const at = (sec: number) => new Date(start + sec * 1000).toISOString();
  const logs: AgentLogLine[] = [];
  let current: AgentTaskId | undefined;

  const tasks = ORDER.map((id) => {
    const s = sched[id];
    if (!s) return { id, status: "SKIPPED" as AgentTaskStatus, progress: 0, message: "Không chọn" };
    const p = Math.max(0, Math.min(1, (elapsed - s.start) / (s.end - s.start)));
    const status: AgentTaskStatus = p >= 1 ? "DONE" : elapsed >= s.start ? "RUNNING" : "PENDING";
    if (status === "RUNNING") current = id;
    let message = "Đang chờ";
    if (id === "HS_LOOKUP") {
      const n = Math.floor(p * items.length);
      message = status === "DONE" ? `Đã tra ${items.length}/${items.length} dòng hàng` : status === "RUNNING" ? `Đang tra dòng ${Math.min(n + 1, items.length)}/${items.length}` : message;
      if (elapsed >= s.start) logs.push({ at: at(s.start), text: `hscodepro /v1/classify – bắt đầu tra ${items.length} dòng hàng`, tone: "info" });
      items.forEach((it, i) => {
        const tt = s.start + ((i + 1) / items.length) * (s.end - s.start);
        if (elapsed >= tt) {
          const conf = Math.round((it.hsConfidence ?? 0) * 100);
          logs.push({ at: at(tt), text: `Dòng ${it.lineNo}: ${it.hsSuggested} (tin cậy ${conf}%)${conf < 70 ? " – cần người xác nhận kỹ" : ""}`, tone: conf < 70 ? "warning" : "info" });
        }
      });
    } else if (id === "MAPPING") {
      message = status === "DONE" ? "Đã ánh xạ 32 chỉ tiêu" : status === "RUNNING" ? "Đang áp SK-MAP vào chỉ tiêu tờ khai" : message;
      if (elapsed >= s.start) logs.push({ at: at(s.start), text: "Áp skill ánh xạ SK-MAP-IDA v3 (quy tắc cấu hình, không dùng AI)", tone: "info" });
      if (status === "DONE") logs.push({ at: at(s.end), text: "Người nhập khẩu lấy theo MST doanh nghiệp, không theo tên tiếng Anh trên invoice", tone: "info" });
    } else if (id === "BUILD_DECLARATION") {
      message = status === "DONE" ? "Đã dựng tờ khai nháp" : status === "RUNNING" ? "Đang tính trị giá tính thuế" : message;
      if (elapsed >= s.start) logs.push({ at: at(s.start), text: "Tính trị giá tính thuế, cộng khoản điều chỉnh theo Incoterm", tone: "info" });
      if (status === "DONE") logs.push({ at: at(s.end), text: "Tờ khai nháp đã sẵn sàng – chờ xác nhận mã HS và phê duyệt", tone: "success" });
    } else {
      const docs = db.documents.filter((d) => d.dossierId === run.dossierId).length;
      message = status === "DONE" ? `Đã số hóa ${docs} chứng từ` : status === "RUNNING" ? "Đang tạo dữ liệu số (JSON/XML)" : message;
      if (elapsed >= s.start) logs.push({ at: at(s.start), text: `Số hóa ${docs} chứng từ để đính kèm HYS`, tone: "info" });
      if (status === "DONE") logs.push({ at: at(s.end), text: "Dữ liệu số hóa đã lưu", tone: "success" });
    }
    return { id, status, progress: Math.round(p * 100), message };
  });

  const finished = tasks.every((t) => t.status === "DONE" || t.status === "SKIPPED");
  logs.sort((a, b) => a.at.localeCompare(b.at));
  return { run: { ...run, tasks }, logs, finished, ...(current ? { current } : {}) };
}

function hsLookupDone(db: MockDb, dossierId: string, now = Date.now()) {
  const run = db.agentRuns.find((r) => r.dossierId === dossierId);
  if (!run) return false;
  return computeRun(db, run, now).run.tasks.find((t) => t.id === "HS_LOOKUP")?.status === "DONE";
}

/** Đọc tiến trình. Khi bước dựng tờ khai xong → tạo tờ khai nháp (một lần). */
export const getAgentRun = (dossierId: string) =>
  mutate((db): AgentRunView | null => {
    const run = db.agentRuns.find((r) => r.dossierId === dossierId);
    if (!run) return null;
    const view = computeRun(db, run, Date.now());
    const built = view.run.tasks.find((t) => t.id === "BUILD_DECLARATION")?.status === "DONE";
    if (built && !db.declarations.some((d) => d.dossierId === dossierId)) {
      const dossier = db.dossiers.find((d) => d.id === dossierId)!;
      db.declarations.push(buildDeclaration(dossier, db.lineItems.filter((i) => i.dossierId === dossierId), db.org));
    }
    if (view.finished) {
      Object.assign(run, { tasks: view.run.tasks });
      const dossier = db.dossiers.find((d) => d.id === dossierId);
      if (dossier?.status === "PROCESSING" && dossier.step === "agent") Object.assign(dossier, { status: "NEEDS_REVIEW", updatedAt: nowIso() });
    }
    return view;
  });

export const startAgentRun = (dossierId: string, mode: AgentMode) =>
  mutate((db) => {
    const dossier = db.dossiers.find((d) => d.id === dossierId);
    if (!dossier) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    if (!db.lineItems.some((i) => i.dossierId === dossierId)) throw new ApiError("NO_ITEMS", "Chưa có dòng hàng – hoàn tất bước OCR & kiểm tra trước");
    db.agentRuns = db.agentRuns.filter((r) => r.dossierId !== dossierId);
    db.declarations = db.declarations.filter((d) => d.dossierId !== dossierId);
    db.agentRuns.push({
      dossierId,
      mode,
      startedAt: nowIso(),
      tasks: TASKS_BY_MODE[mode].map((id) => ({ id, status: "PENDING", progress: 0, message: "Đang chờ" })),
    });
    Object.assign(dossier, { step: "agent", status: "PROCESSING", updatedAt: nowIso() });
  });

/** Mô phỏng HSCodePro: dòng có "linear guide"/"thanh trượt" → AI hỏi công dụng; trả lời xong ~2 giây có kết quả. Chỉ trong phiên trình duyệt. */
const hsAnsweredAt = new Map<string, number>();
const NEEDS_INFO = /linear guide|thanh trượt|guide rail/i;
const HS_QUESTION = {
  id: "mock-q-use",
  questions: [{ id: "use", header: "Công dụng", question: "Thanh trượt này dùng cho loại máy nào?", options: [{ label: "Máy công cụ (CNC, máy phay, máy tiện)" }, { label: "Máy in 3D / thiết bị tự động hoá nhẹ" }, { label: "Khác", description: "Ghi rõ ở ô trả lời khác" }], multiSelect: false }],
};

function mockHs(db: MockDb, i: LineItem, now = Date.now()): LineItemHs {
  const empty = { question: null, error: null, reasoning: null, legalBasis: [], warnings: [], candidates: [] };
  if (NEEDS_INFO.test(i.description) && !i.hsConfirmed) {
    const t = hsAnsweredAt.get(i.id);
    if (t === undefined) return { ...empty, status: "need_info", question: HS_QUESTION };
    if (now - t < 2000) return { ...empty, status: "answering" };
  }
  if (!i.hsSuggested) return { ...empty, status: "failed", error: { code: "NO_SUGGESTION", message: "Không có gợi ý – chọn mã HS thủ công" } };
  const dossier = db.dossiers.find((d) => d.id === i.dossierId)!;
  const cand = (code: string, confidence: number, whyNot: string | null) => {
    const hs = findHs(code);
    const r = ratesFor(dossier, code);
    const fta = !!hs && r.importDutyRate !== hs.mfn && dossier.direction === "NK";
    return { code, description: hs?.description ?? "", confidence, whyNot, importRate: r.importDutyRate, basis: fta ? ("FTA" as const) : ("MFN" as const), agreement: fta ? "AKFTA" : null, vatRate: r.vatRate };
  };
  const main = i.hsSuggested;
  const alt = HS_CATALOG.find((h) => h.code !== main && h.code.slice(0, 4) === main.slice(0, 4)) ?? HS_CATALOG.find((h) => h.code !== main)!;
  const conf = i.hsConfidence ?? 0.5;
  return {
    ...empty, status: "completed",
    reasoning: `Mô tả "${i.description}" khớp nhóm ${main.slice(0, 4)} của biểu thuế (giả lập).`,
    legalBasis: ["Quy tắc tổng quát 1 và 6"],
    warnings: conf < 0.6 ? ["Mô tả chưa nêu rõ công dụng – kiểm tra lại trước khi khai"] : [],
    candidates: [cand(main, conf, null), cand(alt.code, 0.12, "Mô tả hàng không khớp phân nhóm này")],
  };
}

/** Dòng hàng. Gợi ý hscodepro chỉ hiện khi bước tra HS đã xong (và AI không còn chờ người khai trả lời). */
export const listLineItems = (dossierId: string) =>
  query((db) => {
    const show = hsLookupDone(db, dossierId);
    return db.lineItems
      .filter((i) => i.dossierId === dossierId)
      .map((i): LineItem => {
        if (!show && !i.hsConfirmed) {
          const { hsSuggested: _s, hsConfidence: _c, ...rest } = i;
          return { ...rest, hs: { status: "processing", question: null, error: null, reasoning: null, legalBasis: [], warnings: [], candidates: [] } };
        }
        const hs = mockHs(db, i);
        if (hs.status !== "completed" && !i.hsConfirmed) {
          const { hsSuggested: _s, hsConfidence: _c, ...rest } = i;
          return { ...rest, hs };
        }
        return { ...i, hs };
      });
  });

/** Trả lời câu hỏi của AI (mô phỏng): ~2 giây sau có mã gợi ý. */
export const answerHs = (itemId: string, input: HsAnswerInput) =>
  mutate((db) => {
    const item = db.lineItems.find((i) => i.id === itemId);
    if (!item) throw new ApiError("NOT_FOUND", "Không tìm thấy dòng hàng");
    if (input.questionId !== HS_QUESTION.id || hsAnsweredAt.has(itemId)) throw new ApiError("INVALID_STATE", "Câu hỏi đã được trả lời hoặc không còn hiệu lực – tải lại bảng");
    hsAnsweredAt.set(itemId, Date.now());
    return { ...item, hs: mockHs(db, item) };
  });

/** Phân loại lại một dòng (mô phỏng): cập nhật xuất xứ nếu có, kết quả như lần đầu. */
export const reclassifyHs = (itemId: string, input: HsReclassifyInput) =>
  mutate((db) => {
    const item = db.lineItems.find((i) => i.id === itemId);
    if (!item) throw new ApiError("NOT_FOUND", "Không tìm thấy dòng hàng");
    if (item.hsConfirmed) throw new ApiError("INVALID_STATE", "Dòng đã xác nhận mã HS – bỏ xác nhận trước khi phân loại lại");
    if (input.origin) item.origin = input.origin;
    return { ...item, hs: mockHs(db, item) };
  });

export const listHsCatalog = () => query(() => HS_CATALOG);
export type { HsEntry };

/** Dựng lại tờ khai nháp từ dòng hàng (giữ chỉ tiêu người dùng sửa tay) – gọi sau khi xác nhận HS, sửa dòng hàng ở OCR. */
export function refreshDeclaration(db: MockDb, dossierId: string) {
  const idx = db.declarations.findIndex((d) => d.dossierId === dossierId);
  if (idx < 0) return;
  const old = db.declarations[idx]!;
  if (old.status !== "DRAFT") return;
  const dossier = db.dossiers.find((d) => d.id === dossierId)!;
  const fresh = buildDeclaration(dossier, db.lineItems.filter((i) => i.dossierId === dossierId), db.org);
  // Giữ chỉ tiêu người dùng đã sửa tay (nguồn USER) khi dựng lại – giống backend.
  const edited = new Map(old.fields.filter((f) => f.source === "USER").map((f) => [f.code, f.value]));
  const fields = fresh.fields.map((f) => {
    const value = edited.get(f.code);
    if (value === undefined) return f;
    const { suspect: _s, note: _n, ...rest } = f;
    return { ...rest, value, source: "USER" as const };
  });
  // Chỉ tiêu người dùng nhập thêm (chỉ tiêu app chưa có, ô bổ sung) không có trong bản dựng mới → giữ nguyên.
  const freshCodes = new Set(fresh.fields.map((f) => f.code));
  for (const f of old.fields) if (f.source === "USER" && !freshCodes.has(f.code) && (extraFieldMeta(old.kind, f.code) || appFieldMeta(old.kind, f.code) || parseItemFieldCode(f.code))) fields.push(f);
  db.declarations[idx] = { ...fresh, fields, status: old.status };
}

/** Vai trò được sửa / mở lại tờ khai (backend: requireRole DECLARANT/APPROVER/ADMIN, OWNER luôn được). */
function assertCanEdit(db: MockDb) {
  const role = db.members.find((m) => m.id === db.currentUserId)?.role;
  if (!role || !canEditDeclaration(role)) throw new ApiError("FORBIDDEN", "Vai trò của bạn không được sửa tờ khai");
}

/** Người dùng xác nhận mã HS (giữ gợi ý hoặc chọn mã khác). */
export const confirmHs = (itemId: string, code: string) =>
  mutate((db) => {
    const item = db.lineItems.find((i) => i.id === itemId);
    if (!item) throw new ApiError("NOT_FOUND", "Không tìm thấy dòng hàng");
    if (code.replace(/\D/g, "").length !== 8) throw new ApiError("INVALID_HS", "Mã HS phải đủ 8 chữ số (vd 8482.10.00)");
    const dossier = db.dossiers.find((d) => d.id === item.dossierId)!;
    const r = ratesFor(dossier, code);
    item.hsConfirmed = code;
    item.importDutyRate = r.importDutyRate;
    item.vatRate = r.vatRate;
    if (r.policyNote) item.policyNote = r.policyNote;
    else delete item.policyNote;
    refreshDeclaration(db, item.dossierId);
    return item;
  });

/** Bỏ xác nhận để chọn lại. */
export const unconfirmHs = (itemId: string) =>
  mutate((db) => {
    const item = db.lineItems.find((i) => i.id === itemId);
    if (!item) throw new ApiError("NOT_FOUND", "Không tìm thấy dòng hàng");
    delete item.hsConfirmed;
    delete item.importDutyRate;
    delete item.vatRate;
    delete item.policyNote;
    return item;
  });

export type DeclarationItemView = LineItem & Omit<ItemTax, "itemId">;
export type DeclarationView = { declaration: Declaration | null; items: DeclarationItemView[]; unconfirmedHs: number; exchangeRateInfo?: ExchangeRateInfo | null };

export const getDeclarationView = (dossierId: string) =>
  query((db): DeclarationView => {
    const declaration = db.declarations.find((d) => d.dossierId === dossierId) ?? null;
    const dossier = db.dossiers.find((d) => d.id === dossierId);
    const items = db.lineItems.filter((i) => i.dossierId === dossierId);
    const taxes = dossier && declaration ? computeTaxes(dossier, items, declaration.valueAdjustments).perItem : [];
    // Nguồn tỷ giá (mô phỏng): bảng Vietcombank tối thứ Năm tuần trước, áp từ thứ Hai tuần của ngày tra.
    const monday = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10); };
    const exchangeRateInfo: ExchangeRateInfo | null = declaration && dossier && dossier.currency !== "VND"
      ? { currency: dossier.currency, rate: declaration.exchangeRate, effectiveFrom: monday(declaration.exchangeRateDate), source: "VCB", snapshotAt: new Date(Date.parse(`${monday(declaration.exchangeRateDate)}T15:00:00Z`) - 4 * 86_400_000).toISOString() }
      : null;
    return {
      declaration,
      exchangeRateInfo,
      unconfirmedHs: items.filter((i) => !i.hsConfirmed).length,
      items: items.map((i) => {
        const t = taxes.find((x) => x.itemId === i.id);
        return { ...i, customsValueVnd: t?.customsValueVnd ?? "0", importDutyVnd: t?.importDutyVnd ?? "0", vatVnd: t?.vatVnd ?? "0" };
      }),
    };
  });

/** Phê duyệt tờ khai (vai trò Người duyệt). Chặn khi còn HS chưa xác nhận. */
export const approveDeclaration = (dossierId: string) =>
  mutate((db) => {
    const decl = db.declarations.find((d) => d.dossierId === dossierId);
    if (!decl) throw new ApiError("NOT_FOUND", "Chưa có tờ khai");
    if (db.lineItems.some((i) => i.dossierId === dossierId && !i.hsConfirmed)) throw new ApiError("HS_UNCONFIRMED", "Còn mã HS chưa xác nhận");
    const me = db.members.find((m) => m.id === db.currentUserId);
    const owner = db.dossiers.find((d) => d.id === dossierId)?.ownerId;
    if (db.org.fourEyes && me?.role !== "OWNER" && owner === db.currentUserId) throw new ApiError("FORBIDDEN", "Người duyệt phải khác người tạo hồ sơ (nguyên tắc 4 mắt)");
    Object.assign(decl, { status: "APPROVED", approvedBy: me?.name ?? "—", approvedAt: nowIso() });
    const dossier = db.dossiers.find((d) => d.id === dossierId)!;
    Object.assign(dossier, { status: "APPROVED", step: "submit", suspectFields: 0, updatedAt: nowIso() });
    return decl;
  });

/** Chuyển hồ sơ sang bước Review sau khi xác nhận đủ HS. */
export const moveToReview = (dossierId: string) =>
  mutate((db) => {
    if (db.lineItems.some((i) => i.dossierId === dossierId && !i.hsConfirmed)) throw new ApiError("HS_UNCONFIRMED", "Còn mã HS chưa xác nhận");
    if (!db.declarations.some((d) => d.dossierId === dossierId)) throw new ApiError("NO_DECLARATION", "Chưa dựng tờ khai – chạy agent với lựa chọn có “Tạo tờ khai”");
    const dossier = db.dossiers.find((d) => d.id === dossierId)!;
    const suspect = db.declarations.find((d) => d.dossierId === dossierId)!.fields.filter((f) => f.suspect).length;
    Object.assign(dossier, { step: "review", status: "NEEDS_REVIEW", suspectFields: suspect, updatedAt: nowIso() });
  });

/** Sửa tay một chỉ tiêu trên tờ khai nháp: nguồn USER, hết nghi ngờ (bản thật ghi field_audit). */
export const updateDeclarationField = (dossierId: string, code: string, value: string) =>
  mutate((db) => {
    assertCanEdit(db);
    const decl = db.declarations.find((d) => d.dossierId === dossierId);
    if (!decl) throw new ApiError("NO_DECLARATION", "Chưa có tờ khai");
    if (decl.status !== "DRAFT") throw new ApiError("INVALID_STATE", "Tờ khai đã duyệt – không sửa");
    const block = fieldEditBlock(decl.kind, code, declarationEditMode(decl.status, customsStageOf(db, dossierId)), decl.fields);
    if (block) throw new ApiError("INVALID_STATE", block);
    const idx = decl.fields.findIndex((f) => f.code === code);
    // Chỉ tiêu chưa có trên tờ khai, người khai nhập lần đầu (chỉ tiêu app, ô bổ sung – mã = tên trường VNACCS, ô dòng hàng HANG.<id>.<ô>) → thêm vào tờ khai.
    const itemMeta = idx < 0 ? itemFieldMeta(decl.kind, code) : null;
    const line = itemMeta ? db.lineItems.find((i) => i.dossierId === dossierId && i.id === itemMeta.itemId) : undefined;
    const extra = idx < 0
      ? (appFieldMeta(decl.kind, code) ?? extraFieldMeta(decl.kind, code) ?? (itemMeta && line ? { label: `Dòng ${line.lineNo} – ${itemMeta.label}`, section: "VALUE" as const, ...(itemMeta.no ? { no: itemMeta.no } : {}) } : null))
      : null;
    if (idx < 0 && !extra) throw new ApiError("NOT_FOUND", "Không có chỉ tiêu này trên tờ khai");
    const parsed = parseItemFieldCode(code);
    const issue = parsed ? itemFieldIssue(decl.kind, parsed.key, value) : extraFieldIssue(decl.kind, code, value);
    if (issue) throw new ApiError("VALIDATION", issue);
    if (!isDeclarationFieldEditable(code)) throw new ApiError("VALIDATION", "Chỉ tiêu này không sửa tay trên tờ khai: số tờ khai do Hải quan cấp, loại hình đổi ở hồ sơ, trị giá/cước/tỷ giá sửa ở bước đọc chứng từ rồi dựng lại");
    if (extra) decl.fields.push({ code, label: extra.label, section: extra.section, ...(extra.no ? { no: extra.no } : {}), value: value.trim(), source: "USER" });
    else {
      const { suspect: _s, note: _n, ...rest } = decl.fields[idx]!;
      decl.fields[idx] = { ...rest, value: value.trim(), source: "USER" };
    }
    const dossier = db.dossiers.find((d) => d.id === dossierId);
    if (dossier) Object.assign(dossier, { suspectFields: decl.fields.filter((f) => f.suspect).length, updatedAt: nowIso() });
    return decl;
  });

/** Mở lại tờ khai đã duyệt nhưng chưa truyền → DRAFT, hồ sơ quay về bước Review để sửa và duyệt lại. */
export const reopenDeclaration = (dossierId: string) =>
  mutate((db) => {
    assertCanEdit(db);
    const decl = db.declarations.find((d) => d.dossierId === dossierId);
    const dossier = db.dossiers.find((d) => d.id === dossierId);
    if (!decl || !dossier) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    if (decl.status === "SUBMITTED") throw new ApiError("DOSSIER_LOCKED", "Hải quan đã ghi nhận tờ khai – không mở lại được, dùng khai sửa đổi");
    if (decl.status !== "APPROVED") throw new ApiError("INVALID_STATE", "Tờ khai chưa được duyệt");
    const { approvedBy: _b, approvedAt: _a, ...rest } = decl;
    db.declarations[db.declarations.indexOf(decl)] = { ...rest, status: "DRAFT" };
    Object.assign(dossier, { status: "NEEDS_REVIEW", step: "review", suspectFields: decl.fields.filter((f) => f.suspect).length, updatedAt: nowIso() });
  });
