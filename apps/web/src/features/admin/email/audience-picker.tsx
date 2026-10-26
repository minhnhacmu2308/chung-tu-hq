"use client";
// Chọn người nhận email: nhóm doanh nghiệp (tất cả / theo gói / chọn từng doanh nghiệp) × vai trò, cộng người dùng cụ thể và email ngoài.
// Đếm người nhận ngay khi đổi lựa chọn (máy chủ tính – bỏ trùng email, chỉ người đang hoạt động).
import type { EmailAudience, Role } from "@kb/contracts";
import { Alert, Checkbox, Combobox, Field, fill, SegmentedControl, Skeleton, Stack, Textarea, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { adminKeys, listAdminOrgs, listAdminPlans, listAdminUsers, previewEmailAudience } from "@/api/admin";
import { ROLE_LABELS } from "@/mocks/types";
import { EMAIL_AUDIENCE_MESSAGES } from "./email.messages";

const ROLES: Role[] = ["OWNER", "ADMIN", "APPROVER", "DECLARANT", "VIEWER"];
type Mode = EmailAudience["orgs"]["mode"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Danh sách email gõ tay → hợp lệ / sai. */
export function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
  const parts = raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { valid: [...new Set(parts.filter((p) => EMAIL_RE.test(p)))], invalid: parts.filter((p) => !EMAIL_RE.test(p)) };
}

export function AudiencePicker({ value, onChange, onCount }: { value: EmailAudience; onChange: (a: EmailAudience) => void; onCount?: (n: number) => void }) {
  const t = useMessages(EMAIL_AUDIENCE_MESSAGES);
  const roleLabels = useMessages(ROLE_LABELS);
  const orgs = useQuery({ queryKey: adminKeys.orgs, queryFn: listAdminOrgs });
  const plans = useQuery({ queryKey: adminKeys.plans, queryFn: listAdminPlans });
  const users = useQuery({ queryKey: adminKeys.users({}), queryFn: () => listAdminUsers() });
  const [extraRaw, setExtraRaw] = useState(value.extraEmails.join("\n"));
  const extra = parseEmails(extraRaw);

  // Đếm sau khi ngừng gõ một nhịp – không gọi máy chủ mỗi phím.
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(id);
  }, [value]);
  const hasTarget = debounced.orgs.mode !== "NONE" || debounced.userIds.length > 0 || debounced.extraEmails.length > 0;
  const okOrgs = debounced.orgs.mode !== "PLANS" || debounced.orgs.plans.length > 0;
  const okPick = debounced.orgs.mode !== "PICK" || debounced.orgs.orgIds.length > 0;
  const preview = useQuery({ queryKey: ["admin", "email", "audience", debounced], queryFn: () => previewEmailAudience(debounced), enabled: hasTarget && okOrgs && okPick });
  const total = hasTarget && okOrgs && okPick ? (preview.data?.total ?? 0) : 0;
  useEffect(() => onCount?.(total), [total, onCount]);

  const setMode = (mode: Mode) =>
    onChange({
      ...value,
      orgs: mode === "PLANS" ? { mode, plans: plans.data?.map((p) => p.code).filter((c) => c !== "TRIAL").slice(0, 1) ?? [] } : mode === "PICK" ? { mode, orgIds: [] } : { mode },
    });
  const userOptions = useMemo(() => (users.data ?? []).filter((u) => u.status === "ACTIVE").map((u) => ({ value: u.id, label: u.name, description: `${u.email} · ${u.orgName ?? ""}` })), [users.data]);
  const orgOptions = useMemo(() => (orgs.data ?? []).filter((o) => o.status === "ACTIVE").map((o) => ({ value: o.id, label: o.name, description: `MST ${o.taxCode} · ${o.plan.name}` })), [orgs.data]);

  return (
    <section aria-label={t.title} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <p className="text-sm font-semibold text-fg">{t.title}</p>
      <SegmentedControl<Mode>
        label={t.orgs}
        value={value.orgs.mode}
        onChange={setMode}
        options={[{ value: "NONE", label: t.none }, { value: "ALL", label: t.all }, { value: "PLANS", label: t.byPlan }, { value: "PICK", label: t.pick }]}
      />
      {value.orgs.mode === "PLANS" && (
        <fieldset className="flex min-w-0 flex-wrap gap-x-4 gap-y-2">
          <legend className="mb-1 text-sm text-fg-muted">{t.plans}</legend>
          {(plans.data ?? []).map((p) => {
            const list = value.orgs.mode === "PLANS" ? value.orgs.plans : [];
            return (
              <Checkbox key={p.code} label={p.name} checked={list.includes(p.code)}
                onChange={(e) => onChange({ ...value, orgs: { mode: "PLANS", plans: e.target.checked ? [...list, p.code] : list.filter((x) => x !== p.code) } })}
              />
            );
          })}
        </fieldset>
      )}
      {value.orgs.mode === "PICK" && (
        <Field label={t.pickOrgs}>
          <Combobox multiple options={orgOptions} value={value.orgs.orgIds} onChange={(orgIds) => onChange({ ...value, orgs: { mode: "PICK", orgIds } })} placeholder={t.select} loading={orgs.isLoading} />
        </Field>
      )}
      {value.orgs.mode !== "NONE" && (
        <fieldset className="flex min-w-0 flex-wrap gap-x-4 gap-y-2">
          <legend className="mb-1 text-sm text-fg-muted">{t.roles} <span className="text-xs">({t.rolesHint})</span></legend>
          {ROLES.map((r) => (
            <Checkbox key={r} label={roleLabels[r]} checked={value.roles.includes(r)}
              onChange={(e) => onChange({ ...value, roles: e.target.checked ? [...value.roles, r] : value.roles.filter((x) => x !== r) })}
            />
          ))}
        </fieldset>
      )}
      <Field label={t.users}>
        <Combobox multiple options={userOptions} value={value.userIds} onChange={(userIds) => onChange({ ...value, userIds })} placeholder={t.select} loading={users.isLoading} />
      </Field>
      <Field label={t.extra} hint={t.extraHint} {...(extra.invalid.length ? { error: fill(t.extraInvalid, { list: extra.invalid.slice(0, 3).join(", ") }) } : {})}>
        <Textarea
          value={extraRaw}
          rows={3}
          onChange={(e) => {
            setExtraRaw(e.target.value);
            onChange({ ...value, extraEmails: parseEmails(e.target.value).valid });
          }}
        />
      </Field>
      <div aria-live="polite">
        {!hasTarget ? null : preview.isFetching && !preview.data ? (
          <Skeleton className="h-10" />
        ) : total === 0 ? (
          <Alert tone="warning">{t.noOne}</Alert>
        ) : (
          <Alert tone="info" title={fill(t.count, { n: total })}>
            <span className="text-xs">
              {t.sample}: {(preview.data?.sample ?? []).slice(0, 5).map((p) => p.name).join(", ")}
              {total > 5 ? "…" : ""}
            </span>
          </Alert>
        )}
      </div>
    </section>
  );
}

export const EMPTY_AUDIENCE: EmailAudience = { orgs: { mode: "ALL" }, roles: ["OWNER"], userIds: [], extraEmails: [] };
