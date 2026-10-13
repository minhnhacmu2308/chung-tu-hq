"use client";
import { Alert, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, FormSection, Grid, Input, Skeleton, Stack, toast } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { sessionKeys } from "@/api/session";
import { getOrganization, settingsKeys, updateOrganization, type OrgProfileInput } from "@/api/settings";

export function OrgTab() {
  const qc = useQueryClient();
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
      toast({ tone: "success", title: "Đã lưu thông tin doanh nghiệp" });
    },
  });

  if (isLoading || !org) return <Skeleton className="h-80" />;
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
          <CardTitle>Thông tin doanh nghiệp</CardTitle>
          <CardDescription>Dùng làm thông tin người nhập/xuất khẩu trên tờ khai – không lấy theo tên tiếng Anh trên chứng từ.</CardDescription>
        </CardHeader>
        <CardContent>
          {save.isError && <Alert tone="danger" className="mb-6">{save.error.message}</Alert>}
          <FormSection title="Định danh" description="MST là định danh của doanh nghiệp trên hệ thống – không đổi được. Cần đổi: liên hệ hỗ trợ.">
            <Field label="Mã số thuế" className="md:max-w-xs">
              <div className="relative">
                <Input value={org.taxCode} readOnly disabled className="pr-9 font-mono" />
                <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
              </div>
            </Field>
            <Field label="Tên doanh nghiệp" required hint="Theo đăng ký thuế">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
          </FormSection>
          <FormSection title="Liên hệ" description="In ở ô người nhập/xuất khẩu trên tờ khai.">
            <Field label="Địa chỉ">
              <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            </Field>
            <Field label="Số điện thoại" className="md:max-w-xs">
              <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} inputMode="tel" />
            </Field>
          </FormSection>
        </CardContent>
        <CardFooter>
          <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setDraft({ name: org.name, address: org.address, phone: org.phone })}>
            Hoàn tác
          </Button>
          <Button type="submit" disabled={!dirty} loading={save.isPending}>Lưu thay đổi</Button>
        </CardFooter>
      </form>
    </Card>
  );
}
