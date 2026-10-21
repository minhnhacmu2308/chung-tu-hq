// Cổng ghi chi phí dịch vụ trả phí bên thứ 3 không phải AI (HSCodePro, Customs Hub/FPT.VNACCS) vào usage_events.
// Hiện thực ở billing (tính tiền theo đơn giá cấu hình); module nghiệp vụ chỉ biết cổng này (composition root nối).

export type ServiceProvider = "HSCODEPRO" | "CUSTOMS_HUB";

/**
 * Loại lệnh gọi (cột `usage_events.kind`; tiền tố HS_ / CUSTOMS_ dùng để tách giá vốn theo nhà cung cấp):
 * - HS_CLASSIFY: tạo lượt phân loại (gồm phân loại lại) – `quantity` = số dòng gửi đi.
 * - HS_ANSWER: gửi câu trả lời cho một dòng – HSCodePro phân loại lại dòng đó (`quantity` = 1).
 * - HS_RESULT: lượt hỏi kết quả nhận về kết quả mới – `quantity` = số dòng có kết quả (chỉ thống kê, không tính tiền lần nữa).
 * - CUSTOMS_SEND: gửi một nghiệp vụ (IDA, IDC, HYS, IDB…) – một thông điệp.
 * - CUSTOMS_QUERY: hỏi trạng thái tờ khai (IID/IEX) – một thông điệp.
 */
export type ServiceUsageKind = "HS_CLASSIFY" | "HS_ANSWER" | "HS_RESULT" | "CUSTOMS_SEND" | "CUSTOMS_QUERY";

export type ServiceUsage = {
  orgId: string;
  dossierId: string | null;
  provider: ServiceProvider;
  kind: ServiceUsageKind;
  /** Mã nghiệp vụ: CLASSIFY/RECLASSIFY/ANSWER/POLL (HSCodePro) hoặc mã FPT (IDA, IDC, IID…). */
  operation: string;
  /** Số dòng hàng (HSCodePro) hoặc số thông điệp (Customs Hub). */
  quantity: number;
  /** Khóa chống ghi trùng: cùng khóa chỉ ghi một lần (vd idempotencyKey của outbox khi job chạy lại). */
  dedupeKey?: string;
  /** Thông tin tra cứu thêm (mã lượt ngoài…) – không chứa bí mật. */
  meta?: Record<string, string | number | boolean | null>;
};

export interface ServiceUsageMeter {
  record(e: ServiceUsage): Promise<void>;
}

/**
 * Ghi chi phí kiểu "cố gắng hết sức": lỗi ghi KHÔNG làm hỏng nghiệp vụ (đã gửi thật rồi), chỉ log.
 * Không nối meter (test/cấu hình cũ) → bỏ qua.
 */
export async function meterSafely(meter: ServiceUsageMeter | undefined, e: ServiceUsage, log: (msg: string) => void = (m) => console.error(m)): Promise<void> {
  if (!meter) return;
  try {
    await meter.record(e);
  } catch (x) {
    log(`[usage] Không ghi được chi phí ${e.provider} ${e.operation} (org ${e.orgId}): ${x instanceof Error ? x.message : String(x)}`);
  }
}

/** Meter ghi vào bộ nhớ cho test use case: cùng `dedupeKey` chỉ ghi một lần (như ràng buộc id trong DB). `fail` = mô phỏng DB lỗi. */
export class RecordingUsageMeter implements ServiceUsageMeter {
  readonly events: ServiceUsage[] = [];
  fail = false;
  async record(e: ServiceUsage) {
    if (this.fail) throw new Error("db down");
    if (e.dedupeKey && this.events.some((x) => x.dedupeKey === e.dedupeKey)) return;
    this.events.push(e);
  }
}
