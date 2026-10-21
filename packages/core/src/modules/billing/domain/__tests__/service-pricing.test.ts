import { describe, expect, it } from "vitest";
import { dec } from "../../../../shared/decimal.js";
import { serviceCostVnd, ZERO_SERVICE_PRICES, type ServicePrices } from "../service-pricing.js";

const prices: ServicePrices = { hscodeproPerItemVnd: dec("1500.5"), customsHubPerMessageVnd: dec("2200") };

describe("serviceCostVnd", () => {
  it("HSCodePro: đơn giá × số dòng gửi (tạo lượt, trả lời); số thập phân giữ chính xác", () => {
    expect(serviceCostVnd({ provider: "HSCODEPRO", kind: "HS_CLASSIFY", quantity: 3 }, prices).toFixed()).toBe("4501.5");
    expect(serviceCostVnd({ provider: "HSCODEPRO", kind: "HS_ANSWER", quantity: 1 }, prices).toFixed()).toBe("1500.5");
  });
  it("HSCodePro: lượt hỏi nhận kết quả không tính tiền lần nữa", () => {
    expect(serviceCostVnd({ provider: "HSCODEPRO", kind: "HS_RESULT", quantity: 5 }, prices).toFixed()).toBe("0");
  });
  it("Customs Hub: đơn giá × số thông điệp (gửi nghiệp vụ và hỏi trạng thái)", () => {
    expect(serviceCostVnd({ provider: "CUSTOMS_HUB", kind: "CUSTOMS_SEND", quantity: 1 }, prices).toFixed()).toBe("2200");
    expect(serviceCostVnd({ provider: "CUSTOMS_HUB", kind: "CUSTOMS_QUERY", quantity: 2 }, prices).toFixed()).toBe("4400");
  });
  it("chưa cấu hình đơn giá → 0; số lượng âm/lẻ → 0", () => {
    expect(serviceCostVnd({ provider: "CUSTOMS_HUB", kind: "CUSTOMS_SEND", quantity: 1 }, ZERO_SERVICE_PRICES).toFixed()).toBe("0");
    expect(serviceCostVnd({ provider: "HSCODEPRO", kind: "HS_CLASSIFY", quantity: -2 }, prices).toFixed()).toBe("0");
    expect(serviceCostVnd({ provider: "HSCODEPRO", kind: "HS_CLASSIFY", quantity: 1.5 }, prices).toFixed()).toBe("0");
  });
});
