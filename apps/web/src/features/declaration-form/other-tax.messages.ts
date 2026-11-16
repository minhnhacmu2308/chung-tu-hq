import { OTHER_TAX_GROUPS, type OtherTaxGroupKey } from "@kb/contracts";
import { defineMessages } from "@kb/ui";

/** Khối "Thuế và thu khác": nhãn 5 loại thuế (mỗi dòng một loại cố định), nhãn phạm vi lọc mã. Khóa nhóm = OTHER_TAX_GROUPS[].key. */
export const OTHER_TAX_MESSAGES = defineMessages({
  vi: {
    CBPG: "CBPG (tự vệ, chống trợ cấp, chống bán phá giá)",
    PBDX: "Chống phân biệt đối xử",
    TTDB: "Tiêu thụ đặc biệt",
    BVMT: "Bảo vệ môi trường",
    GTGT: "GTGT",
    scopeLetters: "Mã bắt đầu bằng {letters}",
    rowAria: "{label} – {group}",
    groupHeader: "Loại thuế",
    confirm: "Xác nhận",
    confirmAria: "Xác nhận mã GTGT {code} là đúng",
    pickHint: "Ô trống: chọn loại thuế cần thêm cho dòng hàng, rồi chọn mã. Bản in tự xếp lại theo thứ tự CBPG → PBĐX → TTĐB → BVMT → GTGT.",
  },
  en: {
    CBPG: "CBPG (safeguard, countervailing, anti-dumping)",
    PBDX: "Anti-discrimination",
    TTDB: "Special consumption tax",
    BVMT: "Environmental protection tax",
    GTGT: "VAT",
    scopeLetters: "Codes starting with {letters}",
    rowAria: "{label} – {group}",
    groupHeader: "Tax type",
    confirm: "Confirm",
    confirmAria: "Confirm VAT code {code} is correct",
    pickHint: "Empty box: choose the tax type to add to this line, then pick the code. The printout reorders taxes automatically (CBPG → anti-discrimination → special consumption → environmental → VAT).",
  },
  zh: {
    CBPG: "CBPG（保障措施、反补贴、反倾销）",
    PBDX: "反歧视",
    TTDB: "特别消费税",
    BVMT: "环境保护税",
    GTGT: "增值税",
    scopeLetters: "以 {letters} 开头的代码",
    rowAria: "{label} – {group}",
    groupHeader: "税种",
    confirm: "确认",
    confirmAria: "确认增值税代码 {code} 正确",
    pickHint: "空白栏：先选择要为该行添加的税种，再选择代码。打印件会自动按 CBPG → 反歧视 → 特别消费税 → 环境保护税 → 增值税 的顺序排列。",
  },
});

/** Khóa nhóm → khóa nhãn: thêm nhóm ở @kb/contracts mà quên nhãn thì lỗi TypeScript (không ép kiểu). */
const GROUP_LABEL_KEY = { CBPG: "CBPG", PBDX: "PBDX", TTDB: "TTDB", BVMT: "BVMT", GTGT: "GTGT" } as const satisfies Record<OtherTaxGroupKey, keyof (typeof OTHER_TAX_MESSAGES)["vi"]>;

/** Nhãn loại thuế của khóa dòng (LayoutRepeat.rowKeys); khóa lạ → undefined. */
export function otherTaxGroupLabel(t: Record<keyof (typeof OTHER_TAX_MESSAGES)["vi"], string>, rowKey: string | undefined): string | undefined {
  const group = OTHER_TAX_GROUPS.find((g) => g.key === rowKey);
  return group ? t[GROUP_LABEL_KEY[group.key]] : undefined;
}
