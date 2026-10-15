// TT121 chỉ tiêu 1.20 / TT39 chỉ tiêu 2.19 (chấp nhận tên viết tắt) + VNACCS IDA/EDA: tên đối tác nước ngoài tối đa 70 ký tự, địa chỉ 4 ô × 35 ký tự.
import { charLen, pass, skipped, warn, foreignParty, type Rule } from "../helpers.js";

const MAX_NAME = 70;
const MAX_ADDRESS = 4 * 35;

export const partyNameLength: Rule = {
  code: "R-PARTY-NAME-LENGTH",
  title: "Tên, địa chỉ đối tác nước ngoài vừa ô khai",
  severity: "WARNING",
  docKinds: ["INVOICE"],
  run(s, ctx) {
    if (!ctx.dossier) return skipped("Chưa biết hồ sơ nhập hay xuất để xác định đối tác nước ngoài");
    const { party, path } = foreignParty(s, ctx.dossier);
    const nk = ctx.dossier.direction === "NK";
    const who = nk ? "người xuất khẩu (chỉ tiêu 1.20)" : "người nhập khẩu (chỉ tiêu 2.19)";
    const name = party.name.value, addr = party.address.value;
    if (!name && !addr) return skipped(`Chưa đọc được tên, địa chỉ ${nk ? "người bán" : "người mua"}`);
    const issues: string[] = [];
    const fields: string[] = [];
    if (name && charLen(name) > MAX_NAME) {
      issues.push(`Tên ${who} có ${charLen(name)} ký tự – tối đa ${MAX_NAME}: được viết tắt hoặc rút gọn`);
      fields.push(`${path}/name`);
    }
    if (addr && charLen(addr) > MAX_ADDRESS) {
      issues.push(`Địa chỉ ${nk ? "người xuất khẩu" : "người nhập khẩu"} có ${charLen(addr)} ký tự – tối đa 4 ô × 35 = ${MAX_ADDRESS}: rút gọn`);
      fields.push(`${path}/address`);
    }
    if (issues.length) return warn(issues.join("; "), fields);
    return pass(`Tên${addr ? ", địa chỉ" : ""} ${who} vừa ô khai (tên ≤ ${MAX_NAME}, địa chỉ ≤ ${MAX_ADDRESS} ký tự)`, [`${path}/name`]);
  },
};
