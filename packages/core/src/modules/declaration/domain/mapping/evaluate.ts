// Chạy quy tắc một chỉ tiêu có xét ghi đè của doanh nghiệp, kèm nguồn gốc (provenance). Thuần.
import { DERIVED_DECLARATION_FIELD_CODES } from "@kb/contracts";
import { domainError } from "../../../../shared/errors.js";
import { err, ok, type Result } from "../../../../shared/result.js";
import { canEditField } from "../guards.js";
import { checkCodeLength } from "../profile.js";
import { mappingsFor } from "./registry.js";
import type { FieldMapping, FieldOverride, MappedValue, MappingInput, Provenance } from "./types.js";

export type EvaluatedValue = Omit<MappedValue, "via"> & { provenance: Provenance };

const strip = ({ via: _v, ...rest }: MappedValue): Omit<MappedValue, "via"> => rest;

/** Không ghi đè → đúng y `m.from`; `fixed` → giá trị cố định; `sources` → nguồn đầu tiên có giá trị, hết nguồn thì về mặc định. */
export function evaluateMapping(m: FieldMapping, override: FieldOverride | undefined, i: MappingInput): EvaluatedValue {
  if (override && m.options) {
    if ("fixed" in override && m.options.allowFixed && override.fixed.trim()) {
      return { value: override.fixed.trim(), source: "DEFAULT", note: "Giá trị cố định theo cấu hình doanh nghiệp", provenance: { rule: m.code, via: "fixed" } };
    }
    if ("sources" in override) {
      for (const id of override.sources) {
        const opt = m.options.sources.find((s) => s.id === id);
        const v = opt?.read(i);
        if (opt && v && v.value !== null && v.value !== "") return { ...strip(v), provenance: { rule: m.code, via: "source", sourceId: id } };
      }
    }
  }
  const v = m.from(i);
  return { ...strip(v), provenance: { rule: m.code, via: v.via === "profile" ? "profile" : "default" } };
}

const mappingsOf = mappingsFor;

/** Kiểm cấu hình ghi đè trước khi lưu: chỉ trong phạm vi `options` của chỉ tiêu; chỉ tiêu trị giá/thuế bị khóa. */
export function validateOverrides(kind: "IDA" | "EDA", overrides: Record<string, FieldOverride>): Result<void> {
  for (const [code, o] of Object.entries(overrides)) {
    const m = mappingsOf(kind).find((x) => x.code === code);
    if (!m) return err(domainError("VALIDATION", `Không có chỉ tiêu ${code} trên tờ khai ${kind}`));
    if (DERIVED_DECLARATION_FIELD_CODES.includes(code) || !m.options) return err(domainError("FORBIDDEN", `Chỉ tiêu “${m.label}” (${code}) không cho phép doanh nghiệp đổi nguồn`));
    if ("fixed" in o) {
      if (!m.options.allowFixed) return err(domainError("VALIDATION", `Chỉ tiêu “${m.label}” không cho phép đặt giá trị cố định`));
      const fmt = canEditField(kind, code, o.fixed.trim());
      if (!fmt.ok) return err(domainError("VALIDATION", `${m.label}: ${fmt.error.message ?? "giá trị không hợp lệ"}`));
      const len = checkCodeLength(kind, code, o.fixed.trim());
      if (!len.ok) return len;
    } else {
      if (!o.sources.length) return err(domainError("VALIDATION", `Chọn ít nhất một nguồn cho “${m.label}”`));
      const bad = o.sources.find((id) => !m.options!.sources.some((s) => s.id === id));
      if (bad) return err(domainError("VALIDATION", `Nguồn “${bad}” không được phép cho “${m.label}”`));
    }
  }
  return ok(undefined);
}

export type RuleOptionView = { code: string; no: string | null; label: string; required: boolean; sources: { id: string; label: string }[]; allowFixed: boolean; locked: boolean };

/** Danh sách chỉ tiêu và phạm vi doanh nghiệp được cấu hình – cho màn Cài đặt → Khai báo. */
export function ruleOptionsView(kind: "IDA" | "EDA"): RuleOptionView[] {
  return mappingsOf(kind).map((m) => {
    const locked = DERIVED_DECLARATION_FIELD_CODES.includes(m.code) || !m.options;
    return { code: m.code, no: m.no, label: m.label, required: m.required, sources: locked ? [] : m.options!.sources.map((s) => ({ id: s.id, label: s.label })), allowFixed: !locked && m.options!.allowFixed, locked };
  });
}
