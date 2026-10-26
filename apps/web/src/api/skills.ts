// Cấu hình Skill AI. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/skills";
import * as http from "./http/skills";

export const skillKeys = mock.skillKeys;
export const MIN_SAMPLES_FOR_ACCURACY = mock.MIN_SAMPLES_FOR_ACCURACY;
export type { CreateSkillInput, EvaluationResult, LabeledSample, LearnSummary, SkillFieldPatch, SkillSuggestion, StaleReads } from "@kb/contracts";

export const listSkills = pick(mock.listSkills, http.listSkills);
export const getSkillById = pick(mock.getSkillById, http.getSkillById);
export const createSkill = pick(mock.createSkill, http.createSkill);
export const setSkillEnabled = pick(mock.setSkillEnabled, http.setSkillEnabled);
export const updateSkillField = pick(mock.updateSkillField, http.updateSkillField);
export const addSkillField = pick(mock.addSkillField, http.addSkillField);
export const removeSkillField = pick(mock.removeSkillField, http.removeSkillField);
export const listSamples = pick(mock.listSamples, http.listSamples);
export const uploadSamples = pick(mock.uploadSamples, http.uploadSamples);
export const getSampleLabel = pick(mock.getSampleLabel, http.getSampleLabel);
export const labelSample = pick(mock.labelSample, http.labelSample);
export const confirmPendingSamples = pick(mock.confirmPendingSamples, http.confirmPendingSamples);
export const getEvaluation = pick(mock.getEvaluation, http.getEvaluation);
export const evaluateSkill = pick(mock.evaluateSkill, http.evaluateSkill);
export const learnFromReview = pick(mock.learnFromReview, http.learnFromReview);
export const listSuggestions = pick(mock.listSuggestions, http.listSuggestions);
export const suggestAlias = pick(mock.suggestAlias, http.suggestAlias);
export const acceptSuggestion = pick(mock.acceptSuggestion, http.acceptSuggestion);
export const dismissSuggestion = pick(mock.dismissSuggestion, http.dismissSuggestion);
export const getStaleReads = pick(mock.getStaleReads, http.getStaleReads);
export const rereadStale = pick(mock.rereadStale, http.rereadStale);
export const waitForEvaluation = pick(mock.waitForEvaluation, http.waitForEvaluation);
