"use client";
// Bước 1 – Tạo hồ sơ. Prototype: kiểm tra form bằng zod tại chỗ (bản thật: schema dùng chung @kb/contracts + react-hook-form).
import {
  Alert, Badge, Breadcrumb, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Combobox,
  DatePicker, Field, FormSection, Grid, Input, PageHeader, SegmentedControl, Select, Stack, Textarea, toast,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { DEFAULT_PARTY_CLASS, PartyClassSchema, TransportModeSchema } from "@kb/contracts";
import { z } from "zod";
import { createDossier, dossierKeys, listDossiers } from "@/api/dossiers";
import type { Direction, Dossier } from "@/mocks/types";
import { CUSTOMS_OFFICES, INCOTERMS, SKILL_SETS, suggestedDocuments, TYPE_CODES } from "./create-dossier-options";
import { PARTY_CLASS_OPTIONS, TRANSPORT_LABELS, TRANSPORT_OPTIONS } from "./dossier-display";

const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const schema = z.object({
  direction: z.enum(["NK", "XK"]),
  typeCode: z.string({ error: "Chọn mã loại hình" }).min(1, "Chọn mã loại hình"),
  partner: z.string().trim().min(3, "Nhập tên đối tác nước ngoài (ít nhất 3 ký tự)"),
  customsOffice: z.string({ error: "Chọn cơ quan Hải quan" }).min(1, "Chọn cơ quan Hải quan"),
  incoterm: z.string().min(1),
  transportMode: TransportModeSchema,
  partyClass: PartyClassSchema,
  dueDate: z.string({ error: "Chọn hạn khai" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Chọn hạn khai"),
  skillSetId: z.string().min(1),
  note: z.string().max(500, "Ghi chú tối đa 500 ký tự"),
});

type FormState = {
  direction: Direction;
  typeCode: string | null;
  partner: string;
  customsOffice: string | null;
  incoterm: string;
  transportMode: Dossier["transportMode"];
  partyClass: Dossier["partyClass"];
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
  incoterm: "CIF",
  transportMode: "SEA_CONTAINER",
  partyClass: DEFAULT_PARTY_CLASS,
  dueDate: isoDay(3),
  skillSetId: "default",
  note: "",
};

const errorProp = (e: string | undefined) => (e ? { error: e } : {});

export function CreateDossierPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const dossiers = useQuery({ queryKey: dossierKeys.list({}), queryFn: () => listDossiers() });

  const recentPartners = useMemo(() => {
    const seen = new Set<string>();
    for (const d of dossiers.data ?? []) if (d.direction === form.direction) seen.add(d.partner);
    return [...seen].slice(0, 3);
  }, [dossiers.data, form.direction]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const changeDirection = (d: Direction) => {
    setForm((f) => ({ ...f, direction: d, typeCode: d === "NK" ? "A11" : "B11", incoterm: d === "NK" ? "CIF" : "FOB" }));
  };

  const create = useMutation({
    mutationFn: createDossier,
    onSuccess: async (d) => {
      await qc.invalidateQueries({ queryKey: dossierKeys.all });
      toast({ tone: "success", title: "Đã tạo hồ sơ", description: `${d.code} · bước tiếp theo: upload chứng từ` });
      router.push(`/dossiers/${d.id}?step=upload`);
    },
    onError: () => toast({ tone: "danger", title: "Không tạo được hồ sơ", description: "Thử lại sau ít phút." }),
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
      incoterm: v.incoterm,
      transportMode: v.transportMode,
      // Chỉ tờ khai nhập khẩu có chỉ tiêu này; hồ sơ xuất khẩu giữ mặc định.
      partyClass: v.direction === "NK" ? v.partyClass : DEFAULT_PARTY_CLASS,
      ...(v.note.trim() ? { note: v.note.trim() } : {}),
    });
  };

  const docs = suggestedDocuments(form.direction, form.transportMode, form.incoterm);
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <Stack gap="lg">
      <Breadcrumb linkAs={Link} items={[{ label: "Hồ sơ khai báo", href: "/dossiers" }, { label: "Tạo hồ sơ" }]} />
      <PageHeader
        title="Tạo hồ sơ khai báo"
        description="Bước 1/6 · Khai thông tin lô hàng. Chứng từ sẽ upload ở bước tiếp theo."
      />

      <form onSubmit={submit} noValidate>
        <Grid cols={{ base: 1, lg: 3 }} gap="lg">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-5">
              <CardTitle>Thông tin lô hàng</CardTitle>
              <CardDescription>Các trường có dấu * là bắt buộc.</CardDescription>
            </CardHeader>
            <CardContent>
              {errorCount > 0 && (
                <Alert tone="danger" title={`Còn ${errorCount} trường chưa hợp lệ`} className="mb-6 mt-2">Kiểm tra các ô được tô đỏ bên dưới.</Alert>
              )}
              <FormSection title="Loại lô hàng" description="Quyết định mẫu tờ khai (IDA/EDA) và bộ chứng từ cần có.">
                <SegmentedControl<Direction>
                  label="Loại hồ sơ"
                  className="flex-wrap gap-x-4 gap-y-2 whitespace-nowrap"
                  value={form.direction}
                  onChange={changeDirection}
                  options={[
                    { value: "NK", label: "Nhập khẩu" },
                    { value: "XK", label: "Xuất khẩu" },
                  ]}
                />
                <Field label="Phương thức vận chuyển" required hint="Mã VNACCS – chỉ tiêu phương thức vận chuyển trên tờ khai" className="md:max-w-sm">
                  <Select
                    options={TRANSPORT_OPTIONS}
                    value={form.transportMode}
                    onChange={(e) => set("transportMode", TransportModeSchema.parse(e.target.value))}
                  />
                </Field>
              </FormSection>

              <FormSection title="Khai báo" description="Mã loại hình và chi cục Hải quan nơi đăng ký tờ khai.">
                <Stack gap="md">
                  <Field label="Mã loại hình" required {...errorProp(errors.typeCode)}>
                    <Combobox
                      options={TYPE_CODES[form.direction]}
                      value={form.typeCode}
                      onChange={(v) => set("typeCode", v)}
                      placeholder="Chọn mã loại hình"
                    />
                  </Field>
                  <Field label="Cơ quan Hải quan" required {...errorProp(errors.customsOffice)}>
                    <Combobox
                      options={CUSTOMS_OFFICES}
                      value={form.customsOffice}
                      onChange={(v) => set("customsOffice", v)}
                      placeholder="Gõ tên hoặc mã chi cục"
                    />
                  </Field>
                </Stack>
                <Field label="Hạn khai" required className="md:max-w-xs" {...errorProp(errors.dueDate)}>
                  <DatePicker value={form.dueDate} onChange={(v) => set("dueDate", v)} min={isoDay(0)} />
                </Field>
              </FormSection>

              <FormSection title="Đối tác & giao hàng" description="Ghi tên đối tác đúng như trên invoice để AI đối chiếu.">
                <Stack gap="sm">
                  <Field
                    label={form.direction === "NK" ? "Người bán (đối tác nước ngoài)" : "Người mua (đối tác nước ngoài)"}
                    required
                    {...errorProp(errors.partner)}
                  >
                    <Input value={form.partner} onChange={(e) => set("partner", e.target.value)} placeholder="VD: HANSOL PRECISION CO., LTD." />
                  </Field>
                  {recentPartners.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-fg-subtle">Gần đây:</span>
                      {recentPartners.map((p) => (
                        <Button key={p} type="button" size="sm" variant="secondary" onClick={() => set("partner", p)}>
                          {p}
                        </Button>
                      ))}
                    </div>
                  )}
                </Stack>
                {form.direction === "NK" && (
                  <Field label="Phân loại cá nhân/tổ chức" required hint="Chỉ tiêu 1.7 tờ khai nhập khẩu – người gửi (nước ngoài) và người nhận" className="md:max-w-sm">
                    <Select
                      options={PARTY_CLASS_OPTIONS}
                      value={form.partyClass}
                      onChange={(e) => set("partyClass", PartyClassSchema.parse(e.target.value))}
                    />
                  </Field>
                )}
                <Field label="Điều kiện giao hàng" required hint="Incoterms 2020" className="md:max-w-xs">
                  <Select options={INCOTERMS} value={form.incoterm} onChange={(e) => set("incoterm", e.target.value)} />
                </Field>
              </FormSection>

              <FormSection title="AI & ghi chú" description="Cách AI đọc bộ chứng từ này và ghi chú riêng của nhóm (không gửi Hải quan).">
                <Field label="Bộ Skill AI" className="md:max-w-xs">
                  <Select options={SKILL_SETS} value={form.skillSetId} onChange={(e) => set("skillSetId", e.target.value)} />
                </Field>
                <Field label="Ghi chú nội bộ" {...errorProp(errors.note)}>
                  <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="VD: số PO, cảng hàng về, người liên hệ forwarder" />
                </Field>
              </FormSection>
            </CardContent>
            <CardFooter className="justify-end">
              <Button asChild variant="ghost">
                <Link href="/dossiers">Hủy</Link>
              </Button>
              <Button type="submit" loading={create.isPending}>Tạo hồ sơ & upload chứng từ</Button>
            </CardFooter>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Chứng từ gợi ý cần có</CardTitle>
              <CardDescription>
                {form.direction === "NK" ? "Nhập khẩu" : "Xuất khẩu"} · {TRANSPORT_LABELS[form.transportMode].toLowerCase()} · {form.incoterm}
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
                          {d.important && <Badge tone="primary">Nên có</Badge>}
                        </div>
                        <span className="text-xs text-fg-muted">{d.note}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 rounded-md bg-surface-muted p-3 text-xs text-fg-muted">
                  <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>Đây là gợi ý, không bắt buộc. Thiếu chứng từ hệ thống chỉ cảnh báo – nhiều lô thực tế không có Packing List.</p>
                </div>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </form>
    </Stack>
  );
}
