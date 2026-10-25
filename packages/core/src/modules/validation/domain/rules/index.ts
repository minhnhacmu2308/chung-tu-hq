import type { Rule } from "../helpers.js";
import { amountSum } from "./amount-sum.js";
import { awbLength } from "./awb-length.js";
import { branchCountLocked } from "./branch-count-locked.js";
import { buyerMst } from "./buyer-mst.js";
import { containerList } from "./container-list.js";
import { countryCode } from "./country-code.js";
import { dateOrder } from "./date-order.js";
import { descriptionLength } from "./description-length.js";
import { grossWeightDigits } from "./gross-weight-digits.js";
import { hs6 } from "./hs-6.js";
import { incotermCode } from "./incoterm-code.js";
import { incotermFreight } from "./incoterm-freight.js";
import { insuranceIncoterm } from "./insurance-incoterm.js";
import { invoiceRef } from "./invoice-ref.js";
import { lawMoCu } from "./law-mo-cu.js";
import { lineAmount } from "./line-amount.js";
import { lineValueDigits } from "./line-value-digits.js";
import { max50Lines } from "./max-50-lines.js";
import { originCo } from "./origin-co.js";
import { packagesInteger } from "./packages-integer.js";
import { partyNameLength } from "./party-name-length.js";
import { podTransship } from "./pod-transship.js";
import { qtyDecimals } from "./qty-decimals.js";
import { qtyPlInv } from "./qty-pl-inv.js";
import { sharedContainer } from "./shared-container.js";
import { warehouseCode } from "./warehouse-code.js";
import { weightPlBl } from "./weight-pl-bl.js";

/** Thứ tự hiển thị trên màn OCR: BLOCKER trước (trị giá/dòng hàng → trọng lượng/kiện → điều kiện giao hàng → vận đơn/container → đối tác), rồi WARNING, INFO. */
export const RULES: Rule[] = [
  // BLOCKER
  amountSum, branchCountLocked, lineValueDigits, weightPlBl, grossWeightDigits, qtyPlInv, packagesInteger, incotermFreight, incotermCode, awbLength, containerList, countryCode, lawMoCu,
  // WARNING
  invoiceRef, lineAmount, qtyDecimals, descriptionLength, originCo, insuranceIncoterm, podTransship, dateOrder, partyNameLength, sharedContainer, warehouseCode,
  // INFO
  buyerMst, hs6, max50Lines,
];
export const ruleByCode = (code: string) => RULES.find((r) => r.code === code);
