// Bản khai bổ sung sau thông quan AMA (mock): xem, sửa ô, chọn dòng hàng của tờ khai gốc, phê duyệt.
// Lập bản khai: customs.startPostAmendment. Khai AMA/AMB/AMC: customs.performOperation. Quy tắc thuần: @kb/contracts post-amendment.
import {
  amaFieldIssue, amaHeaderLocked, amaLineLocked, applyAmaLineEdit, canEditDeclaration, declarationFormValues, isAmaHeaderKey, isAmaLineKey,
  postAmendmentEditable, type PostAmendment, type PostAmendmentView, type ProcessingContract,
} from "@kb/contracts";
import { ApiError, mutate, nowIso, query } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { newLine, openAmendment, sourceLines } from "@/mocks/post-amendment-sim";
import { customsInfoNow, settleCustoms } from "./customs";

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

export const getPostAmendmentView = (dossierId: string) =>
  query((db): PostAmendmentView => {
    settleCustoms(db);
    const { dossier, decl } = ctx(db, dossierId);
    const all = db.postAmendments.filter((a) => a.dossierId === dossierId);
    return {
      current: openAmendment(db, dossierId) ?? null,
      history: all.filter((a) => a.status === "REGISTERED").sort((a, b) => b.seq - a.seq),
      sourceLines: sourceLines(db, dossier, decl, null).map((l) => ({ lineNo: l.lineNo, description: l.values["HAG_CMN"] ?? "", hsCode: l.values["HAG_CMD"] ?? "" })),
      contracts: processingContracts(db),
    };
  });

function editable(db: MockDb, dossierId: string): PostAmendment {
  const role = db.members.find((m) => m.id === db.currentUserId)?.role;
  if (!role || !canEditDeclaration(role)) throw new ApiError("FORBIDDEN", "Vai trò của bạn không được sửa bản khai bổ sung");
  const a = openAmendment(db, dossierId);
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

export const updatePostAmendmentField = (dossierId: string, input: { lineId?: string; key: string; value: string }) =>
  mutate((db): PostAmendment => {
    const a = editable(db, dossierId);
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

/** Thêm một hoặc nhiều dòng của tờ khai gốc vào bản khai: Trước = tờ khai gốc + số Hải quan tính, Sau = bằng Trước. */
export const addPostAmendmentLines = (dossierId: string, lineNos: number[]) =>
  mutate((db): PostAmendment => {
    const a = editable(db, dossierId);
    const wanted = [...new Set(lineNos)];
    const dup = wanted.filter((n) => a.lines.some((l) => l.ran === n));
    if (dup.length) throw new ApiError("DUPLICATE", `Dòng ${dup.join(", ")} đã có trong bản khai`);
    const { dossier, decl } = ctx(db, dossierId);
    const all = sourceLines(db, dossier, decl, customsInfoNow(db, dossierId));
    const missing = wanted.filter((n) => !all.some((l) => l.lineNo === n));
    if (missing.length) throw new ApiError("NOT_FOUND", `Tờ khai gốc không có dòng ${missing.join(", ")}`);
    const added = wanted.map((n) => newLine(all.find((l) => l.lineNo === n)!));
    a.lines = [...a.lines, ...added].sort((x, y) => x.ran - y.ran);
    touch(a);
    return a;
  });

export const removePostAmendmentLine = (dossierId: string, lineId: string) =>
  mutate((db): PostAmendment => {
    const a = editable(db, dossierId);
    a.lines = a.lines.filter((l) => l.id !== lineId);
    touch(a);
    return a;
  });

/** Phê duyệt bản khai bổ sung (người duyệt, nguyên tắc 4 mắt như tờ khai). */
export const approvePostAmendment = (dossierId: string) =>
  mutate((db): PostAmendment => {
    const a = editable(db, dossierId);
    if (!a.lines.length) throw new ApiError("NO_LINES", "Chọn ít nhất một dòng hàng cần khai bổ sung");
    if (!a.header["TK_REC"]?.trim()) throw new ApiError("MISSING_FIELD", "Chưa nhập mã lý do khai bổ sung");
    const me = db.members.find((m) => m.id === db.currentUserId);
    const owner = db.dossiers.find((d) => d.id === dossierId)?.ownerId;
    if (db.org.fourEyes && me?.role !== "OWNER" && owner === db.currentUserId) throw new ApiError("FORBIDDEN", "Người duyệt phải khác người tạo hồ sơ (nguyên tắc 4 mắt)");
    Object.assign(a, { status: "APPROVED", approvedBy: me?.name ?? "—", approvedAt: nowIso(), updatedAt: nowIso() });
    const dossier = db.dossiers.find((d) => d.id === dossierId)!;
    Object.assign(dossier, { step: "submit", updatedAt: nowIso() });
    return a;
  });
