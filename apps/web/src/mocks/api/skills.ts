// Cấu hình Skill AI (mock). Có backend → thay thân hàm, giữ chữ ký.
import { catalogSkillFields, CreateSkillInputSchema, nextSkillCode, resolveSkillFieldKey, type CreateSkillInput } from "@kb/contracts";
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import type { Skill, SkillField, SkillFieldPatch, SkillKind } from "@/mocks/types";

export const skillKeys = {
  all: ["skills"] as const,
  list: ["skills", "list"] as const,
  detail: (id: string) => ["skills", "detail", id] as const,
  samples: (id: string) => ["skills", "samples", id] as const,
  evaluation: (id: string) => ["skills", "evaluation", id] as const,
  suggestions: (skillId?: string) => ["skills", "suggestions", skillId ?? "all"] as const,
  stale: (id: string) => ["skills", "stale", id] as const,
};

export type { EvaluationResult, LabeledSample, SkillFieldPatch } from "@kb/contracts";
import { MIN_SAMPLES_FOR_ACCURACY, type EvaluationResult, type LabeledSample, type LearnSummary, type SampleLabel, type SkillSuggestion, type StaleReads } from "@kb/contracts";
/** Số mẫu tối thiểu để hiện độ chính xác. */
export { MIN_SAMPLES_FOR_ACCURACY };

const getSkill = (skills: Skill[], id: string) => {
  const s = skills.find((x) => x.id === id);
  if (!s) throw new ApiError("NOT_FOUND", "Không tìm thấy skill");
  return s;
};

export const listSkills = (kind?: SkillKind) => query((db) => db.skills.filter((s) => !kind || s.kind === kind));

export const getSkillById = (id: string) => query((db) => getSkill(db.skills, id));

/** Tạo skill mới (cùng luật với core createSkill): trùng mã → DUPLICATE, bỏ trống mã → tự sinh SK-INV-2…; mock không có skill mẫu riêng nên chỉ sao chép từ skill trong danh sách. */
export const createSkill = (input: CreateSkillInput) =>
  mutate((db) => {
    const role = db.members.find((m) => m.id === db.currentUserId)?.role;
    if (role !== "OWNER" && role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cần vai trò ADMIN");
    const parsed = CreateSkillInputSchema.safeParse(input);
    if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0]?.message ?? "Dữ liệu skill không hợp lệ");
    const cmd = parsed.data;
    const codes = db.skills.map((s) => s.code);
    if (cmd.code && codes.includes(cmd.code)) throw new ApiError("DUPLICATE", `Mã skill ${cmd.code} đã tồn tại`);
    let fields: SkillField[] = catalogSkillFields(cmd.docKind);
    if (cmd.copyFromSkillId) {
      const src = db.skills.find((s) => s.id === cmd.copyFromSkillId);
      if (!src) throw new ApiError("NOT_FOUND", "Không tìm thấy skill nguồn để sao chép");
      if (src.docKind !== cmd.docKind) throw new ApiError("VALIDATION", "Skill nguồn khác loại chứng từ");
      fields = structuredClone(src.fields);
    }
    const skill: Skill = {
      id: newId("sk"), code: cmd.code ?? nextSkillCode(cmd.docKind, codes), name: cmd.name, kind: cmd.kind, docKind: cmd.docKind,
      ...(cmd.supplier ? { supplier: cmd.supplier } : {}),
      language: cmd.language, version: 1, labeledSamples: 0, updatedAt: nowIso(), enabled: true, fields,
    };
    db.skills.push(skill);
    return skill;
  });

export const setSkillEnabled = (id: string, enabled: boolean) =>
  mutate((db) => {
    const s = getSkill(db.skills, id);
    s.enabled = enabled;
    s.updatedAt = nowIso();
    return s;
  });

export const updateSkillField = (skillId: string, key: string, patch: SkillFieldPatch) =>
  mutate((db) => {
    const s = getSkill(db.skills, skillId);
    const f = s.fields.find((x) => x.key === key);
    if (!f) throw new ApiError("NOT_FOUND", "Không tìm thấy trường");
    if (patch.extract === false && f.required) throw new ApiError("FORBIDDEN", "Trường bắt buộc của tờ khai – không tắt trích xuất được");
    Object.assign(f, patch);
    // Không trích xuất thì cũng không hiển thị.
    if (patch.extract === false) f.display = false;
    s.updatedAt = nowIso();
    return s;
  });

export const addSkillField = (skillId: string, field: SkillField) =>
  mutate((db) => {
    const s = getSkill(db.skills, skillId);
    const key = field.key.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw new ApiError("VALIDATION", "Mã trường chỉ gồm chữ không dấu, số, dấu _ và bắt đầu bằng chữ");
    if (s.fields.some((f) => f.key === key)) throw new ApiError("DUPLICATE", "Mã trường đã tồn tại trong skill");
    const custom = (k: string) => !s.docKind || !resolveSkillFieldKey(s.docKind, k).standard;
    if (custom(key) && s.fields.filter((f) => custom(f.key)).length >= 20) throw new ApiError("VALIDATION", "Tối đa 20 trường bổ sung cho một skill");
    if (!field.label.trim()) throw new ApiError("VALIDATION", "Nhập tên hiển thị");
    s.fields.push({ ...field, key, label: field.label.trim() });
    s.updatedAt = nowIso();
    return s;
  });

export const removeSkillField = (skillId: string, key: string) =>
  mutate((db) => {
    const s = getSkill(db.skills, skillId);
    if (s.docKind && resolveSkillFieldKey(s.docKind, key).standard) throw new ApiError("FORBIDDEN", "Trường chuẩn của chứng từ không xóa được – tắt Đọc/Hiển thị nếu không cần");
    s.fields = s.fields.filter((f) => f.key !== key);
    s.updatedAt = nowIso();
    return s;
  });

// ---- Mẫu đã gắn nhãn: suy ra từ labeledSamples (ổn định) + mẫu người dùng tải lên (lưu riêng) ----

const SAMPLES_KEY = "kb-mock-skill-samples";
const SUPPLIERS = ["HANSOL", "MORINAGA", "KAIDA", "ARTEMIDE", "HIWIN", "CHANGLI", "NORDIC", "PACIFIC"];
const LABELERS = ["Lê Minh Châu", "Nguyễn Thu Hà", "Phạm Anh Tuấn"];

function readUploaded(): Record<string, LabeledSample[]> {
  try {
    return JSON.parse(localStorage.getItem(SAMPLES_KEY) ?? "{}") as Record<string, LabeledSample[]>;
  } catch {
    return {};
  }
}
function writeUploaded(v: Record<string, LabeledSample[]>) {
  try {
    localStorage.setItem(SAMPLES_KEY, JSON.stringify(v));
  } catch {
    /* bỏ qua */
  }
}

function seededSamples(s: Skill): LabeledSample[] {
  const prefix = s.code.replace(/^SK-/, "").split("-")[0];
  return Array.from({ length: Math.min(s.labeledSamples, 12) }, (_, i) => {
    const sup = s.supplier ? s.supplier.split(" ")[0] : SUPPLIERS[i % SUPPLIERS.length];
    return {
      id: `${s.id}_s${i}`,
      fileName: `${prefix}_${sup}_${String(2400 + i * 37).padStart(4, "0")}.pdf`,
      pages: 1 + (i % 3),
      sizeBytes: 140_000 + ((i * 53_731) % 600_000),
      labeledBy: LABELERS[i % LABELERS.length]!,
      labeledAt: new Date(Date.now() - (i * 4 + 2) * 86_400_000).toISOString(),
      status: "LABELED",
    };
  });
}

export const listSamples = (skillId: string) =>
  query((db) => {
    const s = getSkill(db.skills, skillId);
    return [...(readUploaded()[skillId] ?? []), ...seededSamples(s)];
  });

/** Tải mẫu lên: mẫu ở trạng thái "chờ gắn nhãn", sau đó (mô phỏng) người dùng gắn nhãn xong → cộng vào labeledSamples. */
export const uploadSamples = (skillId: string, files: File[]) =>
  mutate((db) => {
    const s = getSkill(db.skills, skillId);
    const all = readUploaded();
    const added: LabeledSample[] = files.map((f) => ({
      id: newId("smp"),
      fileName: f.name,
      pages: 1,
      sizeBytes: f.size,
      labeledBy: db.members.find((m) => m.id === db.currentUserId)?.name ?? "",
      labeledAt: nowIso(),
      status: "PENDING",
    }));
    all[skillId] = [...added, ...(all[skillId] ?? [])];
    writeUploaded(all);
    s.updatedAt = nowIso();
    return added;
  });

/** Đánh dấu các mẫu "chờ gắn nhãn" đã gắn xong (mô phỏng người dùng gắn nhãn trên màn OCR). */
export const confirmPendingSamples = (skillId: string) =>
  mutate((db) => {
    const s = getSkill(db.skills, skillId);
    const all = readUploaded();
    const list = all[skillId] ?? [];
    const pending = list.filter((x) => x.status === "PENDING").length;
    all[skillId] = list.map((x) => ({ ...x, status: "LABELED" as const }));
    writeUploaded(all);
    s.labeledSamples += pending;
    return pending;
  });

// Nhãn (giá trị đúng theo key trường) của từng mẫu – lưu riêng theo id mẫu.
const LABELS_KEY = "kb-mock-skill-sample-labels";
function readLabels(): Record<string, Record<string, unknown>> {
  try {
    return JSON.parse(localStorage.getItem(LABELS_KEY) ?? "{}") as Record<string, Record<string, unknown>>;
  } catch {
    return {};
  }
}

/** Mẫu kèm nhãn. Chưa ai sửa → nhãn nháp: mọi trường cần đọc để trống (bản thật là kết quả AI đọc). */
export const getSampleLabel = (skillId: string, sampleId: string) =>
  query((db): SampleLabel => {
    const s = getSkill(db.skills, skillId);
    const sample = [...(readUploaded()[skillId] ?? []), ...seededSamples(s)].find((x) => x.id === sampleId);
    if (!sample) throw new ApiError("NOT_FOUND", "Không tìm thấy mẫu");
    const draft = Object.fromEntries(s.fields.filter((f) => f.extract).map((f) => [f.key, null]));
    return { sample, expected: { ...draft, ...readLabels()[sampleId] } };
  });

/** Người duyệt ghi giá trị đúng cho mẫu → mẫu thành "đã gắn nhãn" (mẫu đang chờ được cộng vào bộ đo). */
export const labelSample = (skillId: string, sampleId: string, expected: Record<string, unknown>) =>
  mutate((db): LabeledSample => {
    const s = getSkill(db.skills, skillId);
    const all = readUploaded();
    const uploaded = (all[skillId] ?? []).find((x) => x.id === sampleId);
    const sample = uploaded ?? seededSamples(s).find((x) => x.id === sampleId);
    if (!sample) throw new ApiError("NOT_FOUND", "Không tìm thấy mẫu");
    try {
      localStorage.setItem(LABELS_KEY, JSON.stringify({ ...readLabels(), [sampleId]: expected }));
    } catch {
      /* bỏ qua */
    }
    if (uploaded) {
      if (uploaded.status === "PENDING") s.labeledSamples += 1;
      Object.assign(uploaded, { status: "LABELED", labeledBy: db.members.find((m) => m.id === db.currentUserId)?.name ?? uploaded.labeledBy, labeledAt: nowIso() });
      writeUploaded(all);
    }
    s.updatedAt = nowIso();
    return uploaded ?? sample;
  });

// ---- Đánh giá lại ----

/** Số giả ngẫu nhiên ổn định theo chuỗi (cùng skill + version → cùng kết quả). */
function hash01(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Độ chính xác từng trường, xoay quanh độ chính xác chung của skill. */
export function fieldAccuracies(s: Skill): EvaluationResult["fields"] {
  const base = s.accuracy ?? 0.9;
  const samples = Math.max(s.labeledSamples, 1);
  return s.fields
    .filter((f) => f.extract)
    .map((f) => {
      const spread = (hash01(`${s.id}:${f.key}:${s.version}`) - 0.45) * 0.12;
      const typePenalty = f.type === "items" ? 0.04 : f.type === "party" ? 0.02 : 0;
      const acc = Math.max(0.6, Math.min(1, base + spread - typePenalty));
      return { key: f.key, label: f.label, accuracy: acc, errors: Math.round((1 - acc) * samples) };
    });
}

/** Kết quả đánh giá gần nhất (mock suy ra từ độ chính xác hiện tại); chưa đủ mẫu → null. */
export const getEvaluation = (skillId: string) =>
  query((db): EvaluationResult | null => {
    const s = getSkill(db.skills, skillId);
    if (s.accuracy === undefined || s.labeledSamples < MIN_SAMPLES_FOR_ACCURACY) return null;
    return { skillId, version: s.version, accuracy: s.accuracy, samples: s.labeledSamples, fields: fieldAccuracies(s), finishedAt: s.updatedAt };
  });

export const evaluateSkill = (skillId: string) =>
  mutate((db): EvaluationResult => {
    const s = getSkill(db.skills, skillId);
    if (s.labeledSamples < MIN_SAMPLES_FOR_ACCURACY)
      throw new ApiError("NOT_ENOUGH_SAMPLES", `Cần ít nhất ${MIN_SAMPLES_FOR_ACCURACY} mẫu đã gắn nhãn để đánh giá (hiện có ${s.labeledSamples})`);
    const previous = s.accuracy;
    s.version += 1;
    const drift = (hash01(`${s.id}:eval:${s.version}`) - 0.3) * 0.02; // thường tăng nhẹ
    s.accuracy = Math.max(0.7, Math.min(0.995, (previous ?? 0.88) + drift));
    s.updatedAt = nowIso();
    return {
      skillId,
      version: s.version,
      ...(previous !== undefined ? { previousAccuracy: previous } : {}),
      accuracy: s.accuracy,
      samples: s.labeledSamples,
      fields: fieldAccuracies(s),
      finishedAt: s.updatedAt,
    };
  });

// ---- Tự học từ bước kiểm tra, gợi ý nhãn, đọc lại (mock: đủ để thử luồng giao diện) ----


const docSkill = (skills: Skill[], kind: string) => skills.find((s) => s.enabled && s.kind === "DOCUMENT" && s.docKind === kind);

/** Chứng từ có trường bị sửa → cộng mẫu đã gắn nhãn cho skill của loại chứng từ đó. */
export const learnFromReview = (dossierId: string) =>
  mutate((db): LearnSummary => {
    const docs = db.documents.filter((d) => d.dossierId === dossierId && d.status === "DONE");
    const touched = new Map<string, Skill>();
    let learned = 0;
    for (const d of docs) {
      const edited = db.fields.some((f) => f.documentId === d.id && f.status === "USER_CONFIRMED" && f.value !== f.originalValue);
      const s = edited ? docSkill(db.skills, d.kind) : undefined;
      if (!s) continue;
      s.labeledSamples += 1;
      s.updatedAt = nowIso();
      touched.set(s.id, s);
      learned += 1;
    }
    return { learned, skills: [...touched.values()].map((s) => ({ id: s.id, name: s.name, created: false })) };
  });

export const listSuggestions = (skillId?: string) => query((db) => db.skillSuggestions.filter((s) => !skillId || s.skillId === skillId));

export const suggestAlias = (fieldId: string, label: string) =>
  mutate((db): SkillSuggestion | null => {
    const f = db.fields.find((x) => x.id === fieldId);
    const doc = f && db.documents.find((d) => d.id === f.documentId);
    const s = doc && docSkill(db.skills, doc.kind);
    const sf = s?.fields.find((x) => x.key === f!.key);
    const alias = label.replace(/[\s:–-]+$/u, "").trim();
    if (!s || !sf || alias.length < 2 || sf.aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) return null;
    const prev = db.skillSuggestions.find((x) => x.skillId === s.id && x.fieldKey === sf.key && x.alias === alias);
    if (prev) {
      prev.hits += 1;
      return prev;
    }
    const sug: SkillSuggestion = { id: newId("sug"), skillId: s.id, skillName: s.name, fieldKey: sf.key, fieldLabel: sf.label, alias, hits: 1, createdAt: nowIso() };
    db.skillSuggestions.push(sug);
    return sug;
  });

export const acceptSuggestion = (id: string) =>
  mutate((db) => {
    const sug = db.skillSuggestions.find((x) => x.id === id);
    if (!sug) throw new ApiError("NOT_FOUND", "Gợi ý không còn");
    const s = getSkill(db.skills, sug.skillId);
    const f = s.fields.find((x) => x.key === sug.fieldKey);
    if (f && !f.aliases.includes(sug.alias)) f.aliases.push(sug.alias);
    s.version += 1;
    s.updatedAt = nowIso();
    db.skillSuggestions = db.skillSuggestions.filter((x) => x.id !== id);
    if (!db.staleSkills.includes(s.id)) db.staleSkills.push(s.id);
    return { skill: s, evaluationQueued: s.labeledSamples >= MIN_SAMPLES_FOR_ACCURACY };
  });

export const dismissSuggestion = (id: string) =>
  mutate((db) => {
    db.skillSuggestions = db.skillSuggestions.filter((x) => x.id !== id);
  });

export const getStaleReads = (skillId: string) =>
  query((db): StaleReads => {
    const s = getSkill(db.skills, skillId);
    if (!db.staleSkills.includes(skillId)) return { documents: [], dossiers: 0 };
    const open = new Map(db.dossiers.filter((d) => d.step === "upload" || d.step === "ocr").map((d) => [d.id, d]));
    const documents = db.documents
      .filter((d) => d.status === "DONE" && d.kind === s.docKind && open.has(d.dossierId))
      .map((d) => ({ documentId: d.id, dossierId: d.dossierId, dossierCode: open.get(d.dossierId)!.code, fileName: d.fileName }));
    return { documents, dossiers: new Set(documents.map((d) => d.dossierId)).size };
  });

/** Mock không có AI: đọc lại = coi như đã đọc bằng cấu hình mới. */
export const rereadStale = async (skillId: string) => {
  const n = (await getStaleReads(skillId)).documents.length;
  await mutate((db) => {
    db.staleSkills = db.staleSkills.filter((x) => x !== skillId);
  });
  return n;
};

/** Mock: chạy đánh giá ngay (như "Đánh giá lại"). */
export const waitForEvaluation = async (skillId: string, _since: string | undefined): Promise<EvaluationResult | null> => evaluateSkill(skillId);
