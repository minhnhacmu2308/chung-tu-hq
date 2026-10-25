// Đã khai N tờ (có tờ được Hải quan cấp số – TK_DNO = N đã gửi) mà số tờ cần khai nay khác N (sửa dòng hàng sau khi có số) → chặn truyền cho tới khi hủy tờ thừa / khai lại.
// N = số tờ đã lập kết quả (lockedSheetCount), không phải số tờ đã có số: chuỗi dừng giữa chừng (tờ 2 bị từ chối, tờ 3 chưa gửi) vẫn là N tờ.
import { branchCount, sheetCountChanged } from "@kb/contracts";
import { fail, pass, skipped, type Rule } from "../helpers.js";

export const branchCountLocked: Rule = {
  code: "R-BRANCH-COUNT-LOCKED",
  title: "Số tờ khai không đổi sau khi đã cấp số",
  severity: "BLOCKER",
  docKinds: ["INVOICE"],
  run(s, ctx) {
    const planned = ctx.plannedBranches ?? 0;
    if (planned <= 0) return skipped("Chưa có tờ khai nào được cấp số");
    const n = s.items.length;
    const now = branchCount(n);
    if (!sheetCountChanged(planned, now)) return pass(`Đã khai ${planned} tờ khai – khớp số tờ của lô hàng (${n} dòng)`, ["/items"]);
    if (now < planned) return fail(`Đã khai ${planned} tờ khai (đã được cấp số) nhưng lô hàng nay chỉ còn ${now} tờ (${n} dòng) – hủy tờ khai thừa trước khi truyền`, ["/items"]);
    return fail(`Đã khai ${planned} tờ khai (đã được cấp số) nhưng lô hàng nay cần ${now} tờ (${n} dòng) – hủy tờ khai đã cấp số rồi khai lại trước khi truyền`, ["/items"]);
  },
};
