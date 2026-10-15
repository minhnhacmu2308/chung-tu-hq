"use client";
// Cài đặt → Khai báo: Mặc định khai báo theo chiều NK/XK + nguồn từng chỉ tiêu (trong phạm vi quy tắc cho phép).
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Dialog, DialogContent, DialogFooter, Field, FormSection, Input,
  SegmentedControl, Select, SkeletonForm, SkeletonList, Stack, toast,
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
import { initialPickedSources, profileFieldsFor, toProfileInput, validateProfileForm, type ProfileErrors, type ProfileValues } from "./declaration-profile-form";

const DIRECTIONS = [{ value: "NK" as const, label: "Nhập khẩu (IDA)" }, { value: "XK" as const, label: "Xuất khẩu (EDA)" }];
const errorProp = (e: string | undefined) => (e ? { error: e } : {});

function useCanManage() {
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  return role === "OWNER" || role === "ADMIN";
}

function useSaveProfile(direction: DeclarationDirection) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { values: ProfileValues; overrides: Record<string, FieldOverride> }) => saveDeclarationProfile(direction, toProfileInput(p.values, p.overrides)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: settingsKeys.declarationProfile(direction) }),
    onError: toastMutationError("Không lưu được cấu hình khai báo"),
  });
}

function ProfileForm({ direction, profile, canManage }: { direction: DeclarationDirection; profile: DeclarationProfile; canManage: boolean }) {
  const [values, setValues] = useState<ProfileValues>(profile.values);
  const [errors, setErrors] = useState<ProfileErrors>({});
  useEffect(() => setValues(profile.values), [profile]);
  const save = useSaveProfile(direction);
  const fields = profileFieldsFor(direction);
  const submit = () => {
    const e = validateProfileForm(direction, values);
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate({ values, overrides: profile.overrides }, { onSuccess: () => toast({ tone: "success", title: "Đã lưu mặc định khai báo", description: "Áp dụng cho các tờ khai dựng sau." }) });
  };
  const set = (code: keyof ProfileValues) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [code]: e.target.value }));
    setErrors((x) => ({ ...x, [code]: undefined }));
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <FormSection title="Mặc định khai báo" description="Dùng khi chứng từ không ghi; mã loại hình và chi cục được điền sẵn khi tạo hồ sơ mới.">
        <div className="grid gap-4 cq-lg:col-span-2 cq-md:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.code} label={`${f.label} (${f.code})`} {...(f.hint ? { hint: f.hint } : {})} {...errorProp(errors[f.code])}>
              {f.options ? (
                <Select value={values[f.code] ?? ""} onChange={set(f.code)} options={f.options} placeholder="Theo chứng từ / mặc định hệ thống" disabled={!canManage} />
              ) : (
                <Input value={values[f.code] ?? ""} onChange={set(f.code)} placeholder={f.placeholder} disabled={!canManage} className={f.short ? "font-mono" : undefined} />
              )}
            </Field>
          ))}
        </div>
      </FormSection>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <span className="text-xs text-fg-subtle">{profile.updatedAt ? `Cập nhật ${formatRelative(profile.updatedAt)}` : "Chưa cấu hình"}</span>
        {canManage ? <Button type="submit" loading={save.isPending}>Lưu mặc định</Button> : <span className="text-xs text-fg-subtle">Chỉ Quản trị hoặc Chủ sở hữu sửa được.</span>}
      </div>
    </form>
  );
}

const describeOverride = (rule: RuleOptionView, o: FieldOverride | undefined) => {
  if (!o) return "Theo quy tắc mặc định";
  if ("fixed" in o) return `Cố định: ${o.fixed}`;
  return o.sources.map((id) => rule.sources.find((s) => s.id === id)?.label ?? id).join(" → ");
};

function OverrideDialog({ rule, current, open, onOpenChange, onSave, saving }: {
  rule: RuleOptionView; current: FieldOverride | undefined; open: boolean; onOpenChange: (o: boolean) => void; onSave: (o: FieldOverride | null) => void; saving: boolean;
}) {
  const [mode, setMode] = useState<"sources" | "fixed">(current && "fixed" in current ? "fixed" : "sources");
  const [picked, setPicked] = useState<string[]>(() => initialPickedSources(rule, current));
  const [fixed, setFixed] = useState(current && "fixed" in current ? current.fixed : "");
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  const canSave = mode === "fixed" ? fixed.trim() !== "" : picked.length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Nguồn chỉ tiêu ${rule.no ?? ""} ${rule.label}`} icon={<ListOrdered className="h-4 w-4" />} size="sm" description="Chọn nguồn theo thứ tự ưu tiên (nguồn đầu tiên có giá trị được dùng), hoặc đặt giá trị cố định.">
        <form onSubmit={(e) => { e.preventDefault(); if (canSave) onSave(mode === "fixed" ? { fixed: fixed.trim() } : { sources: picked }); }}>
        <Stack gap="md">
          {rule.allowFixed && (
            <SegmentedControl label="Cách lấy" value={mode} onChange={setMode} options={[{ value: "sources", label: "Theo nguồn" }, { value: "fixed", label: "Giá trị cố định" }]} />
          )}
          {mode === "sources" ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm text-fg-muted">Thứ tự ưu tiên theo thứ tự bạn tích chọn</legend>
              {rule.sources.map((s) => (
                <Checkbox key={s.id} label={picked.includes(s.id) ? `${picked.indexOf(s.id) + 1}. ${s.label}` : s.label} checked={picked.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
              ))}
            </fieldset>
          ) : (
            <Field label="Giá trị cố định" hint="Ghi theo dạng mã – tên, ví dụ 03CCS01 – Kho CFS Tân Vũ">
              <Input value={fixed} onChange={(e) => setFixed(e.target.value)} />
            </Field>
          )}
        </Stack>
        <DialogFooter>
          {current && <Button type="button" variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => onSave(null)}>Về mặc định</Button>}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button type="submit" disabled={!canSave} loading={saving}>Lưu</Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RulesCard({ direction, profile, canManage }: { direction: DeclarationDirection; profile: DeclarationProfile; canManage: boolean }) {
  const rules = useQuery({ queryKey: settingsKeys.declarationRules(direction), queryFn: () => listDeclarationRules(direction) });
  const save = useSaveProfile(direction);
  const [editing, setEditing] = useState<RuleOptionView | null>(null);
  const persist = (code: string, o: FieldOverride | null) => {
    const overrides = { ...profile.overrides };
    if (o) overrides[code] = o;
    else delete overrides[code];
    save.mutate({ values: profile.values, overrides }, { onSuccess: () => { setEditing(null); toast({ tone: "success", title: "Đã lưu nguồn chỉ tiêu" }); } });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nguồn từng chỉ tiêu</CardTitle>
        <CardDescription>Mặc định hệ thống lấy theo quy tắc đã kiểm thử. Doanh nghiệp chỉ đổi được trong phạm vi cho phép; chỉ tiêu trị giá/thuế luôn tính tự động.</CardDescription>
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
                  <p className="text-sm text-fg-muted">{r.locked ? "Tính tự động từ chứng từ và trị giá" : describeOverride(r, profile.overrides[r.code])}</p>
                </div>
                {r.locked ? (
                  <Badge tone="neutral" icon={<Lock className="h-3 w-3" />}>Khóa – tính từ trị giá</Badge>
                ) : (
                  <>
                    {profile.overrides[r.code] && <Badge tone="primary">Đã tùy chỉnh</Badge>}
                    {canManage && <Button size="sm" variant="secondary" leftIcon={<ListOrdered className="h-4 w-4" />} onClick={() => setEditing(r)}>Đổi nguồn</Button>}
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
      <SegmentedControl label="Loại tờ khai" value={direction} onChange={setDirection} options={DIRECTIONS} className="max-w-md" />
      {profile.isError ? (
        <LoadError onRetry={() => void profile.refetch()} />
      ) : !profile.data ? (
        <Card><CardContent className="pt-5"><SkeletonForm fields={6} /></CardContent></Card>
      ) : (
        <>
          {!canManage && <Alert tone="info">Bạn đang xem cấu hình. Chỉ Quản trị hoặc Chủ sở hữu thay đổi được.</Alert>}
          <Card><CardContent className="pt-5"><ProfileForm direction={direction} profile={profile.data} canManage={canManage} /></CardContent></Card>
          <RulesCard direction={direction} profile={profile.data} canManage={canManage} />
        </>
      )}
    </Stack>
  );
}
