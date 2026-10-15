// Chỉ tiêu 1.23/2.22 – TT39 PL II: mã nước gồm 02 ký tự (bảng mã UN LOCODE/ISO 3166-1).
import { fail, foreignParty, pass, skipped, type Rule } from "../helpers.js";

export const countryCode: Rule = {
  code: "R-COUNTRY-CODE",
  title: "Mã nước đối tác nước ngoài là mã ISO 2 ký tự",
  severity: "BLOCKER",
  docKinds: ["INVOICE"],
  run(s, ctx) {
    if (!ctx.dossier) return skipped("Chưa biết hồ sơ nhập hay xuất để xác định đối tác nước ngoài");
    const { party, path } = foreignParty(s, ctx.dossier);
    const nk = ctx.dossier.direction === "NK";
    const v = party.country.value;
    if (!v) return skipped(`Chưa đọc được nước của ${nk ? "người bán" : "người mua"}`);
    const f = [`${path}/country`];
    const ind = nk ? "1.23" : "2.22";
    return /^[A-Z]{2}$/.test(v)
      ? pass(`Mã nước ${nk ? "người xuất khẩu" : "người nhập khẩu"} ${v} (chỉ tiêu ${ind})`, f)
      : fail(`Mã nước phải là mã ISO 2 ký tự (ví dụ KR, CN) – đang là '${v}' (chỉ tiêu ${ind})`, f);
  },
};
