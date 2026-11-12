// Dữ liệu lô hàng nhập tay khi chưa có chứng từ (ADR 0013 – Khai trước). Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/manual-shipment";
import * as http from "./http/manual-shipment";

export const manualShipmentKeys = mock.manualShipmentKeys;
export type { ManualShipment, ManualShipmentInput, ManualShipmentView } from "@kb/contracts";

export const getManualShipment = pick(mock.getManualShipment, http.getManualShipment);
export const saveManualShipment = pick(mock.saveManualShipment, http.saveManualShipment);
