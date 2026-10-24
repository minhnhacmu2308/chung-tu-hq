// Bước 3: chi phí và điều chỉnh trị giá (1.47 cước, 1.48 bảo hiểm, 1.49 khoản điều chỉnh). Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/value-charges";
import * as http from "./http/value-charges";

export const valueChargesKeys = mock.valueChargesKeys;
export type { ValueCharges, ValueChargesView } from "@kb/contracts";

export const getValueCharges = pick(mock.getValueCharges, http.getValueCharges);
export const saveValueCharges = pick(mock.saveValueCharges, http.saveValueCharges);
