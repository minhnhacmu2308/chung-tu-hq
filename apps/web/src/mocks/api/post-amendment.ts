// Bản khai bổ sung sau thông quan AMA (mock): xem, sửa ô, chọn dòng hàng của tờ khai gốc, phê duyệt.
// Lập bản khai: customs.startPostAmendment. Khai AMA/AMB/AMC: customs.performOperation. Quy tắc thuần: @kb/contracts post-amendment.
import {
  amaFieldIssue, amaHeaderLocked, amaLineLocked, applyAmaLineEdit, canEditDeclaration, declarationFormValues, isAmaHeaderKey, isAmaLineKey,
  postAmendmentEditable, type CopyPostAmendmentHeader, type CopyPostAmendmentHeaderResult, type PostAmendment, type PostAmendmentView, type ProcessingContract,
} from "@kb/contracts";
import { ApiError, mutate, nowIso, query } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { amendmentHeader, newLine, openAmendment, sourceLines } from "@/mocks/post-amendment-sim";
import { beginAmendment, branchBusy, branchCountOf, branchDeclarationNo, branchStageOf, customsInfoNow, settleCustoms } from "./customs";
import { reasonApiError } from "@/mocks/reason-error";

export const postAmendmentKeys = { view: (dossierId: string) => ["post-amendment", dossierId] as const };

const kindOf = (direction: "NK" | "XK") => (direction === "NK" ? "IDA" : "EDA");

function ctx(db: MockDb, dossierId: string) {
  const dossier = db.dossiers.find((d) => d.id === dossierId);
  const decl = db.declarations.find((d) => d.dossierId === dossierId);
  if (!dossier || !decl) throw new ApiError("NOT_FOUND", "Không tìm thấy tờ khai của hồ sơ");
  return { dossier, decl };
}

/** Hợp đồng gia công trên các tờ khai của doanh nghiệp (ô Số/Ngày hợp đồng gia công) – chọn để chèn vào ghi chú. */
function processingContracts(db: MockDb): ProcessingContract[] {
  const seen = new Map<string, ProcessingContract>();
  for (const decl of db.declarations) {
    const dossier = db.dossiers.find((d) => d.id === decl.dossierId);
    if (!dossier) continue;
    const v = declarationFormValues(kindOf(dossier.direction), decl.fields);
    const no = v["APP_HDGC_SO"]?.trim();
    if (no) seen.set(no, { no, date: v["APP_HDGC_NGAY"]?.trim() ?? "" });
  }
  return [...seen.values()];
}

/** Ô đầu sửa được dùng chung mọi tờ (không phải ô theo tờ khai gốc, ô dòng hàng hay TK_CHB – đội thủ tục riêng từng tờ). */
const commonKey = (key: string) => isAmaHeaderKey(key) && !amaHeaderLocked(key) && key !== "TK_CHB";

function assertBranch(db: MockDb, dossierId: string, branch: number) {
  if (branch < 1 || branch > branchCountOf(db, dossierId)) throw new ApiError("NOT_FOUND", `Hồ sơ không có tờ khai ${branch}`);
}

/** Xem bản khai bổ sung của tờ \`branch\` (mặc định tờ 1); dòng hàng của tờ đánh số 1..50. */
export const getPostAmendmentView = (dossierId: string, branch = 1) =>
  query((db): PostAmendmentView => {
    settleCustoms(db);
    const { dossier, decl } = ctx(db, dossierId);
    assertBranch(db, dossierId, branch);
    const all = db.postAmendments.filter((a) => a.dossierId === dossierId && (a.branch ?? 1) === branch);
    const current = openAmendment(db, dossierId, branch) ?? null;
    // Chỉ tiêu chung đã sửa: ô đầu sửa được của bản đang mở khác bản gốc của tờ (lô nhiều tờ: các tờ khác vẫn giữ giá trị cũ).
    const original = current ? amendmentHeader(dossier, decl, customsInfoNow(db, dossierId, branch), branchDeclarationNo(db, dossierId, branch) ?? "") : {};
    const commonEdits = current
      ? [...new Set([...Object.keys(current.header), ...Object.keys(original)])].filter((k) => commonKey(k) && (current.header[k] ?? "").trim() !== (original[k] ?? "").trim()).sort()
      : [];
    return {
      current,
      history: all.filter((a) => a.status === "REGISTERED").sort((a, b) => b.seq - a.seq),
      sourceLines: sourceLines(db, dossier, decl, null, branch).map((l) => ({ lineNo: l.lineNo, description: l.values["HAG_CMN"] ?? "", hsCode: l.values["HAG_CMD"] ?? "" })),
      contracts: processingContracts(db),
      commonEdits,
    };
  });

function editable(db: MockDb, dossierId: string, branch = 1): PostAmendment {
  const role = db.members.find((m) => m.id === db.currentUserId)?.role;
  if (!role || !canEditDeclaration(role)) throw new ApiError("FORBIDDEN", "Vai trò của bạn không được sửa bản khai bổ sung");
  assertBranch(db, dossierId, branch);
  const a = openAmendment(db, dossierId, branch);
  if (!a) throw new ApiError("NOT_FOUND", "Chưa lập bản khai bổ sung – lập ở bước 7 “Sửa sau thông quan”");
  if (!postAmendmentEditable(a.status)) {
    throw new ApiError("LOCKED", a.status === "PRE_DECLARED" ? "Bản khai đã khai tạm AMA – gọi về (AMB) trước khi sửa" : "Bản khai đã khai chính thức AMC – khóa toàn bộ");
  }
  return a;
}

/** Sửa xong một ô: bản khai đã duyệt về lại nháp (phải duyệt lại trước khi khai). */
function touch(a: PostAmendment) {
  if (a.status === "APPROVED") {
    a.status = "DRAFT";
    delete a.approvedBy;
    delete a.approvedAt;
  }
  a.updatedAt = nowIso();
}

export const updatePostAmendmentField = (dossierId: string, input: { lineId?: string; key: string; value: string }, branch = 1) =>
  mutate((db): PostAmendment => {
    const a = editable(db, dossierId, branch);
    const issue = amaFieldIssue(input.key, input.value);
    if (issue) throw new ApiError("INVALID_VALUE", issue);
    if (input.lineId) {
      const i = a.lines.findIndex((l) => l.id === input.lineId);
      if (i < 0) throw new ApiError("NOT_FOUND", "Không tìm thấy dòng hàng của bản khai");
      if (!isAmaLineKey(input.key) || amaLineLocked(input.key)) throw new ApiError("LOCKED", "Ô này theo tờ khai gốc – không sửa");
      a.lines[i] = applyAmaLineEdit(a.lines[i]!, input.key, input.value);
    } else {
      if (!isAmaHeaderKey(input.key) || amaHeaderLocked(input.key)) throw new ApiError("LOCKED", "Ô này theo tờ khai gốc – không sửa");
      a.header[input.key] = input.value.trim();
    }
    touch(a);
    return a;
  });

/** Thêm một hoặc nhiều dòng của tờ khai gốc (số dòng trong tờ 1..50) vào bản khai: Trước = tờ khai gốc + số Hải quan tính, Sau = bằng Trước. */
export const addPostAmendmentLines = (dossierId: string, lineNos: number[], branch = 1) =>
  mutate((db): PostAmendment => {
    const a = editable(db, dossierId, branch);
    const wanted = [...new Set(lineNos)];
    const dup = wanted.filter((n) => a.lines.some((l) => l.ran === n));
    if (dup.length) throw new ApiError("DUPLICATE", `Dòng ${dup.join(", ")} đã có trong bản khai`);
    const { dossier, decl } = ctx(db, dossierId);
    const all = sourceLines(db, dossier, decl, customsInfoNow(db, dossierId, branch), branch);
    const missing = wanted.filter((n) => !all.some((l) => l.lineNo === n));
    if (missing.length) throw new ApiError("NOT_FOUND", `Tờ khai gốc không có dòng ${missing.join(", ")}`);
    const added = wanted.map((n) => newLine(all.find((l) => l.lineNo === n)!));
    a.lines = [...a.lines, ...added].sort((x, y) => x.ran - y.ran);
    touch(a);
    return a;
  });

export const removePostAmendmentLine = (dossierId: string, lineId: string, branch = 1) =>
  mutate((db): PostAmendment => {
    const a = editable(db, dossierId, branch);
    a.lines = a.lines.filter((l) => l.id !== lineId);
    touch(a);
    return a;
  });

/** Phê duyệt bản khai bổ sung (người duyệt, nguyên tắc 4 mắt như tờ khai). */
export const approvePostAmendment = (dossierId: string, branch = 1) =>
  mutate((db): PostAmendment => {
    const a = editable(db, dossierId, branch);
    if (!a.lines.length) throw new ApiError("NO_LINES", "Chọn ít nhất một dòng hàng cần khai bổ sung");
    if (!a.header["TK_REC"]?.trim()) throw new ApiError("MISSING_FIELD", "Chưa nhập mã lý do khai bổ sung");
    const me = db.members.find((m) => m.id === db.currentUserId);
    const owner = db.dossiers.find((d) => d.id === dossierId)?.ownerId;
    if (db.org.fourEyes && me?.role !== "OWNER" && owner === db.currentUserId) throw reasonApiError("FORBIDDEN", "FOUR_EYES");
    Object.assign(a, { status: "APPROVED", approvedBy: me?.name ?? "—", approvedAt: nowIso(), updatedAt: nowIso() });
    const dossier = db.dossiers.find((d) => d.id === dossierId)!;
    Object.assign(dossier, { step: "submit", updatedAt: nowIso() });
    return a;
  });

/**
 * Nhân bản sửa chỉ tiêu chung (ô đầu VN_AMA) từ AMA của tờ \`fromBranch\` sang AMA của các tờ khác: tờ đã thông quan chưa lập bản khai thì lập luôn;
 * bỏ qua tờ chưa thông quan, tờ có bản khai đã duyệt / đã khai (không đè), tờ đang chờ phản hồi một nghiệp vụ khác.
 */
export const copyPostAmendmentHeader = (dossierId: string, input: CopyPostAmendmentHeader) =>
  mutate((db): CopyPostAmendmentHeaderResult => {
    const role = db.members.find((m) => m.id === db.currentUserId)?.role;
    if (!role || !canEditDeclaration(role)) throw new ApiError("FORBIDDEN", "Vai trò của bạn không được sửa bản khai bổ sung");
    const keys = [...new Set(input.keys)];
    const bad = keys.filter((k) => !commonKey(k));
    if (bad.length) throw new ApiError("VALIDATION", `Không phải chỉ tiêu chung sửa được của bản khai bổ sung: ${bad.join(", ")}`);
    assertBranch(db, dossierId, input.fromBranch);
    const source = openAmendment(db, dossierId, input.fromBranch);
    if (!source) throw new ApiError("NOT_FOUND", `Tờ ${input.fromBranch}: chưa lập bản khai bổ sung`);
    const values = Object.fromEntries(keys.map((k) => [k, (source.header[k] ?? "").trim()]));
    const applied: number[] = [];
    const skipped: CopyPostAmendmentHeaderResult["skipped"] = [];
    for (let no = 1; no <= branchCountOf(db, dossierId); no++) {
      if (no === input.fromBranch) continue;
      let a = openAmendment(db, dossierId, no);
      if (!a) {
        if (branchStageOf(db, dossierId, no) !== "CLEARED") { skipped.push({ no, reason: "NOT_CLEARED" }); continue; }
        if (branchBusy(db, dossierId, no)) { skipped.push({ no, reason: "BUSY" }); continue; }
        beginAmendment(db, dossierId, no);
        a = openAmendment(db, dossierId, no)!;
      } else if (a.status !== "DRAFT" && a.status !== "RECALLED") { skipped.push({ no, reason: "OPEN_NOT_DRAFT" }); continue; }
      for (const k of keys) a.header[k] = values[k]!;
      a.updatedAt = nowIso();
      applied.push(no);
    }
    return { applied, skipped };
  });
