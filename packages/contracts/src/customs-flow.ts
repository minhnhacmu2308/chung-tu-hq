// Luồng nghiệp vụ tại bước Khai báo Hải quan – THUẦN, dùng chung backend (integration) và mock FE để hai bên cùng một quy tắc.
// Giai đoạn: ① Khai báo (IDA → IDB → IDC) ② Sửa đổi bổ sung trước thông quan (IDD → IDA01 → IDE)
// ③ Sau thông quan (AMA → AMB → AMC) ④ Chứng từ & cảng (HYS, container qua KVGS, lệ phí cảng biển). Tra cứu IID/IEX dùng mọi lúc.
// Tờ khai xuất dùng mã E… tương ứng (EDA/EDB/EDC/EDD/EDA01/EDE) và tra cứu IEX.
import { z } from "zod";
import type { Direction } from "./common.js";
import type { CustomsOperation } from "./dto/customs.js";

/** Giai đoạn vòng đời tờ khai sau khi đã duyệt. Lưu ở kết quả truyền (raw.stage). */
export const CustomsStageSchema = z.enum([
  "NOT_SENT",            // chưa khai tạm
  "PRE_DECLARED",        // IDA ok: có số tờ khai, chờ khai chính thức
  "RECALLED",            // IDB ok: tờ khai tạm gọi về sửa → sửa, duyệt lại, khai tạm lại (IDA)
  "DECLARED",            // IDC ok: đã phân luồng, chờ thông quan
  "AMEND_RECALLED",      // IDD ok: gọi tờ khai đã phân luồng để sửa đổi bổ sung
  "AMEND_PRE_DECLARED",  // IDA01 ok: chờ khai chính thức sửa đổi (IDE)
  "CLEARED",             // đã thông quan
  "POST_EDITING",        // mở sửa sau thông quan (chưa gửi AMA)
  "POST_PRE_DECLARED",   // AMA ok: chờ khai chính thức (AMC)
  "POST_RECALLED",       // AMB ok: bản khai AMA gọi về sửa
  "REJECTED",            // Hải quan từ chối / hủy
]);
export type CustomsStage = z.infer<typeof CustomsStageSchema>;

export const CustomsPhaseSchema = z.enum(["DECLARE", "AMEND", "POST", "DOCS"]);
export type CustomsPhase = z.infer<typeof CustomsPhaseSchema>;

/** Cách thực hiện nghiệp vụ: gửi thông điệp / sửa tờ khai trước (mở bước Review) / bắt đầu sửa sau thông quan. */
export const CustomsActionSchema = z.enum(["SEND", "EDIT", "START_POST_EDIT"]);
export type CustomsAction = z.infer<typeof CustomsActionSchema>;

type OpKind = "content" | "recall" | "register" | "side" | "query";
type OpDef = { phase: CustomsPhase | null; label: string; kind: OpKind };

export const CUSTOMS_OPERATIONS: Record<CustomsOperation, OpDef> = {
  IDA: { phase: "DECLARE", label: "Khai tạm thông tin tờ khai", kind: "content" },
  IDB: { phase: "DECLARE", label: "Gọi sửa đổi tờ khai tạm", kind: "recall" },
  IDC: { phase: "DECLARE", label: "Khai chính thức tờ khai", kind: "register" },
  IDD: { phase: "AMEND", label: "Gọi sửa đổi tờ khai đã phân luồng", kind: "recall" },
  IDA01: { phase: "AMEND", label: "Khai tạm sửa đổi bổ sung", kind: "content" },
  IDE: { phase: "AMEND", label: "Khai chính thức sửa đổi bổ sung", kind: "register" },
  IID: { phase: null, label: "Tra cứu trạng thái tờ khai", kind: "query" },
  EDA: { phase: "DECLARE", label: "Khai tạm thông tin tờ khai", kind: "content" },
  EDB: { phase: "DECLARE", label: "Gọi sửa đổi tờ khai tạm", kind: "recall" },
  EDC: { phase: "DECLARE", label: "Khai chính thức tờ khai", kind: "register" },
  EDD: { phase: "AMEND", label: "Gọi sửa đổi tờ khai đã phân luồng", kind: "recall" },
  EDA01: { phase: "AMEND", label: "Khai tạm sửa đổi bổ sung", kind: "content" },
  EDE: { phase: "AMEND", label: "Khai chính thức sửa đổi bổ sung", kind: "register" },
  IEX: { phase: null, label: "Tra cứu trạng thái tờ khai", kind: "query" },
  AMA: { phase: "POST", label: "Khai tạm sửa đổi sau thông quan", kind: "content" },
  AMB: { phase: "POST", label: "Gọi sửa bản khai tạm AMA", kind: "recall" },
  AMC: { phase: "POST", label: "Khai chính thức bản khai AMA", kind: "register" },
  HYS: { phase: "DOCS", label: "Số hóa chứng từ", kind: "side" },
  CONT: { phase: "DOCS", label: "Container qua khu vực giám sát", kind: "side" },
  PORT_FEE: { phase: "DOCS", label: "Lệ phí cảng biển", kind: "side" },
};

export const CUSTOMS_PHASES: { id: CustomsPhase; title: string; hint: string }[] = [
  { id: "DECLARE", title: "Khai báo tờ khai", hint: "Khai tạm để nhận số tờ khai và thuế dự kiến, kiểm tra, rồi khai chính thức để phân luồng" },
  { id: "AMEND", title: "Sửa đổi bổ sung (trước thông quan)", hint: "Sau phân luồng: gọi tờ khai về, sửa chỉ tiêu, khai tạm rồi khai chính thức sửa đổi" },
  { id: "POST", title: "Sửa đổi sau thông quan", hint: "Khai bổ sung sau thông quan (trong 60 ngày – TT121 Điều 20)" },
  { id: "DOCS", title: "Chứng từ & cảng", hint: "Số hóa chứng từ, đưa container qua khu vực giám sát, nộp lệ phí cảng biển" },
];

const XK: Partial<Record<CustomsOperation, CustomsOperation>> = { IDA: "EDA", IDB: "EDB", IDC: "EDC", IDD: "EDD", IDA01: "EDA01", IDE: "EDE", IID: "IEX" };
/** Mã nghiệp vụ theo chiều tờ khai (nhập dùng mã I…, xuất dùng mã E… / IEX). */
export const opFor = (direction: Direction, base: CustomsOperation): CustomsOperation => (direction === "XK" ? XK[base] ?? base : base);
/** Nghiệp vụ gốc (mã nhập) của một mã: EDA → IDA, IEX → IID. */
export const baseOp = (op: CustomsOperation): CustomsOperation => (Object.entries(XK).find(([, x]) => x === op)?.[0] as CustomsOperation | undefined) ?? op;
export const queryOpFor = (direction: Direction): CustomsOperation => opFor(direction, "IID");
/** Nghiệp vụ hiện trên màn theo chiều tờ khai, theo thứ tự luồng. */
export const operationsFor = (direction: Direction): CustomsOperation[] =>
  (["IDA", "IDB", "IDC", "IDD", "IDA01", "IDE", "AMA", "AMB", "AMC", "HYS", "CONT", "PORT_FEE"] as CustomsOperation[]).map((o) => opFor(direction, o));
/** Nghiệp vụ gửi nội dung tờ khai (phải được duyệt, không còn BLOCKER, HS đủ – bất biến 7). */
export const isContentOperation = (op: CustomsOperation) => CUSTOMS_OPERATIONS[op].kind === "content";
/** Nghiệp vụ gọi tờ khai về sửa: thành công → mở lại tờ khai (bước Review). */
export const isRecallOperation = (op: CustomsOperation) => CUSTOMS_OPERATIONS[op].kind === "recall";

/** Giai đoạn sau khi nghiệp vụ thành công; null = nghiệp vụ không hợp lệ ở giai đoạn này. Nghiệp vụ phụ/tra cứu giữ nguyên giai đoạn. */
export function stageAfter(stage: CustomsStage, op: CustomsOperation): CustomsStage | null {
  const b = baseOp(op);
  const kind = CUSTOMS_OPERATIONS[op].kind;
  if (kind === "side" || kind === "query") return stage === "NOT_SENT" ? null : stage;
  switch (b) {
    case "IDA": return stage === "NOT_SENT" || stage === "RECALLED" ? "PRE_DECLARED" : null;
    case "IDB": return stage === "PRE_DECLARED" ? "RECALLED" : null;
    case "IDC": return stage === "PRE_DECLARED" ? "DECLARED" : null;
    case "IDD": return stage === "DECLARED" || stage === "AMEND_PRE_DECLARED" ? "AMEND_RECALLED" : null;
    case "IDA01": return stage === "AMEND_RECALLED" ? "AMEND_PRE_DECLARED" : null;
    case "IDE": return stage === "AMEND_PRE_DECLARED" ? "DECLARED" : null;
    case "AMA": return stage === "POST_EDITING" || stage === "POST_RECALLED" ? "POST_PRE_DECLARED" : null;
    case "AMB": return stage === "POST_PRE_DECLARED" ? "POST_RECALLED" : null;
    case "AMC": return stage === "POST_PRE_DECLARED" ? "CLEARED" : null;
    default: return null;
  }
}

/** Giai đoạn chờ sửa tờ khai: tờ khai mở lại, phải sửa ở Review và duyệt lại trước khi gửi nội dung. */
export const EDITING_STAGES: ReadonlySet<CustomsStage> = new Set(["RECALLED", "AMEND_RECALLED", "POST_EDITING", "POST_RECALLED"]);
/** Đang chờ Hải quan xử lý/thông quan (hỏi trạng thái định kỳ). */
export const AWAITING_CLEARANCE: ReadonlySet<CustomsStage> = new Set(["DECLARED", "AMEND_RECALLED", "AMEND_PRE_DECLARED"]);
export const hasDeclarationNumber = (stage: CustomsStage) => stage !== "NOT_SENT";
export const isChanneled = (stage: CustomsStage) => !["NOT_SENT", "PRE_DECLARED", "RECALLED", "REJECTED"].includes(stage);

/** Đọc giai đoạn từ dữ liệu cũ (trước khi có raw.stage): progress APPROVED/PRE_DECLARED/DECLARED/DOCS_SENT/DONE. */
export function stageFromLegacy(progress: string | undefined, state: string): CustomsStage {
  if (state === "REJECTED") return "REJECTED";
  if (state === "CLEARED") return "CLEARED";
  // Không có progress (dữ liệu rất cũ) → suy từ cột state.
  const p = progress ?? (state === "PRE_DECLARED" ? "PRE_DECLARED" : state === "DECLARED" || state === "DOCS_SENT" || state === "INSPECTION" ? "DECLARED" : undefined);
  if (p === "PRE_DECLARED") return "PRE_DECLARED";
  if (p === "DECLARED" || p === "DOCS_SENT" || p === "DONE") return "DECLARED";
  return "NOT_SENT";
}

export type OperationAvailabilityInput = {
  direction: Direction;
  stage: CustomsStage;
  /** Tờ khai đang ở trạng thái đã duyệt, sẵn sàng gửi nội dung (không phải bản nháp đang sửa). */
  approved: boolean;
  channel: "GREEN" | "YELLOW" | "RED" | null;
  hasContainers: boolean;
  /** Nghiệp vụ đang chờ gửi/phản hồi. */
  pending: CustomsOperation[];
  /** Nghiệp vụ đã thành công ít nhất một lần (để gợi ý việc tiếp theo cho nghiệp vụ phụ). */
  done: CustomsOperation[];
};
export type OperationAvailability = { op: CustomsOperation; enabled: boolean; action: CustomsAction; reason?: string };

const EDIT_HINT = "Sửa chỉ tiêu ở bước Review tờ khai và phê duyệt lại";

/** Từng nghiệp vụ có bấm được ở giai đoạn hiện tại không, bấm thì làm gì, và lý do khi bị khóa. */
export function operationAvailability(i: OperationAvailabilityInput): OperationAvailability[] {
  const busy = i.pending.length ? `Đang chờ phản hồi ${i.pending.join(", ")}` : null;
  const editing = EDITING_STAGES.has(i.stage);
  const row = (op: CustomsOperation, ok: boolean, reason: string, action: CustomsAction = "SEND"): OperationAvailability =>
    ok && !busy ? { op, enabled: true, action } : { op, enabled: false, action, reason: busy ?? reason };
  // Nghiệp vụ gửi nội dung ở giai đoạn sửa: chưa duyệt lại → nút đưa sang Review.
  const content = (op: CustomsOperation, stages: CustomsStage[], lockedReason: string): OperationAvailability => {
    if (!stages.includes(i.stage)) return row(op, false, lockedReason);
    if (editing && !i.approved) return busy ? row(op, false, "") : { op, enabled: true, action: "EDIT", reason: EDIT_HINT };
    return row(op, true, "");
  };
  const o = (b: CustomsOperation) => opFor(i.direction, b);
  const rejected = i.stage === "REJECTED" ? "Tờ khai đã bị Hải quan từ chối/hủy" : null;
  const out: OperationAvailability[] = [
    content(o("IDA"), ["NOT_SENT", "RECALLED"], i.stage === "NOT_SENT" ? "" : "Đã khai tạm – muốn sửa thì gọi sửa đổi tờ khai tạm trước"),
    row(o("IDB"), i.stage === "PRE_DECLARED", "Chỉ gọi sửa khi đã khai tạm và chưa khai chính thức"),
    row(o("IDC"), i.stage === "PRE_DECLARED", i.stage === "NOT_SENT" || i.stage === "RECALLED" ? "Khai tạm trước để nhận số tờ khai" : "Đã khai chính thức"),
    row(o("IDD"), i.stage === "DECLARED" || i.stage === "AMEND_PRE_DECLARED", isChanneled(i.stage) && i.stage !== "AMEND_RECALLED" ? "Chỉ sửa đổi bổ sung trước khi thông quan" : "Sau khi khai chính thức và có phân luồng"),
    content(o("IDA01"), ["AMEND_RECALLED"], "Gọi tờ khai đã phân luồng về sửa trước"),
    row(o("IDE"), i.stage === "AMEND_PRE_DECLARED", "Khai tạm sửa đổi bổ sung trước"),
    i.stage === "CLEARED"
      ? busy ? row("AMA", false, "") : { op: "AMA", enabled: true, action: "START_POST_EDIT" }
      : content("AMA", ["POST_EDITING", "POST_RECALLED"], "Chỉ khai sửa đổi sau khi tờ khai đã thông quan"),
    row("AMB", i.stage === "POST_PRE_DECLARED", "Sau khi đã khai tạm AMA"),
    row("AMC", i.stage === "POST_PRE_DECLARED", "Sau khi đã khai tạm AMA"),
    row("HYS", hasDeclarationNumber(i.stage), "Cần có số tờ khai (khai tạm trước)"),
    row("CONT", i.hasContainers && isChanneled(i.stage), i.hasContainers ? "Sau khi tờ khai đã phân luồng" : "Lô hàng không có container"),
    row("PORT_FEE", hasDeclarationNumber(i.stage), "Cần có số tờ khai (khai tạm trước)"),
  ];
  return rejected ? out.map((r) => ({ op: r.op, enabled: false, action: r.action, reason: rejected })) : out;
}

/** Việc tiếp theo nên làm (nổi bật trên màn); null khi chỉ còn chờ Hải quan. */
export function nextCustomsOperation(i: OperationAvailabilityInput): CustomsOperation | null {
  if (i.pending.length) return null;
  const o = (b: CustomsOperation) => opFor(i.direction, b);
  switch (i.stage) {
    case "NOT_SENT": case "RECALLED": return o("IDA");
    case "PRE_DECLARED": return o("IDC");
    case "DECLARED": return (i.channel === "YELLOW" || i.channel === "RED") && !i.done.includes("HYS") ? "HYS" : null;
    case "AMEND_RECALLED": return o("IDA01");
    case "AMEND_PRE_DECLARED": return o("IDE");
    case "POST_EDITING": case "POST_RECALLED": return "AMA";
    case "POST_PRE_DECLARED": return "AMC";
    case "CLEARED": return i.hasContainers && !i.done.includes("CONT") ? "CONT" : null;
    default: return null;
  }
}
