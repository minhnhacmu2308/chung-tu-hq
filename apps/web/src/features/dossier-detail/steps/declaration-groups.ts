// Nhóm chỉ tiêu tờ khai trên màn Review theo thứ tự Phụ lục II (TT39/2018 sửa đổi TT121/2025), kèm vai trò từng chỉ tiêu
// để người khai phân biệt: phải khai / khai theo tình huống / VNACCS tự xác định / Hải quan trả về / thông tin tham khảo.
import { declarationFieldRole, findDeclarationFieldDef, type DeclarationFieldRole } from "@kb/contracts";
import { pickMessages, type UiLocale } from "@kb/ui";
import type { DeclarationField } from "@/mocks/types";
import { FIELD_GROUP_MESSAGES, FIELD_ROLE_MESSAGES } from "./declaration-groups.messages";

type Kind = "IDA" | "EDA";
export type FieldGroupId = "GENERAL" | "PARTIES" | "TRANSPORT" | "VALUE" | "TAX" | "REFERENCE" | "CUSTOMS";
export type RoledField = DeclarationField & { role: DeclarationFieldRole };
export type FieldGroup = { id: FieldGroupId; title: string; description?: string; fields: RoledField[] };

const GROUP_ORDER: FieldGroupId[] = ["GENERAL", "PARTIES", "TRANSPORT", "VALUE", "TAX", "REFERENCE", "CUSTOMS"];

/** Màu huy hiệu từng vai trò (dùng cho huy hiệu trên ô chỉ tiêu và chú thích đầu tab). */
const ROLE_TONE: Record<DeclarationFieldRole, "primary" | "info" | "neutral" | "success"> = {
  REQUIRED: "primary", CONDITIONAL: "info", OPTIONAL: "neutral", ASSIST: "neutral", CUSTOMS: "success", UNUSED: "neutral", REFERENCE: "neutral",
};
const ROLES = Object.keys(ROLE_TONE) as DeclarationFieldRole[];

export type RoleInfo = { label: string; tone: "primary" | "info" | "neutral" | "success"; meaning: string };

/** Nhãn, ý nghĩa và màu cho từng vai trò theo ngôn ngữ giao diện. */
export function roleInfo(locale: UiLocale): Record<DeclarationFieldRole, RoleInfo> {
  const t = pickMessages(FIELD_ROLE_MESSAGES, locale);
  return Object.fromEntries(ROLES.map((r) => [r, { label: t[r], tone: ROLE_TONE[r], meaning: t[`${r}_meaning`] }])) as Record<DeclarationFieldRole, RoleInfo>;
}

/** @deprecated Bản tiếng Việt cố định – giữ cho nơi gọi cũ (declaration-form/field.tsx); dùng `roleInfo(locale)`. */
export const ROLE_INFO: Record<DeclarationFieldRole, RoleInfo> = roleInfo("vi");

const minor = (no: string | undefined) => (no ? Number(no.split(".")[1] ?? 0) : Number.POSITIVE_INFINITY);

function groupOf(kind: Kind, f: DeclarationField, role: DeclarationFieldRole): FieldGroupId {
  if (role === "CUSTOMS") return "CUSTOMS";
  if (role === "REFERENCE") return "REFERENCE";
  const section = findDeclarationFieldDef(kind, f.no)?.section;
  return section && section !== "ITEMS" ? section : f.section;
}

/** Chia chỉ tiêu thành nhóm theo Phụ lục II; trong nhóm xếp theo số chỉ tiêu (các ô con cùng số giữ thứ tự dựng). Bỏ nhóm rỗng. */
export function groupDeclarationFields(kind: Kind, fields: DeclarationField[], locale: UiLocale): FieldGroup[] {
  const t = pickMessages(FIELD_GROUP_MESSAGES, locale);
  const buckets = new Map<FieldGroupId, RoledField[]>();
  for (const f of fields) {
    const role = declarationFieldRole(kind, f.no);
    const id = groupOf(kind, f, role);
    buckets.set(id, [...(buckets.get(id) ?? []), { ...f, role }]);
  }
  return GROUP_ORDER.flatMap((id) => {
    const list = buckets.get(id);
    if (!list?.length) return [];
    const sorted = list.map((f, i) => ({ f, i })).sort((a, b) => minor(a.f.no) - minor(b.f.no) || a.i - b.i).map((x) => x.f);
    const description = id === "REFERENCE" ? t.REFERENCE_description : id === "CUSTOMS" ? t.CUSTOMS_description : undefined;
    return [{ id, title: t[id], ...(description ? { description } : {}), fields: sorted }];
  });
}

/** Nhãn ô chỉ tiêu: "1.44 · Tổng trị giá hóa đơn"; không có số chỉ tiêu thì chỉ tên. */
export const fieldTitle = (f: Pick<DeclarationField, "no" | "label">) => (f.no ? `${f.no} · ${f.label}` : f.label);
