// Dạy khai báo. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/teach";
import * as http from "./http/teach";

export const teachKeys = mock.teachKeys;
export type { Lesson, TeachComparison, TeachOverview, TeachSample } from "@kb/contracts";

export const getTeachOverview = pick(mock.getTeachOverview, http.getTeachOverview);
export const uploadTeachSamples = pick(mock.uploadTeachSamples, http.uploadTeachSamples);
export const getTeachComparison = pick(mock.getTeachComparison, http.getTeachComparison);
export const retryTeachSample = pick(mock.retryTeachSample, http.retryTeachSample);
export const deleteTeachSample = pick(mock.deleteTeachSample, http.deleteTeachSample);
export const updateLesson = pick(mock.updateLesson, http.updateLesson);
export const approveLessons = pick(mock.approveLessons, http.approveLessons);
export const setTeachEnabled = pick(mock.setTeachEnabled, http.setTeachEnabled);
export const downloadTeachRules = pick(mock.downloadTeachRules, http.downloadTeachRules);
