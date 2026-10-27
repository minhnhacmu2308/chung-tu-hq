"use client";
// Cài đặt → Khai báo: Mặc định khai báo theo chiều NK/XK + nguồn từng chỉ tiêu (trong phạm vi quy tắc cho phép).
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Dialog, DialogContent, DialogFooter, Field, FormSection, Input,
  SegmentedControl, Select, SkeletonForm, SkeletonList, Stack, fill, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, Lock, RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { DeclarationDirection, DeclarationProfile, FieldOverride, RuleOptionView } from "@kb/contracts";
import { getSession, sessionKeys } from "@/api/session";
import { getDeclarationProfile, listDeclarationRules, saveDeclarationProfile, settingsKeys } from "@/api/settings";
import { LoadError } from "@/components/common/load-error";
import { formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { DECLARATION_TAB_MESSAGES } from "./declaration-tab.messages";
import { initialPickedSources, profileFieldsFor, selectFor, toProfileInput, validateProfileForm, type ProfileErrors, type ProfileValues } from "./declaration-profile-form";
import { useCodeLists } from "@/features/declaration-form/use-code-list";

const DIRECTIONS: DeclarationDirection[] = ["NK", "XK"];
const errorProp = (e: string | undefined) => (e ? { error: e } : {});

function useCanManage() {
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  return role === "OWNER" || role === "ADMIN";
}

function useSaveProfile(direction: DeclarationDirection) {
  const qc = useQueryClient();
  const t = useMessages(DECLARATION_TAB_MESSAGES);
  return useMutation({
    mutationFn: (p: { values: ProfileValues; overrides: Record<string, FieldOverride> }) => saveDeclarationProfile(direction, toProfileInput(p.values, p.overrides)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: settingsKeys.declarationProfile(direction) }),
    onError: toastMutationError(t.saveError),
  });
}

function ProfileForm({ direction, profile, canManage }: { direction: DeclarationDirection; profile: DeclarationProfile; canManage: boolean }) {
  const t = useMessages(DECLARATION_TAB_MESSAGES);
  const locale = useUiLocale();
  const [values, setValues] = useState<ProfileValues>(profile.values);
  const [errors, setErrors] = useState<ProfileErrors>({});
  useEffect(() => setValues(profile.values), [profile]);
  const save = useSaveProfile(direction);
  // Danh mục VNACCS cho ô chọn dài; đang tải → ô chọn báo đang tải; lỗi → báo + thử lại.
  const codeLists = useCodeLists(["A038", "PAYMENT", "TYPE_CODE"] as const);
  const fields = profileFieldsFor(direction, locale, { offices: codeLists.lists.A038, payments: codeLists.lists.PAYMENT, typeCodes: codeLists.lists.TYPE_CODE });
  const LIST_FIELDS = ["CQHQ", "PT_TT", "MA_LH"];
  const submit = () => {
    const e = validateProfileForm(direction, values, locale);
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate({ values, overrides: profile.overrides }, { onSuccess: () => toast({ tone: "success", title: t.saved, description: t.savedDesc }) });
  };
  const set = (code: keyof ProfileValues) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [code]: e.target.value }));
    setErrors((x) => ({ ...x, [code]: undefined }));
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      {codeLists.error && <LoadError title={t.codeListsFailed} onRetry={codeLists.retry} />}
      <FormSection title={t.defaultsTitle} description={t.defaultsDesc}>
        <div className="grid gap-4 cq-lg:col-span-2 cq-md:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.code} label={`${f.label} (${f.code})`} {...(f.hint ? { hint: f.hint } : {})} {...errorProp(errors[f.code])}>
              {f.options ? (
                <Select
                  {...selectFor(f.options, values[f.code])}
                  onChange={set(f.code)}
                  placeholder={codeLists.loading && LIST_FIELDS.includes(f.code) ? t.codeListsLoading : t.selectPlaceholder}
                  disabled={!canManage}
                />
              ) : (
                <Input value={values[f.code] ?? ""} onChange={set(f.code)} placeholder={f.placeholder} disabled={!canManage} className={f.short ? "font-mono" : undefined} />
              )}
            </Field>
          ))}
        </div>
      </FormSection>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <span className="text-xs text-fg-subtle">{profile.updatedAt ? fill(t.updated, { when: formatRelative(profile.updatedAt) }) : t.notConfigured}</span>
        {canManage ? <Button type="submit" loading={save.isPending}>{t.saveDefaults}</Button> : <span className="text-xs text-fg-subtle">{t.adminOnlyEdit}</span>}
      </div>
    </form>
  );
}

const describeOverride = (rule: RuleOptionView, o: FieldOverride | undefined, t: Record<"byDefaultRule" | "fixedValue", string>) => {
  if (!o) return t.byDefaultRule;
  if ("fixed" in o) return fill(t.fixedValue, { value: o.fixed });
  return o.sources.map((id) => rule.sources.find((s) => s.id === id)?.label ?? id).join(" → ");
};

function OverrideDialog({ rule, current, open, onOpenChange, onSave, saving }: {
  rule: RuleOptionView; current: FieldOverride | undefined; open: boolean; onOpenChange: (o: boolean) => void; onSave: (o: FieldOverride | null) => void; saving: boolean;
}) {
  const t = useMessages(DECLARATION_TAB_MESSAGES);
  const [mode, setMode] = useState<"sources" | "fixed">(current && "fixed" in current ? "fixed" : "sources");
  const [picked, setPicked] = useState<string[]>(() => initialPickedSources(rule, current));
  const [fixed, setFixed] = useState(current && "fixed" in current ? current.fixed : "");
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  const canSave = mode === "fixed" ? fixed.trim() !== "" : picked.length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={fill(t.sourceTitle, { no: rule.no ?? "", label: rule.label })} icon={<ListOrdered className="h-4 w-4" />} size="sm" description={t.sourceDesc}>
        <form onSubmit={(e) => { e.preventDefault(); if (canSave) onSave(mode === "fixed" ? { fixed: fixed.trim() } : { sources: picked }); }}>
        <Stack gap="md">
          {rule.allowFixed && (
            <SegmentedControl label={t.mode} value={mode} onChange={setMode} options={[{ value: "sources", label: t.bySources }, { value: "fixed", label: t.fixed }]} />
          )}
          {mode === "sources" ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm text-fg-muted">{t.priorityLegend}</legend>
              {rule.sources.map((s) => (
                <Checkbox key={s.id} label={picked.includes(s.id) ? `${picked.indexOf(s.id) + 1}. ${s.label}` : s.label} checked={picked.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
              ))}
            </fieldset>
          ) : (
            <Field label={t.fixed} hint={t.fixedHint}>
              <Input value={fixed} onChange={(e) => setFixed(e.target.value)} />
            </Field>
          )}
        </Stack>
        <DialogFooter>
          {current && <Button type="button" variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => onSave(null)}>{t.resetDefault}</Button>}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
          <Button type="submit" disabled={!canSave} loading={saving}>{t.save}</Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RulesCard({ direction, profile, canManage }: { direction: DeclarationDirection; profile: DeclarationProfile; canManage: boolean }) {
  const t = useMessages(DECLARATION_TAB_MESSAGES);
  const rules = useQuery({ queryKey: settingsKeys.declarationRules(direction), queryFn: () => listDeclarationRules(direction) });
  const save = useSaveProfile(direction);
  const [editing, setEditing] = useState<RuleOptionView | null>(null);
  const persist = (code: string, o: FieldOverride | null) => {
    const overrides = { ...profile.overrides };
    if (o) overrides[code] = o;
    else delete overrides[code];
    save.mutate({ values: profile.values, overrides }, { onSuccess: () => { setEditing(null); toast({ tone: "success", title: t.sourceSaved }); } });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.rulesTitle}</CardTitle>
        <CardDescription>{t.rulesDesc}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rules.isError ? (
          <div className="p-4"><LoadError onRetry={() => void rules.refetch()} /></div>
        ) : !rules.data ? (
          <div className="p-4"><SkeletonList rows={6} /></div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {rules.data.map((r) => (
              <li key={r.code} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-12 shrink-0 font-mono text-xs text-fg-subtle">{r.no ?? "–"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{r.label} <span className="font-mono text-xs text-fg-subtle">{r.code}</span></p>
                  <p className="text-sm text-fg-muted">{r.locked ? t.autoComputed : describeOverride(r, profile.overrides[r.code], t)}</p>
                </div>
                {r.locked ? (
                  <Badge tone="neutral" icon={<Lock className="h-3 w-3" />}>{t.lockedBadge}</Badge>
                ) : (
                  <>
                    {profile.overrides[r.code] && <Badge tone="primary">{t.customized}</Badge>}
                    {canManage && <Button size="sm" variant="secondary" leftIcon={<ListOrdered className="h-4 w-4" />} onClick={() => setEditing(r)}>{t.changeSource}</Button>}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing && <OverrideDialog key={editing.code} rule={editing} current={profile.overrides[editing.code]} open onOpenChange={(o) => !o && setEditing(null)} onSave={(o) => persist(editing.code, o)} saving={save.isPending} />}
    </Card>
  );
}

export function DeclarationTab() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useMessages(DECLARATION_TAB_MESSAGES);
  const direction: DeclarationDirection = params.get("dir") === "XK" ? "XK" : "NK";
  const setDirection = (d: DeclarationDirection) => {
    const next = new URLSearchParams(params.toString());
    next.set("dir", d);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const canManage = useCanManage();
  const profile = useQuery({ queryKey: settingsKeys.declarationProfile(direction), queryFn: () => getDeclarationProfile(direction) });
  return (
    <Stack gap="md">
      <SegmentedControl label={t.declarationKind} value={direction} onChange={setDirection} options={DIRECTIONS.map((d) => ({ value: d, label: t[d] }))} className="max-w-md" />
      {profile.isError ? (
        <LoadError onRetry={() => void profile.refetch()} />
      ) : !profile.data ? (
        <Card><CardContent className="pt-5"><SkeletonForm fields={6} /></CardContent></Card>
      ) : (
        <>
          {!canManage && <Alert tone="info">{t.viewOnly}</Alert>}
          <Card><CardContent className="pt-5"><ProfileForm direction={direction} profile={profile.data} canManage={canManage} /></CardContent></Card>
          <RulesCard direction={direction} profile={profile.data} canManage={canManage} />
        </>
      )}
    </Stack>
  );
}
