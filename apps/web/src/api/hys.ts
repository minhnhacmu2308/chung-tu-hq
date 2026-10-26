// HYS – hồ sơ đính kèm điện tử khai trước IDA/EDA. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/hys";
import * as http from "./http/hys";

export type { HysOverview, HysSubmissionView } from "@kb/contracts";

export const hysKeys = {
  all: ["hys"] as const,
  overview: (dossierId: string) => ["hys", dossierId] as const,
};

export const getHysOverview = pick(mock.getHysOverview, http.getHysOverview);
export const createHys = pick(mock.createHys, http.createHys);
export const updateHys = pick(mock.updateHys, http.updateHys);
export const deleteHys = pick(mock.deleteHys, http.deleteHys);
export const uploadHysFiles = pick(mock.uploadHysFiles, http.uploadHysFiles);
export const removeHysFile = pick(mock.removeHysFile, http.removeHysFile);
export const sendHys = pick(mock.sendHys, http.sendHys);
