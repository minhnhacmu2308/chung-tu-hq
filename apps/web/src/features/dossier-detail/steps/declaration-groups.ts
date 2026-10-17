// Nhóm chỉ tiêu tờ khai trên màn Review theo thứ tự Phụ lục II (TT39/2018 sửa đổi TT121/2025), kèm vai trò từng chỉ tiêu
// để người khai phân biệt: phải khai / khai theo tình huống / VNACCS tự xác định / Hải quan trả về / thông tin tham khảo.
import { declarationFieldRole, findDeclarationFieldDef, type DeclarationFieldRole } from "@kb/contracts";
import type { DeclarationField } from "@/mocks/types";

type Kind = "IDA" | "EDA";
export type FieldGroupId = "GENERAL" | "PARTIES" | "TRANSPORT" | "VALUE" | "TAX" | "REFERENCE" | "CUSTOMS";
export type RoledField = DeclarationField & { role: DeclarationFieldRole };
export type FieldGroup = { id: FieldGroupId; title: string; description?: string; fields: RoledField[] };

const GROUP_ORDER: FieldGroupId[] = ["GENERAL", "PARTIES", "TRANSPORT", "VALUE", "TAX", "REFERENCE", "CUSTOMS"];

const GROUP_INFO: Record<FieldGroupId, { title: string; description?: string }> = {
  GENERAL: { title: "Thông tin chung" },
  PARTIES: { title: "Người xuất khẩu / nhập khẩu" },
  TRANSPORT: { title: "Vận đơn & vận chuyển" },
  VALUE: { title: "Giấy phép, hóa đơn & trị giá" },
  TAX: { title: "Nộp thuế" },
  REFERENCE: {
    title: "Thông tin tham khảo",
    description: "Không phải ô trên tờ khai – ứng dụng dùng để ước tính thuế và kiểm tra. Tỷ giá chính thức do Hải quan áp tại ngày đăng ký tờ khai.",
  },
  CUSTOMS: {
    title: "Do Hải quan cấp / trả về",
    description: "Người khai không nhập. Có sau khi khai báo – xem chi tiết ở bước Khai báo Hải quan.",
  },
};

/** Nhãn và màu cho từng vai trò (dùng cho huy hiệu trên ô chỉ tiêu và chú thích đầu tab). */
export const ROLE_INFO: Record<DeclarationFieldRole, { label: string; tone: "primary" | "info" | "neutral" | "success"; meaning: string }> = {
  REQUIRED: { label: "Bắt buộc", tone: "primary", meaning: "Phải có giá trị thì Hải quan mới nhận tờ khai" },
  CONDITIONAL: { label: "Theo tình huống", tone: "info", meaning: "Bắt buộc khi lô hàng rơi vào trường hợp Phụ lục II quy định" },
  OPTIONAL: { label: "Không bắt buộc", tone: "neutral", meaning: "Khai khi có thông tin" },
  ASSIST: { label: "VNACCS tự xác định", tone: "neutral", meaning: "Bỏ trống thì hệ thống Hải quan tự xác định; chỉ khai khi muốn chỉ định" },
  CUSTOMS: { label: "Hải quan trả về", tone: "success", meaning: "Người khai không nhập – Hải quan cấp sau khi khai báo" },
  UNUSED: { label: "Chưa sử dụng", tone: "neutral", meaning: "Phụ lục II ghi chưa nhập cho đến khi có hướng dẫn" },
  REFERENCE: { label: "Tham khảo", tone: "neutral", meaning: "Không phải ô trên tờ khai, ứng dụng dùng để tính toán" },
};

const minor = (no: string | undefined) => (no ? Number(no.split(".")[1] ?? 0) : Number.POSITIVE_INFINITY);

function groupOf(kind: Kind, f: DeclarationField, role: DeclarationFieldRole): FieldGroupId {
  if (role === "CUSTOMS") return "CUSTOMS";
  if (role === "REFERENCE") return "REFERENCE";
  const section = findDeclarationFieldDef(kind, f.no)?.section;
  return section && section !== "ITEMS" ? section : f.section;
}

/** Chia chỉ tiêu thành nhóm theo Phụ lục II; trong nhóm xếp theo số chỉ tiêu (các ô con cùng số giữ thứ tự dựng). Bỏ nhóm rỗng. */
export function groupDeclarationFields(kind: Kind, fields: DeclarationField[]): FieldGroup[] {
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
    return [{ id, ...GROUP_INFO[id], fields: sorted }];
  });
}

/** Nhãn ô chỉ tiêu: "1.44 · Tổng trị giá hóa đơn"; không có số chỉ tiêu thì chỉ tên. */
export const fieldTitle = (f: Pick<DeclarationField, "no" | "label">) => (f.no ? `${f.no} · ${f.label}` : f.label);
