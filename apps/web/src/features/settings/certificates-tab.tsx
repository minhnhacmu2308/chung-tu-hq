"use client";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DatePicker, Dialog, DialogContent, DialogFooter,
  EmptyState, Field, Input, Select, Skeleton, Stack, toast,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileKey2, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { addCertificate, listCertificates, removeCertificate, setDefaultCertificate, settingsKeys } from "@/api/settings";
import { daysUntil, formatDate } from "@/lib/format";
import type { DigitalCertificate } from "@/mocks/types";

const ISSUERS = ["VNPT-CA", "Viettel-CA", "FPT-CA", "BKAV-CA", "MISA-CA"];

function expiry(c: DigitalCertificate): { tone: "success" | "warning" | "danger"; label: string } {
  const d = daysUntil(c.validTo);
  if (d < 0) return { tone: "danger", label: "Đã hết hạn" };
  if (d <= 30) return { tone: "warning", label: `Còn ${d} ngày` };
  return { tone: "success", label: "Còn hiệu lực" };
}

function AddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [issuer, setIssuer] = useState(ISSUERS[0]!);
  const [serial, setSerial] = useState("");
  const [validTo, setValidTo] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => addCertificate({ issuer, serial, validTo: validTo ?? "" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.certificates });
      toast({ tone: "success", title: "Đã thêm chứng thư số" });
      setSerial("");
      setValidTo(null);
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { add.reset(); onOpenChange(o); }}>
      <DialogContent title="Thêm chứng thư số" icon={<FileKey2 className="h-4 w-4" />} size="sm" description="Bản mô phỏng: nhập thông tin chứng thư. Cách ký số thật (ký từ xa / USB token) đang chờ chốt với Customs Hub.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Stack gap="md">
            {add.isError && <Alert tone="danger">{add.error.message}</Alert>}
            <Field label="Nhà cung cấp CA">
              <Select options={ISSUERS.map((i) => ({ value: i, label: i }))} value={issuer} onChange={(e) => setIssuer(e.target.value)} />
            </Field>
            <Field label="Số serial" required>
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="font-mono" placeholder="5401 0A3F 9C21 77E0" />
            </Field>
            <Field label="Hết hạn ngày" required>
              <DatePicker value={validTo} onChange={setValidTo} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" loading={add.isPending}>Thêm</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CertificatesTab() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: settingsKeys.certificates, queryFn: listCertificates });
  const onError = (e: Error) => toast({ tone: "danger", title: "Không thực hiện được", description: e.message });
  const refresh = () => qc.invalidateQueries({ queryKey: settingsKeys.certificates });
  const makeDefault = useMutation({
    mutationFn: (id: string) => setDefaultCertificate(id),
    onSuccess: () => {
      void refresh();
      toast({ tone: "success", title: "Đã đổi chứng thư mặc định", description: "Bấm Kiểm tra kết nối Customs Hub để ký thử." });
    },
    onError,
  });
  const remove = useMutation({ mutationFn: (id: string) => removeCertificate(id), onSuccess: () => void refresh(), onError });
  const expiringDefault = data?.find((c) => c.isDefault && daysUntil(c.validTo) <= 30);

  return (
    <Stack gap="md">
      {expiringDefault && (
        <Alert tone="warning" title="Chứng thư mặc định sắp hết hạn">
          {expiringDefault.issuer} hết hạn ngày {formatDate(expiringDefault.validTo)}. Hết hạn sẽ không truyền được tờ khai – gia hạn hoặc chọn chứng thư khác làm mặc định.
        </Alert>
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Chứng thư số</CardTitle>
              <CardDescription>Dùng để ký tờ khai khi truyền qua Customs Hub. Chứng thư mặc định được chọn sẵn ở bước Khai báo Hải quan.</CardDescription>
            </div>
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>Thêm chứng thư</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading || !data ? (
            <div className="p-4"><Skeleton className="h-32" /></div>
          ) : data.length === 0 ? (
            <EmptyState title="Chưa có chứng thư số" description="Thêm chứng thư để truyền tờ khai." action={<Button size="sm" onClick={() => setAddOpen(true)}>Thêm chứng thư</Button>} />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {data.map((c) => {
                const e = expiry(c);
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-4">
                    <ShieldCheck className="h-6 w-6 shrink-0 text-fg-subtle" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                        {c.issuer}
                        {c.isDefault && <Badge tone="primary">Mặc định</Badge>}
                        <Badge tone={e.tone}>{e.label}</Badge>
                      </p>
                      <p className="truncate text-sm text-fg-muted">{c.subject}</p>
                      <p className="text-xs text-fg-subtle">
                        Serial <span className="font-mono">{c.serial}</span> · hết hạn {formatDate(c.validTo)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!c.isDefault && (
                        <>
                          <Button size="sm" variant="secondary" loading={makeDefault.isPending && makeDefault.variables === c.id} onClick={() => makeDefault.mutate(c.id)}>
                            Đặt mặc định
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove.mutate(c.id)}>Gỡ</Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <AddDialog open={addOpen} onOpenChange={setAddOpen} />
    </Stack>
  );
}
