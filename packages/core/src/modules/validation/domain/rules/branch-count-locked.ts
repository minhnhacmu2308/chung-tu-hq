// Đã có số tờ khai cho N tờ mà số tờ cần khai nay khác N (sửa dòng hàng sau khi Hải quan cấp số) → chặn truyền cho tới khi hủy tờ thừa / khai lại.
import { branchCount } from "@kb/contracts";
import { fail, pass, skipped, type Rule } from "../helpers.js";

export const branchCountLocked: Rule = {
  code: "R-BRANCH-COUNT-LOCKED",
  title: "Số tờ khai không đổi sau khi đã cấp số",
  severity: "BLOCKER",
  docKinds: ["INVOICE"],
  run(s, ctx) {
    const issued = ctx.issuedBranches ?? 0;
    if (issued <= 0) return skipped("Chưa có tờ khai nào được cấp số");
    const n = s.items.length;
    const now = branchCount(n);
    if (now === issued) return pass(`Đã có số tờ khai cho ${issued} tờ – khớp số tờ của lô hàng (${n} dòng)`, ["/items"]);
    if (now < issued) return fail(`Đã có số tờ khai cho ${issued} tờ nhưng lô hàng nay chỉ còn ${now} tờ (${n} dòng) – hủy tờ khai thừa trước khi truyền`, ["/items"]);
    return fail(`Đã có số tờ khai cho ${issued} tờ nhưng lô hàng nay cần ${now} tờ (${n} dòng) – hủy tờ khai đã cấp số rồi khai lại trước khi truyền`, ["/items"]);
  },
};
