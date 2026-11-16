"use client";
// Thương hiệu doanh nghiệp (ADR 0016): tên hiển thị thay "KhaiBáo AI" + logo thay BrandMark ở menu và favicon – chỉ sau đăng nhập.
import { OrgBrandInputSchema, type Organization } from "@kb/contracts";
import {
  BrandMark, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, ConfirmDialog, Field, FormSection, ImagePicker, Input, SkeletonForm, toast, useMessages,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { orgLogoSrc, removeOrgLogo, updateOrgBrand, uploadOrgLogo } from "@/api/branding";
import { getSession, sessionKeys } from "@/api/session";
import { getOrganization, settingsKeys } from "@/api/settings";
import { APP_TITLES } from "@/app/app-titles.messages";
import { LoadError } from "@/components/common/load-error";
import { toastMutationError } from "@/lib/mutation-error";
import { BRAND_CARD_MESSAGES } from "./brand-card.messages";

export function BrandCard() {
  const qc = useQueryClient();
  const m = useMessages(BRAND_CARD_MESSAGES);
  const { data: org, isLoading, isError, refetch } = useQuery({ queryKey: settingsKeys.org, queryFn: getOrganization });
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  const canManage = role === "OWNER" || role === "ADMIN";
  const [name, setName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => {
    if (org) setName(org.brand.name ?? "");
  }, [org]);

  const applied = (o: Organization) => {
    qc.setQueryData(settingsKeys.org, o);
    void qc.invalidateQueries({ queryKey: sessionKeys.me });
  };
  const save = useMutation({
    mutationFn: () => updateOrgBrand({ name }),
    onSuccess: (o) => {
      applied(o);
      toast({ tone: "success", title: m.saved });
    },
    onError: toastMutationError(m.saveFailed),
  });
  const upload = useMutation({
    mutationFn: uploadOrgLogo,
    onSuccess: (o) => {
      applied(o);
      toast({ tone: "success", title: m.logoSaved });
    },
    onError: toastMutationError(m.logoError),
  });
  const remove = useMutation({
    mutationFn: removeOrgLogo,
    onSuccess: (o) => {
      applied(o);
      setConfirmRemove(false);
      toast({ tone: "success", title: m.logoRemoved });
    },
    onError: toastMutationError(m.logoError),
  });

  if (isError) return <Card className="max-w-4xl p-5"><LoadError onRetry={() => void refetch()} /></Card>;
  if (isLoading || !org) return <Card className="max-w-4xl p-5"><SkeletonForm fields={2} /></Card>;
  const saved = org.brand.name ?? "";
  const parsed = OrgBrandInputSchema.safeParse({ name });
  const dirty = name.trim() !== saved;

  return (
    <Card className="max-w-4xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.success) save.mutate();
        }}
      >
        <CardHeader className="pb-5">
          <CardTitle>{m.title}</CardTitle>
          <CardDescription>{m.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {!canManage && <p className="mb-4 text-sm text-fg-muted">{m.adminOnly}</p>}
          <FormSection title={m.nameSection} description={m.nameSectionDesc}>
            <Field label={m.name} {...(parsed.success ? {} : { error: m.nameTooLong })}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={m.namePlaceholder} maxLength={60} disabled={!canManage} />
            </Field>
          </FormSection>
          <FormSection title={m.logoSection} description={m.logoSectionDesc}>
            <ImagePicker
              name={org.brand.name ?? APP_TITLES.vi.brand}
              src={orgLogoSrc(org)}
              fallback={<span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-fg"><BrandMark small decorative className="h-6 w-6" /></span>}
              hint={m.logoHint}
              disabled={!canManage}
              loading={upload.isPending}
              removing={remove.isPending}
              onPick={(f) => upload.mutate(f)}
              {...(canManage ? { onRemove: () => setConfirmRemove(true) } : {})}
            />
          </FormSection>
        </CardContent>
        <CardFooter>
          <Button type="button" variant="secondary" disabled={!dirty} onClick={() => setName(saved)}>
            {m.undo}
          </Button>
          <Button type="submit" disabled={!canManage || !dirty || !parsed.success} loading={save.isPending}>{m.save}</Button>
        </CardFooter>
      </form>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        icon={<Trash2 className="h-4 w-4" />}
        title={m.removeTitle}
        confirmLabel={m.removeConfirm}
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      >
        {m.removeBody}
      </ConfirmDialog>
    </Card>
  );
}
