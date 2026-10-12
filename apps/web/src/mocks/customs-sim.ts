// Mô phỏng truyền nhận VNACCS qua Customs Hub: sinh chuỗi thông điệp theo thời gian.
// Dùng cho seed (lô đã truyền) và api/customs (lô truyền trong buổi demo).
import { fromMinor, sumMinor, toMinor } from "@/lib/decimal";
import type { CustomsChannel, CustomsMessage, CustomsOperation, CustomsResult, Declaration, Dossier } from "./types";

export const CHANNEL_NOTES: Record<CustomsChannel, string> = {
  GREEN: "Luồng xanh – miễn kiểm tra chi tiết hồ sơ và thực tế hàng hóa",
  YELLOW: "Luồng vàng – kiểm tra chi tiết hồ sơ, miễn kiểm tra thực tế hàng hóa",
  RED: "Luồng đỏ – kiểm tra chi tiết hồ sơ và thực tế hàng hóa",
};

const CHANNEL_VI: Record<CustomsChannel, string> = { GREEN: "xanh", YELLOW: "vàng", RED: "đỏ" };

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Số tờ khai 12 chữ số: 10… nhập, 30… xuất. */
export function declarationNoFor(d: Dossier): string {
  return `${d.direction === "NK" ? "107" : "307"}${String(hash(d.id) % 1_000_000_000).padStart(9, "0")}`;
}

/** Phân luồng mô phỏng: hồ sơ ARTEMIDE (dos_024) luôn xanh để demo trọn luồng; còn lại theo hash. */
export function channelFor(d: Dossier): CustomsChannel {
  if (d.id === "dos_024") return "GREEN";
  const r = hash(d.id) % 10;
  return r < 6 ? "GREEN" : r < 9 ? "YELLOW" : "RED";
}

const mask = (mst: string) => `${mst.slice(0, 4)}****${mst.slice(-2)}`;

type Step = { op: CustomsOperation; dir: "OUT" | "IN"; result: CustomsMessage["result"]; summary: string; at: number; payload: Record<string, unknown> };

/**
 * Dòng thời gian truyền tờ khai. `unitMs` = khoảng cách giữa hai thông điệp
 * (vài giây khi demo trực tiếp, vài phút cho dữ liệu mẫu).
 */
export function buildSubmission(
  d: Dossier,
  decl: Declaration,
  taxCode: string,
  startMs: number,
  unitMs: number,
  opts: { channel?: CustomsChannel; hysRetry?: boolean; clearedAfterInspection?: boolean; documentCount?: number } = {},
): { messages: CustomsMessage[]; result: CustomsResult } {
  const nk = d.direction === "NK";
  const first: CustomsOperation = nk ? "IDA" : "EDA";
  const second: CustomsOperation = nk ? "IDC" : "EDC";
  const channel = opts.channel ?? channelFor(d);
  const no = d.declarationNo ?? declarationNoFor(d);
  const base = { maLoaiHinh: d.typeCode, mst: mask(taxCode), soVanDon: d.billNo || "—", coQuanHQ: d.customsOffice.split(" ")[0] };
  const taxVnd = fromMinor(sumMinor([toMinor(decl.estimatedImportDutyVnd, 0), toMinor(decl.estimatedVatVnd, 0)]), 0);

  const steps: Step[] = [
    { op: first, dir: "OUT", result: "OK", summary: `Gửi khai trước thông tin tờ khai (${first})`, at: 0, payload: { nghiepVu: first, ...base, triGiaHoaDon: `${decl.fields.find((f) => f.code === "TONG_TG")?.value} ${d.currency}` } },
    { op: first, dir: "IN", result: "OK", summary: `Hải quan cấp số tờ khai ${no}`, at: 1, payload: { nghiepVu: first, ketQua: "Thành công", soToKhai: no } },
    { op: second, dir: "OUT", result: "OK", summary: `Khai chính thức tờ khai (${second})`, at: 2, payload: { nghiepVu: second, soToKhai: no, chuKySo: "Đã ký" } },
    { op: second, dir: "IN", result: "OK", summary: `Kết quả phân luồng: luồng ${CHANNEL_VI[channel]}`, at: 3, payload: { nghiepVu: second, soToKhai: no, maPhanLuong: channel === "GREEN" ? 1 : channel === "YELLOW" ? 2 : 3, thueDuKien: `${taxVnd} VND` } },
  ];
  let t = 4;
  if (opts.hysRetry) {
    steps.push({ op: "HYS", dir: "OUT", result: "ERROR", summary: "Gửi hồ sơ điện tử thất bại – phiên ký số hết hạn (E-SIG-401)", at: t++, payload: { nghiepVu: "HYS", soToKhai: no, loi: "E-SIG-401" } });
  }
  steps.push({ op: "HYS", dir: "OUT", result: "OK", summary: `Gửi hồ sơ chứng từ điện tử (${opts.documentCount ?? 4} tệp đính kèm)`, at: t++, payload: { nghiepVu: "HYS", soToKhai: no, soTep: opts.documentCount ?? 4 } });
  const clearedNow = channel === "GREEN" || opts.clearedAfterInspection;
  steps.push({
    op: "IEX",
    dir: "IN",
    result: "OK",
    summary: channel === "GREEN" ? "Trạng thái tờ khai: Đã thông quan" : channel === "YELLOW" ? "Trạng thái: Chờ kiểm tra chi tiết hồ sơ" : "Trạng thái: Chờ kiểm tra thực tế hàng hóa",
    at: t++,
    payload: { nghiepVu: "IEX", soToKhai: no, trangThai: channel === "GREEN" ? "Thông quan" : "Đang kiểm tra" },
  });
  if (opts.clearedAfterInspection && channel !== "GREEN") {
    steps.push({ op: "IEX", dir: "IN", result: "OK", summary: "Trạng thái tờ khai: Đã thông quan sau kiểm tra", at: t + 6, payload: { nghiepVu: "IEX", soToKhai: no, trangThai: "Thông quan" } });
    t += 6;
  }

  const messages = steps.map((s, i) => ({
    id: `msg_${d.id.slice(4)}_${startMs.toString(36)}_${i}`,
    dossierId: d.id,
    operation: s.op,
    direction: s.dir,
    result: s.result,
    summary: s.summary,
    at: new Date(startMs + s.at * unitMs).toISOString(),
    payloadPreview: JSON.stringify(s.payload, null, 2),
  }));
  const last = messages[messages.length - 1]!;
  return {
    messages,
    result: {
      dossierId: d.id,
      declarationNo: no,
      channel,
      channelNote: CHANNEL_NOTES[channel],
      clearanceStatus: clearedNow ? "CLEARED" : "INSPECTING",
      customsTaxVnd: taxVnd,
      updatedAt: last.at,
    },
  };
}
