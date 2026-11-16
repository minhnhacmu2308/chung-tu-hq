// Hàm thuần của chỉ tiêu tờ khai nhận locale: chữ giao diện theo ngôn ngữ; tên chỉ tiêu / mã (@kb/contracts) giữ nguyên.
import { describe, expect, it } from "vitest";
import { codeScope } from "./code-scope";
import { declarationLockOf } from "./dossier-adapter";

describe("hàm thuần nhận locale", () => {
  it("phạm vi lọc danh mục", () => expect(codeScope("A014", "TK_CHB", "IDA", { TK_CH: "06B1" }, "zh")?.label).toBe("06B1 的部门"));
  it("lý do khóa ô dòng hàng", () => {
    const lock = declarationLockOf("IDA", "LOCKED", {}, new Map(), "en");
    expect(lock("HAG_CMD")?.reason).toBe("From the HS code – use Select HS code");
  });
});
