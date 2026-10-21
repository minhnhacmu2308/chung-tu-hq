"use client";
import {
  Alert, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, FormSection, Grid, Input, Skeleton, Stack, toast, SkeletonForm, useMessages,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { sessionKeys } from "@/api/session";
import { getOrganization, settingsKeys, updateOrganization, type OrgProfileInput } from "@/api/settings";
import { ORG_TAB_MESSAGES } from "./org-tab.messages";

export function OrgTab() {
  const qc = useQueryClient();
  const m = useMessages(ORG_TAB_MESSAGES);
  const { data: org, isLoading } = useQuery({ queryKey: settingsKeys.org, queryFn: getOrganization });
  const [draft, setDraft] = useState<OrgProfileInput>({ name: "", address: "", phone: "" });
  useEffect(() => {
    if (org) setDraft({ name: org.name, address: org.address, phone: org.phone });
  }, [org]);

  const save = useMutation({
    mutationFn: () => updateOrganization(draft),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.org });
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
      toast({ tone: "success", title: m.saved });
    },
  });

  if (isLoading || !org) return <Card className="max-w-4xl p-5"><SkeletonForm fields={4} /></Card>;
  const dirty = draft.name !== org.name || draft.address !== org.address || draft.phone !== org.phone;

  return (
    <Card className="max-w-4xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <CardHeader className="pb-5">
          <CardTitle>{m.title}</CardTitle>
          <CardDescription>{m.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {save.isError && <Alert tone="danger" className="mb-6">{save.error.message}</Alert>}
          <FormSection title={m.identity} description={m.identityDesc}>
            <Field label={m.taxCode} className="cq-md:max-w-xs">
              <div className="relative">
                <Input value={org.taxCode} readOnly disabled className="pr-9 font-mono" />
                <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
              </div>
            </Field>
            <Field label={m.name} required hint={m.nameHint}>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
          </FormSection>
          <FormSection title={m.contact} description={m.contactDesc}>
            <Field label={m.address}>
              <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            </Field>
            <Field label={m.phone} className="cq-md:max-w-xs">
              <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} inputMode="tel" />
            </Field>
          </FormSection>
        </CardContent>
        <CardFooter>
          <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setDraft({ name: org.name, address: org.address, phone: org.phone })}>
            {m.undo}
          </Button>
          <Button type="submit" disabled={!dirty} loading={save.isPending}>{m.save}</Button>
        </CardFooter>
      </form>
    </Card>
  );
}
