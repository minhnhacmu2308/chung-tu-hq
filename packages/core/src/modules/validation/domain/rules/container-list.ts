// TT121 Điều 18 khoản 1 điểm k + chỉ tiêu 2.60 (tối đa 50 số container): tờ khai xuất hàng container khai đủ số container; nhập khai danh sách container qua HYS (chỉ tiêu 1.35).
import { fail, listSome, pass, skipped, warn, type Rule } from "../helpers.js";

const MAX_XK = 50;

export const containerList: Rule = {
  code: "R-CONTAINER-LIST",
  title: "Danh sách container theo phương thức vận chuyển",
  severity: "BLOCKER",
  docKinds: ["BILL_OF_LADING"],
  run(s, ctx) {
    const d = ctx.dossier;
    if (!d) return skipped("Chưa biết phương thức vận chuyển của hồ sơ");
    const cs = s.transport.containers;
    const f = ["/transport/containers"];
    if (d.transportMode === "AIR") {
      return cs.length ? warn(`Đường hàng không không khai số lượng container – chứng từ có ${cs.length} container (${listSome(cs.map((c) => c.no))}): kiểm tra phương thức vận chuyển`, f) : skipped("Đường hàng không: không khai container");
    }
    if (d.transportMode !== "SEA_CONTAINER") return skipped("Phương thức vận chuyển không phải đường biển container");
    if (d.direction === "XK") {
      if (!cs.length) return fail("Tờ khai xuất hàng container phải khai đầy đủ số container (TT121, Điều 18 khoản 1 điểm k)", f);
      if (cs.length > MAX_XK) return warn(`Lô hàng có ${cs.length} container – chỉ tiêu 2.60 nhận tối đa ${MAX_XK} số container: tách tờ khai hoặc kiểm tra lại danh sách`, f);
      return pass(`${cs.length} container sẽ khai ở chỉ tiêu 2.60: ${listSome(cs.map((c) => c.no))}`, f);
    }
    if (!cs.length) return warn("Vận đơn chưa có số container – kiểm tra phương thức vận chuyển và khai danh sách container qua HYS (chỉ tiêu 1.35)", f);
    const noSeal = cs.filter((c) => !c.sealNo);
    if (noSeal.length) return warn(`${noSeal.length}/${cs.length} container chưa có số seal: ${listSome(noSeal.map((c) => c.no))} – bổ sung trước khi khai danh sách container qua HYS (chỉ tiêu 1.35)`, f);
    return pass(`${cs.length} container (${listSome(cs.map((c) => `${c.no}/${c.sealNo}`))}) – sau khi có số tờ khai, khai danh sách container + số seal qua nghiệp vụ HYS (chỉ tiêu 1.35)`, f);
  },
};
