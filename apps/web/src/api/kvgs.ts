// Qua khu vực giám sát (danh sách container + bảng kê KVGS). Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/kvgs";
import * as http from "./http/kvgs";

export type { KvgsView, KvgsSheet, ContainerListRow, SaveContainerListInput } from "@kb/contracts";

export const kvgsKeys = mock.kvgsKeys;

export const getKvgs = pick(mock.getKvgs, http.getKvgs);
export const saveContainerList = pick(mock.saveContainerList, http.saveContainerList);
export const refillContainerList = pick(mock.refillContainerList, http.refillContainerList);
export const sendContainerList = pick(mock.sendContainerList, http.sendContainerList);
export const fetchKvgs = pick(mock.fetchKvgs, http.fetchKvgs);
export const pollNow = pick(mock.pollNow, http.pollNow);
