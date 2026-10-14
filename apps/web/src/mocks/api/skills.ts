// Cấu hình Skill AI (mock). Có backend → thay thân hàm, giữ chữ ký.
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import type { Skill, SkillField, SkillFieldPatch, SkillKind } from "@/mocks/types";

export const skillKeys = {
  all: ["skills"] as const,
  list: ["skills", "list"] as const,
  detail: (id: string) => ["skills", "detail", id] as const,
  samples: (id: string) => ["skills", "samples", id] as const,
  evaluation: (id: string) => ["skills", "evaluation", id] as const,
};

export type { EvaluationResult, LabeledSample, SkillFieldPatch } from "@kb/contracts";
import { MIN_SAMPLES_FOR_ACCURACY, type EvaluationResult, type LabeledSample } from "@kb/contracts";
/** Số mẫu tối thiểu để hiện độ chính xác. */
export { MIN_SAMPLES_FOR_ACCURACY };

const getSkill = (skills: Skill[], id: string) => {
  const s = skills.find((x) => x.id === id);
  if (!s) throw new ApiError("NOT_FOUND", "Không tìm thấy skill");
  return s;
};

export const listSkills = (kind?: SkillKind) => query((db) => db.skills.filter((s) => !kind || s.kind === kind));

export const getSkillById = (id: string) => query((db) => getSkill(db.skills, id));

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
    if (!field.label.trim()) throw new ApiError("VALIDATION", "Nhập tên hiển thị");
    s.fields.push({ ...field, key, label: field.label.trim() });
    s.updatedAt = nowIso();
    return s;
  });

export const removeSkillField = (skillId: string, key: string) =>
  mutate((db) => {
    const s = getSkill(db.skills, skillId);
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
    if (s.kind === "MAPPING" || s.accuracy === undefined || s.labeledSamples < MIN_SAMPLES_FOR_ACCURACY) return null;
    return { skillId, version: s.version, accuracy: s.accuracy, samples: s.labeledSamples, fields: fieldAccuracies(s), finishedAt: s.updatedAt };
  });

export const evaluateSkill = (skillId: string) =>
  mutate((db): EvaluationResult => {
    const s = getSkill(db.skills, skillId);
    if (s.kind === "MAPPING") throw new ApiError("NOT_SUPPORTED", "Skill ánh xạ là quy tắc cố định – kiểm bằng test, không đánh giá trên mẫu");
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
