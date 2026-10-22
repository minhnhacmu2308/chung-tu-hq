"use client";
// Bước 1 – Tạo hồ sơ. Prototype: kiểm tra form bằng zod tại chỗ (bản thật: schema dùng chung @kb/contracts + react-hook-form).
import {
  Alert, Badge, Breadcrumb, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Combobox,
  DatePicker, fill, Field, FormSection, Grid, Input, PageHeader, pickMessages, SegmentedControl, Select, Stack, Textarea, toast, useUiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Info } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DEFAULT_PARTY_CLASS, TransportModeSchema } from "@kb/contracts";
import { z } from "zod";
import { createDossier, dossierKeys, listDossiers } from "@/api/dossiers";
import { addInboxToDossier, inboxKeys, listInbox } from "@/api/mailbox";
import { errorText } from "@/lib/reason-codes";
import { getDeclarationProfile, settingsKeys } from "@/api/settings";
import { prefillFromProfile } from "./profile-prefill";
import type { Direction, Dossier } from "@/mocks/types";
import { CUSTOMS_OFFICES, skillSetOptions, suggestedDocuments, typeCodesIn, typeGroupOf, typeGroupOptions, type TypeGroup } from "./create-dossier-options";
import { DIRECTION_LABELS, transportLabels, transportOptions } from "./dossier-display";
import { CREATE_DOSSIER_MESSAGES } from "./dossiers.messages";

const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

type CreateMessages = Record<keyof (typeof CREATE_DOSSIER_MESSAGES)["vi"], string>;

/** Schema theo ngôn ngữ (chỉ thông báo lỗi đổi; dữ liệu gửi backend như nhau). */
const makeSchema = (t: CreateMessages) =>
  z.object({
    direction: z.enum(["NK", "XK"]),
    typeCode: z.string({ error: t.errTypeCode }).min(1, t.errTypeCode),
    partner: z.string().trim().min(3, t.errPartner),
    customsOffice: z.string({ error: t.errOffice }).min(1, t.errOffice),
    transportMode: TransportModeSchema,
    dueDate: z.string({ error: t.errDue }).regex(/^\d{4}-\d{2}-\d{2}$/, t.errDue),
    skillSetId: z.string().min(1),
    note: z.string().max(500, t.errNote),
  });

type FormState = {
  direction: Direction;
  typeCode: string | null;
  partner: string;
  customsOffice: string | null;
  transportMode: Dossier["transportMode"];
  /** Nhóm loại hình người dùng chọn; null → theo mã loại hình đang chọn (kể cả mã điền sẵn từ Mặc định khai báo). */
  typeGroup: TypeGroup | null;
  dueDate: string | null;
  skillSetId: string;
  note: string;
};

type Errors = Partial<Record<keyof FormState, string>>;

const INITIAL: FormState = {
  direction: "NK",
  typeCode: "A11",
  partner: "",
  customsOffice: null,
  transportMode: "SEA_CONTAINER",
  typeGroup: null,
  dueDate: isoDay(3),
  skillSetId: "default",
  note: "",
};

const errorProp = (e: string | undefined) => (e ? { error: e } : {});

export function CreateDossierPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const locale = useUiLocale();
  const t = pickMessages(CREATE_DOSSIER_MESSAGES, locale);
  const directionLabels = pickMessages(DIRECTION_LABELS, locale);
  const schema = useMemo(() => makeSchema(t), [t]);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  // Ô người dùng đã tự chọn – không bị Mặc định khai báo ghi đè.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const profile = useQuery({ queryKey: settingsKeys.declarationProfile(form.direction), queryFn: () => getDeclarationProfile(form.direction) });
  useEffect(() => {
    if (profile.data) setForm((f) => prefillFromProfile(f, profile.data.values, touched));
    // touched cố ý không nằm trong deps: chỉ điền khi tải xong mặc định của chiều đang chọn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data]);
  const dossiers = useQuery({ queryKey: dossierKeys.list({}), queryFn: () => listDossiers() });
  // Tạo hồ sơ từ email ở Hộp thư chứng từ (?inbox=<mã email>): tạo xong thì thêm các file chờ xếp vào hồ sơ mới.
  const inboxId = useSearchParams().get("inbox");
  const inbox = useQuery({ queryKey: inboxKeys.list, queryFn: listInbox, enabled: !!inboxId });
  const fromMail = inbox.data?.find((m) => m.id === inboxId && m.status === "NEW");
  const mailFiles = fromMail?.attachments.filter((a) => a.status === "PENDING").map((a) => a.id) ?? [];

  const recentPartners = useMemo(() => {
    const seen = new Set<string>();
    for (const d of dossiers.data ?? []) if (d.direction === form.direction) seen.add(d.partner);
    return [...seen].slice(0, 3);
  }, [dossiers.data, form.direction]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "typeCode" || key === "customsOffice") setTouched((t) => new Set(t).add(key));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const changeDirection = (d: Direction) => {
    setTouched(new Set());
    setForm((f) => ({ ...f, direction: d, typeCode: d === "NK" ? "A11" : "B11", typeGroup: null }));
  };

  const typeGroup = form.typeGroup ?? typeGroupOf(form.typeCode);
  const typeOptions = typeCodesIn(form.direction, typeGroup, locale);
  // Đổi nhóm: giữ mã nếu vẫn thuộc nhóm, không thì chọn mã đầu của nhóm.
  const changeTypeGroup = (g: TypeGroup) => {
    const codes = typeCodesIn(form.direction, g, locale);
    const keep = codes.some((o) => o.value === form.typeCode);
    setForm((f) => ({ ...f, typeGroup: g, typeCode: keep ? f.typeCode : (codes[0]?.value ?? null) }));
    setTouched((t) => new Set(t).add("typeCode"));
  };

  const create = useMutation({
    mutationFn: createDossier,
    onSuccess: async (d) => {
      if (mailFiles.length) {
        try {
          await addInboxToDossier({ dossierId: d.id, attachmentIds: mailFiles });
        } catch (e) {
          toast({ tone: "warning", title: t.fromInboxFailed, description: errorText(e, locale) });
        }
        void qc.invalidateQueries({ queryKey: inboxKeys.all });
      }
      await qc.invalidateQueries({ queryKey: dossierKeys.all });
      toast({ tone: "success", title: t.created, description: fill(t.createdNext, { code: d.code }) });
      router.push(`/dossiers/${d.id}?step=upload`);
    },
    onError: () => toast({ tone: "danger", title: t.createFailed, description: t.createFailedHint }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof FormState;
        next[k] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    const v = parsed.data;
    const office = CUSTOMS_OFFICES.find((o) => o.value === v.customsOffice)?.label ?? v.customsOffice;
    create.mutate({
      direction: v.direction,
      typeCode: v.typeCode,
      partner: v.partner,
      customsOffice: office,
      skillSetId: v.skillSetId,
      dueDate: v.dueDate,
      // Không hỏi khi tạo hồ sơ: tờ khai lấy điều kiện giao hàng đọc từ invoice ở bước OCR.
      incoterm: "",
      transportMode: v.transportMode,
      // Không hỏi ở bước tạo hồ sơ: tờ khai lấy theo Mặc định khai báo (PL_CN), sửa ở bước Review nếu cần.
      partyClass: DEFAULT_PARTY_CLASS,
      ...(v.note.trim() ? { note: v.note.trim() } : {}),
    });
  };

  const docs = suggestedDocuments(form.direction, form.transportMode, locale);
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <Stack gap="lg">
      <Breadcrumb linkAs={Link} items={[{ label: t.breadcrumbList, href: "/dossiers" }, { label: t.breadcrumbNew }]} />
      <PageHeader
        title={t.title}
        description={t.description}
      />

      {fromMail && mailFiles.length > 0 && (
        <Alert tone="info" title={t.fromInboxTitle}>{fill(t.fromInboxBody, { subject: fromMail.subject, from: fromMail.fromName, n: mailFiles.length })}</Alert>
      )}

      <form onSubmit={submit} noValidate>
        <Grid cols={{ base: 1, lg: 3 }} gap="lg">
          <Card className="cq-lg:col-span-2">
            <CardHeader className="pb-5">
              <CardTitle>{t.shipmentInfo}</CardTitle>
              <CardDescription>{t.requiredHint}</CardDescription>
            </CardHeader>
            <CardContent>
              {errorCount > 0 && (
                <Alert tone="danger" title={fill(t.invalidCount, { n: errorCount })} className="mb-6 mt-2">{t.invalidHint}</Alert>
              )}
              <FormSection title={t.kindSection} description={t.kindSectionDesc}>
                <SegmentedControl<Direction>
                  label={t.kind}
                  className="flex-wrap gap-x-4 gap-y-2 whitespace-nowrap"
                  value={form.direction}
                  onChange={changeDirection}
                  options={[
                    { value: "NK", label: directionLabels.NK },
                    { value: "XK", label: directionLabels.XK },
                  ]}
                />
                <Field label={t.transport} required hint={t.transportHint} className="cq-md:max-w-sm">
                  <Select
                    options={transportOptions(locale)}
                    value={form.transportMode}
                    onChange={(e) => set("transportMode", TransportModeSchema.parse(e.target.value))}
                  />
                </Field>
              </FormSection>

              <FormSection title={t.declSection} description={t.declSectionDesc}>
                <Stack gap="md">
                  <SegmentedControl<TypeGroup>
                    label={t.typeGroup}
                    className="flex-wrap gap-x-4 gap-y-2 whitespace-nowrap"
                    value={typeGroup}
                    onChange={changeTypeGroup}
                    options={typeGroupOptions(locale)}
                  />
                  <Field label={t.typeCode} required {...errorProp(errors.typeCode)}>
                    <Combobox
                      options={typeOptions}
                      value={form.typeCode}
                      onChange={(v) => set("typeCode", v)}
                      placeholder={t.typeCodePlaceholder}
                    />
                  </Field>
                  <Field label={t.office} required {...errorProp(errors.customsOffice)}>
                    <Combobox
                      options={CUSTOMS_OFFICES}
                      value={form.customsOffice}
                      onChange={(v) => set("customsOffice", v)}
                      placeholder={t.officePlaceholder}
                    />
                  </Field>
                </Stack>
                <Field label={t.due} required className="cq-md:max-w-xs" {...errorProp(errors.dueDate)}>
                  <DatePicker value={form.dueDate} onChange={(v) => set("dueDate", v)} min={isoDay(0)} />
                </Field>
              </FormSection>

              <FormSection title={t.partnerSection} description={t.partnerSectionDesc}>
                <Stack gap="sm">
                  <Field
                    label={form.direction === "NK" ? t.seller : t.buyer}
                    required
                    {...errorProp(errors.partner)}
                  >
                    <Input value={form.partner} onChange={(e) => set("partner", e.target.value)} placeholder={t.partnerPlaceholder} />
                  </Field>
                  {recentPartners.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-fg-subtle">{t.recent}</span>
                      {recentPartners.map((p) => (
                        <Button key={p} type="button" size="sm" variant="secondary" onClick={() => set("partner", p)}>
                          {p}
                        </Button>
                      ))}
                    </div>
                  )}
                </Stack>
              </FormSection>

              <FormSection title={t.aiSection} description={t.aiSectionDesc}>
                <Field label={t.skillSet} className="cq-md:max-w-xs">
                  <Select options={skillSetOptions(locale)} value={form.skillSetId} onChange={(e) => set("skillSetId", e.target.value)} />
                </Field>
                <Field label={t.note} {...errorProp(errors.note)}>
                  <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder={t.notePlaceholder} />
                </Field>
              </FormSection>
            </CardContent>
            <CardFooter className="justify-end">
              <Button asChild variant="ghost">
                <Link href="/dossiers">{t.cancel}</Link>
              </Button>
              <Button type="submit" loading={create.isPending}>{t.submit}</Button>
            </CardFooter>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>{t.suggestedTitle}</CardTitle>
              <CardDescription>
                {directionLabels[form.direction]} · {transportLabels(locale)[form.transportMode].toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Stack gap="md">
                <ul className="flex flex-col gap-3">
                  {docs.map((d) => (
                    <li key={d.name} className="flex gap-3">
                      {d.important ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                      )}
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-fg">{d.name}</span>
                          {d.important && <Badge tone="primary">{t.recommended}</Badge>}
                        </div>
                        <span className="text-xs text-fg-muted">{d.note}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 rounded-md bg-surface-muted p-3 text-xs text-fg-muted">
                  <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>{t.suggestedHint}</p>
                </div>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </form>
    </Stack>
  );
}
