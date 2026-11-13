// Phản hồi `POST /api/KVGS` của FPT (đặc tả API-KVGS) → KvgsSheet (ADR 0014). Tên trường đúng đặc tả, parse bằng FptKvgsResponseSchema.
// errorList không rỗng → REJECTED (lỗi Hải quan / thiếu trường gửi); thiếu dữ liệu để in → REJECTED với KVGS_RESPONSE_INCOMPLETE (người gọi giữ `raw`).
import { FptKvgsResponseSchema, isPlainBase64, KvgsSheetSchema, type FptErrorItem, type FptKvgsServiceMessage, type KvgsSheet } from "@kb/contracts";
import { Decimal } from "../../../shared/decimal.js";
import type { GatewayError } from "../application/customs-ports.js";

export type KvgsOutcome = { state: "ACCEPTED"; sheet: KvgsSheet } | { state: "REJECTED"; errors: GatewayError[] };

const str = (v: string | null | undefined): string => (v ?? "").trim();
/** Số FPT (number, có thể là chuỗi số) → chuỗi thập phân không dạng mũ; không có / không phải số → "". */
const decStr = (v: number | string | null | undefined): string => {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return "";
  try {
    const d = new Decimal(typeof v === "string" ? v.trim() : v);
    return d.isFinite() ? d.toFixed() : "";
  } catch {
    return "";
  }
};
/** `dd/MM/yyyy` → `YYYY-MM-DD`; dạng khác → "". */
const isoDate = (v: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
/** `dd/MM/yyyy HH:mm:ss` giờ Việt Nam (+07:00) → ISO UTC; không hiểu → null. */
const vnDateTimeToUtc = (v: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (!m) return null;
  const ms = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0) - 7, Number(m[5] ?? 0), Number(m[6] ?? 0));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

/** Lỗi FPT → GatewayError. `nameCode` là tên trường khi thiếu dữ liệu; "000" (lỗi Hải quan) / "Lỗi hệ thống" không phải tên trường. */
export function kvgsErrors(list: FptErrorItem[]): GatewayError[] {
  return list.map((e) => {
    const name = str(e.nameCode);
    const line = Number(e.rowPosition ?? 0);
    const solution = str(e.proposedSolution);
    return {
      code: str(e.errorCode) || "FPT",
      ...(/^[A-Za-z][A-Za-z0-9_]*$/.test(name) ? { field: name } : {}),
      message: str(e.errorContent) || "Lỗi FPT",
      ...(solution ? { solution } : {}),
      ...(Number.isInteger(line) && line > 0 ? { line } : {}),
    };
  });
}

const incomplete = (missing: string[]): KvgsOutcome => ({
  state: "REJECTED",
  errors: [{ code: "KVGS_RESPONSE_INCOMPLETE", message: `Phản hồi của Hải quan thiếu thông tin để in (${missing.join(", ")})` }],
});

/** `now` = thời điểm lấy dữ liệu khi phản hồi không có `thoiGianLayDuLieu`. */
export function mapKvgsResponse(raw: unknown, now: Date = new Date()): KvgsOutcome {
  const parsed = FptKvgsResponseSchema.safeParse(raw);
  if (!parsed.success) return incomplete(["response"]);
  if (parsed.data.errorList?.length) return { state: "REJECTED", errors: kvgsErrors(parsed.data.errorList) };
  const m = parsed.data.serviceMessage;
  if (!m) return incomplete(["serviceMessage"]);
  return mapServiceMessage(m, now);
}

function mapServiceMessage(m: FptKvgsServiceMessage, now: Date): KvgsOutcome {
  const kind = Number(m.isContainer) === 1 ? "CONTAINER" : "CARGO";
  const missing: string[] = [];
  const declarationNo = str(m.soToKhai);
  const cargoControlNo = str(m.soDinhDanh);
  if (!declarationNo) missing.push("soToKhai");
  if (!cargoControlNo) missing.push("soDinhDanh");

  const containers = (m.bangKeMaVachContainer ?? [])
    .map((c) => {
      const image = (c.barcodeImage ?? "").replace(/\s+/g, "");
      return { containerNo: str(c.soContainer), sealNo: str(c.soSeal) || null, customsSealNo: str(c.soSealHQ) || null, barcodeImage: image || null };
    })
    .filter((c) => c.containerNo);
  if (kind === "CONTAINER" && containers.length === 0) missing.push("bangKeMaVachContainer");
  containers.forEach((c, i) => { if (c.barcodeImage && !isPlainBase64(c.barcodeImage)) missing.push(`bangKeMaVachContainer[${i}].barcodeImage`); });

  const quantity = decStr(m.so_Luong_Hang);
  const grossWeight = decStr(m.tong_Trong_Luong_Hang);
  const cargo = quantity || grossWeight ? { quantity, quantityUnit: str(m.dvT_So_Luong_Hang), grossWeight, weightUnit: str(m.dvT_Tong_Trong_Luong_Hang) } : null;
  if (kind === "CARGO" && !quantity) missing.push("so_Luong_Hang");

  const declarationDate = isoDate(str(m.ngayToKhai));
  if (!declarationDate) missing.push("ngayToKhai");
  if (missing.length) return incomplete(missing);

  const ddgs = [str(m.maDDGS), str(m.tenDDGS)].filter(Boolean).join(": ");
  const sheet = KvgsSheetSchema.safeParse({
    kind,
    regionOffice: str(m.tenCucHaiQuan),
    customsOffice: str(m.tenChiCucHaiQuan),
    supervisionOffice: [str(m.tenChiCucHaiQuanGS), ddgs].filter(Boolean).join(" - "),
    sealRequired: containers.some((c) => !!c.customsSealNo),
    companyName: str(m.tenDonViXNK),
    taxCode: str(m.maSoThue),
    declarationNo,
    declarationStatus: str(m.trangThaiToKhai),
    declarationDate,
    declarationDateTo: null,
    typeName: str(m.tenLoaiHinh),
    channel: str(m.luongToKhai),
    cargoControlNo,
    // Hàng lẻ: mã vạch Code128 của số tờ khai (chủ sản phẩm chốt); hàng container: ảnh mã vạch theo từng dòng.
    barcode: kind === "CARGO" ? declarationNo : null,
    containers: kind === "CONTAINER" ? containers : [],
    cargo,
    exportedAt: vnDateTimeToUtc(str(m.thoiGianLayDuLieu)) ?? now.toISOString(),
  });
  if (!sheet.success) return incomplete(sheet.error.issues.map((i) => i.path.join(".")));
  return { state: "ACCEPTED", sheet: sheet.data };
}
