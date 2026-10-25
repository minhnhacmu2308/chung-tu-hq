// Bản khai bổ sung sau thông quan (AMA) trong mock: lập từ tờ khai gốc + số Hải quan trả về, đổi trạng thái theo AMA/AMB/AMC.
// Dùng chung cho api/customs (bắt đầu sửa, phản hồi nghiệp vụ) và api/post-amendment (màn hình). Quy tắc thuần: @kb/contracts post-amendment.
import {
  addDec, amaHeaderFrom, amaLineDelta, amaLineFrom, DEC_ZERO, declarationFormValues, formatDec, itemOverrides, parseDec, vatCode,
  type AmaSourceLine, type CustomsInfo, type CustomsOperation, type PostAmendment, type PostAmendmentLine,
} from "@kb/contracts";
import { computeTaxes } from "@/mocks/declaration-builder";
import { newId, nowIso } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { branchesOf } from "@/mocks/customs-sim";
import type { Declaration, Dossier } from "@/mocks/types";

const kindOf = (d: Dossier) => (d.direction === "NK" ? "IDA" : "EDA");

/** Bản đang mở (chưa khai chính thức AMC) của hồ sơ. */
export const openAmendment = (db: MockDb, dossierId: string, branch = 1): PostAmendment | undefined =>
  db.postAmendments.find((a) => a.dossierId === dossierId && (a.branch ?? 1) === branch && a.status !== "REGISTERED");

/** Dòng tờ khai gốc của tờ `branch` (đánh số 1..50 trong tờ): ô VNACCS của dòng (ô người khai đã nhập theo dòng ghi đè), số Hải quan tính, thuế GTGT. */
export function sourceLines(db: MockDb, dossier: Dossier, decl: Declaration, customs: CustomsInfo | null, branch = 1): AmaSourceLine[] {
  const all = db.lineItems.filter((i) => i.dossierId === dossier.id).sort((a, b) => a.lineNo - b.lineNo);
  // Thuế tính trên cả lô (điều chỉnh trị giá phân bổ theo cả lô), rồi chọn dòng của tờ.
  const taxes = computeTaxes(dossier, all, decl.valueAdjustments).perItem;
  const items = branchesOf(all)[branch - 1]?.items ?? [];
  return items.map((it, idx) => {
    const t = taxes.find((x) => x.itemId === it.id);
    const vat = dossier.direction === "NK" && it.vatRate !== undefined && t;
    const base = t ? formatDec({ n: BigInt(t.customsValueVnd) + BigInt(t.importDutyVnd), scale: 0 }) : undefined;
    return {
      lineNo: idx + 1,
      values: {
        HAG_CMN: it.description, HAG_OR: it.origin, HAG_CMD: it.hsConfirmed ?? "", HAG_QN1: it.quantity, HAG_QT1: it.unit, HAG_TXA: it.importDutyRate ?? "",
        ...itemOverrides(decl.fields, it.id),
      },
      customs: customs?.items.find((c) => c.lineNo === idx + 1),
      ...(vat ? { otherTaxes: [{ code: vatCode(it.vatRate), rate: `${it.vatRate}%`, base, amount: t.vatVnd }] } : {}),
    };
  });
}

/** Ô đầu bản khai gốc của tờ (điền sẵn khi lập): tờ khai gốc + số tờ khai + thông tin Hải quan trả về cho tờ. */
export const amendmentHeader = (dossier: Dossier, decl: Declaration, customs: CustomsInfo | null, declarationNo: string) =>
  amaHeaderFrom({ direction: dossier.direction, form: declarationFormValues(kindOf(dossier), decl.fields), customs, declarationNo, currency: dossier.currency, exchangeRate: decl.exchangeRate });

/** Lập bản khai bổ sung của tờ `branch`: đầu bản khai điền sẵn, chưa có dòng hàng (người khai chọn dòng cần bổ sung). seq đếm riêng từng tờ. */
export function createAmendment(db: MockDb, dossier: Dossier, decl: Declaration, customs: CustomsInfo | null, declarationNo: string, branch = 1): PostAmendment {
  const seq = db.postAmendments.filter((a) => a.dossierId === dossier.id && (a.branch ?? 1) === branch).length + 1;
  const now = nowIso();
  const a: PostAmendment = {
    id: newId("pam"), dossierId: dossier.id, branch, seq, status: "DRAFT",
    header: amendmentHeader(dossier, decl, customs, declarationNo),
    lines: [], createdAt: now, updatedAt: now,
  };
  db.postAmendments.push(a);
  return a;
}

export function newLine(src: AmaSourceLine): PostAmendmentLine {
  return { id: newId("pal"), ran: src.lineNo, values: amaLineFrom(src), manual: [] };
}

/** Tổng tăng/giảm tiền thuế của bản khai (thuế XNK + thu khác), VND. */
export function amendmentDelta(a: PostAmendment): string {
  const parts = a.lines.flatMap((l) => {
    const d = amaLineDelta(l.values);
    return [d.importTax, ...d.other.map((o) => o.amount)].flatMap((s) => (s && parseDec(s) ? [parseDec(s)!] : []));
  });
  return formatDec(parts.reduce(addDec, DEC_ZERO), { scale: 0 });
}

/** Phản hồi AMA/AMB/AMC đã đến → đổi trạng thái bản khai; AMA: Hải quan cấp số tờ khai bổ sung, số thông báo. */
export function applyPostOperation(db: MockDb, dossierId: string, branch: number, op: CustomsOperation, at: string, declarationNo: string) {
  const a = openAmendment(db, dossierId, branch);
  if (!a) return;
  a.updatedAt = at;
  if (op === "AMA") {
    const delta = amendmentDelta(a);
    a.status = "PRE_DECLARED";
    a.header["TK_SYN"] = `3${declarationNo.slice(1, 11)}${a.seq}`;
    a.result = {
      TK_SYN: a.header["TK_SYN"], TK_ADD: `${declarationNo.slice(-6)}${String(a.seq).padStart(2, "0")}`, TK_A02: at.slice(0, 10), TK_AD1: at.slice(11, 19).replace(/:/g, ""),
      TK_ADB: delta.startsWith("-") ? "-" : "+", TK_A23: delta.replace("-", ""), TK_ADE: "", TK_A25: String(a.lines.length),
    };
  }
  if (op === "AMB") {
    a.status = "RECALLED";
    delete a.approvedBy;
    delete a.approvedAt;
  }
  if (op === "AMC") a.status = "REGISTERED";
}
