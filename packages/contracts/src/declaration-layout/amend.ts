// Khai sửa đổi bổ sung trong thông quan (IDD → IDA01 → IDE; xuất: EDD → EDA01 → EDE): ô nào KHÔNG được sửa và căn cứ.
// - LAW: Phụ lục II TT38/2015 sửa đổi TT39/2018, mục 3 "Chỉ tiêu thông tin … không được khai bổ sung" (3.1; 3.2 khi giải phóng hàng),
//   được Điều 20 TT38 (sửa đổi TT121/2025) dẫn chiếu.
// - SYSTEM: mục 4 Phụ lục II bản TT38 "Hệ thống không hỗ trợ khai bổ sung" – sửa bằng cách ghi nội dung đúng vào ô "Ký hiệu và số hiệu".
//   Bản TT39 thay mục 4 bằng 4.1–4.3 và không còn liệt kê nhóm này; phần mềm khai báo (ảnh CHITIEU_*_SUA_*01) vẫn khóa.
// - SOFTWARE: chỉ thấy khóa trên ảnh màn hình IDA01/EDA01, chưa tìm thấy căn cứ văn bản – nghiệp vụ đã chốt giữ khóa như phần mềm khai báo
//   (2026-10-19; mã/tên đối tác nước ngoài: IDA 1.19/1.20, EDA 2.18/2.19).
type Kind = "IDA" | "EDA";
export type AmendLockBasis = "LAW" | "SYSTEM" | "SOFTWARE";
export type AmendLock = { basis: AmendLockBasis; reason: string };

const LAW = "Không được khai bổ sung (mục 3.1 Phụ lục II TT39)";
const BP = "Không được khai bổ sung khi đã đề nghị giải phóng hàng (mục 3.2 Phụ lục II TT39)";
const SYSTEM = "Hệ thống không hỗ trợ sửa – ghi nội dung đúng vào ô Ký hiệu và số hiệu";
const SOFTWARE = "Phần mềm khai báo khóa ô này khi khai sửa đổi";

/** Khóa có "{n}" khớp mọi dòng của nhóm lặp (VD_BL1…VD_BL5). */
type Rule = { keys: string[]; lock: AmendLock; when?: (v: Record<string, string>) => boolean };

const hasBp = (v: Record<string, string>) => Boolean(v["TK_BP"]?.trim());

const RULES: Record<Kind, Rule[]> = {
  IDA: [
    { keys: ["TK_ICB", "TK_CCC", "TK_MTC", "TK_CH", "TK_IMC", "TK_ICC"], lock: { basis: "LAW", reason: LAW } },
    { keys: ["APP_NHOM_LH"], lock: { basis: "LAW", reason: "Đi theo mã loại hình – không được khai bổ sung (mục 3.1 Phụ lục II TT39)" } },
    { keys: ["TK_IMN", "VD_ST"], lock: { basis: "SYSTEM", reason: SYSTEM } },
    { keys: ["TK_EPC", "TK_EPN"], lock: { basis: "SOFTWARE", reason: SOFTWARE } },
    {
      keys: ["VD_BL{n}", "VD_NO", "VD_NOT", "VD_GW", "VD_GWT", "VD_VSC", "VD_VSN", "VD_ARR", "VD_DST", "VD_DSN", "VD_PSC", "VD_PSN", "VD_COC", "TK_IV1", "TK_IV2", "TK_BP", "TK_SBC", "TK_RYA", "TK_SCM", "TK_SCN"],
      lock: { basis: "LAW", reason: BP },
      when: hasBp,
    },
  ],
  EDA: [
    { keys: ["TK_ECB", "TK_CCC", "TK_MTC", "TK_CH", "TK_EPC", "TK_ECC"], lock: { basis: "LAW", reason: LAW } },
    { keys: ["APP_NHOM_LH"], lock: { basis: "LAW", reason: "Đi theo mã loại hình – không được khai bổ sung (mục 3.1 Phụ lục II TT39)" } },
    { keys: ["TK_EPN", "TK_ST"], lock: { basis: "SYSTEM", reason: SYSTEM } },
    { keys: ["TK_CGC", "TK_CGN"], lock: { basis: "SOFTWARE", reason: SOFTWARE } },
  ],
};

const matches = (pattern: string, key: string) => (pattern.includes("{n}") ? new RegExp(`^${pattern.replace("{n}", "\\d+")}$`).test(key) : pattern === key);

/** Ô `key` có bị khóa khi khai sửa đổi không (`values`: giá trị tờ khai, xét trường hợp giải phóng hàng). null = được sửa. */
export function amendLock(kind: Kind, key: string, values: Record<string, string>): AmendLock | null {
  const rule = RULES[kind].find((r) => r.keys.some((p) => matches(p, key)) && (!r.when || r.when(values)));
  return rule ? rule.lock : null;
}
