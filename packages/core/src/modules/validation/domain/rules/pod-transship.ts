import { pass, skipped, warn, type Rule } from "../helpers.js";

const VN = /\b(viet\s*nam|vietnam|việt\s*nam|hai\s*phong|haiphong|ho\s*chi\s*minh|hcm|saigon|sai\s*gon|da\s*nang|danang|cat\s*lai|tan\s*vu|dinh\s*vu|cai\s*mep|quy\s*nhon|noi\s*bai|tan\s*son\s*nhat|VN[A-Z]{3})\b/i;

/** Cảng dỡ trên B/L là cảng chuyển tải nước ngoài → dùng điểm đến cuối tại Việt Nam (PRODUCT §7.5). */
export const podTransship: Rule = {
  code: "R-POD-TRANSSHIP",
  title: "Cảng dỡ hàng phải ở Việt Nam",
  severity: "WARNING",
  docKinds: ["BILL_OF_LADING", "ARRIVAL_NOTICE"],
  run(s) {
    const pod = s.transport.portOfDischarge.value;
    if (!pod) return skipped("Chưa đọc được cảng dỡ hàng");
    if (VN.test(pod)) return pass(`Cảng dỡ ${pod} tại Việt Nam`, ["/transport/portOfDischarge"]);
    const dest = s.transport.finalDestination.value;
    return dest
      ? warn(`Cảng dỡ trên vận đơn (${pod}) là cảng chuyển tải – tờ khai dùng điểm đến cuối ${dest}`, ["/transport/portOfDischarge", "/transport/finalDestination"])
      : warn(`Cảng dỡ trên vận đơn (${pod}) không ở Việt Nam và chưa có điểm đến cuối – cần Arrival Notice`, ["/transport/portOfDischarge"]);
  },
};
