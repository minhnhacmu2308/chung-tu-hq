import type { Rule } from "../helpers.js";
import { amountSum } from "./amount-sum.js";
import { buyerMst } from "./buyer-mst.js";
import { dateOrder } from "./date-order.js";
import { hs6 } from "./hs-6.js";
import { incotermFreight } from "./incoterm-freight.js";
import { invoiceRef } from "./invoice-ref.js";
import { lawMoCu } from "./law-mo-cu.js";
import { originCo } from "./origin-co.js";
import { podTransship } from "./pod-transship.js";
import { qtyPlInv } from "./qty-pl-inv.js";
import { sharedContainer } from "./shared-container.js";
import { warehouseCode } from "./warehouse-code.js";
import { weightPlBl } from "./weight-pl-bl.js";

/** Thứ tự hiển thị trên màn OCR: BLOCKER trước. */
export const RULES: Rule[] = [amountSum, weightPlBl, qtyPlInv, incotermFreight, lawMoCu, invoiceRef, originCo, podTransship, dateOrder, sharedContainer, warehouseCode, buyerMst, hs6];
export const ruleByCode = (code: string) => RULES.find((r) => r.code === code);
