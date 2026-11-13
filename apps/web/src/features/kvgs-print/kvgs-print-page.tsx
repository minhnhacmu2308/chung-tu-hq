"use client";
// Trang in bản kê mã vạch qua khu vực giám sát (spec KVGS §4): thanh công cụ (3 ngôn ngữ, không in) + bản kê theo mẫu cont/le.
// Dữ liệu chỉ từ bảng kê mới nhất của tờ (`getKvgs(...).kvgs.sheet`); chưa có → EmptyState + về thẻ ở bước Truyền Hải quan.
import { Alert, Button, EmptyState, fill, PageHeader, PageLoading, SegmentedControl, Stack, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { customsKeys, getSubmission } from "@/api/customs";
import { getKvgs, kvgsKeys } from "@/api/kvgs";
import { LoadError } from "@/components/common/load-error";
import { KvgsDocument, type KvgsTemplate } from "./kvgs-document";
import { KVGS_PRINT_MESSAGES } from "./kvgs-print.messages";

export const kvgsPrintHref = (dossierId: string, branch: number, template: KvgsTemplate) => `/dossiers/${dossierId}/kvgs/${branch}/print?mau=${template}`;
/** Thẻ "Qua khu vực giám sát" của tờ `branch` trong bước Truyền Hải quan. */
export const kvgsCardHref = (dossierId: string, branch: number) => `/dossiers/${dossierId}?step=submit#kvgs-${branch}`;

export function KvgsPrintPage({ dossierId, branch, template }: { dossierId: string; branch: number; template: KvgsTemplate | null }) {
  const t = useMessages(KVGS_PRINT_MESSAGES);
  const router = useRouter();
  const q = useQuery({ queryKey: kvgsKeys.detail(dossierId, branch), queryFn: () => getKvgs(dossierId, branch) });
  // Nhiều tờ khai nhánh → chọn tờ (lô 1 tờ: không hiện).
  const subQ = useQuery({ queryKey: customsKeys.submission(dossierId), queryFn: () => getSubmission(dossierId) });
  const branches = subQ.data?.branches ?? [];

  if (q.isLoading) return <PageLoading />;
  if (q.isError) return <LoadError title={t.loadFailed} onRetry={() => void q.refetch()} />;
  const sheet = q.data?.kvgs?.sheet ?? null;
  if (!sheet) {
    return (
      <EmptyState
        title={t.emptyTitle}
        description={t.emptyDesc}
        action={
          <Button asChild variant="secondary">
            <Link href={kvgsCardHref(dossierId, branch)}>
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {t.backToCard}
            </Link>
          </Button>
        }
      />
    );
  }
  const fits: KvgsTemplate = sheet.kind === "CONTAINER" ? "cont" : "le";
  const mau: KvgsTemplate = template ?? fits;
  // Mẫu không khớp loại bản kê (?mau=le cho hàng container…) → bản in là bảng trống: cảnh báo và khóa In / Tải PDF.
  const mismatch = mau !== fits;

  return (
    <Stack gap="lg">
      <div data-paper-mark className="flex flex-col gap-4 print:hidden">
        <PageHeader
          title={fill(t.titleDecl, { no: sheet.declarationNo })}
          description={t.description}
          actions={
            <>
              <Button asChild variant="ghost">
                <Link href={kvgsCardHref(dossierId, branch)}>
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                  {t.backToCard}
                </Link>
              </Button>
              <Button variant="secondary" leftIcon={<FileDown className="h-4 w-4" />} disabled={mismatch} onClick={() => window.print()}>{t.downloadPdf}</Button>
              <Button leftIcon={<Printer className="h-4 w-4" />} disabled={mismatch} onClick={() => window.print()}>{t.print}</Button>
            </>
          }
        />
        <div className="flex flex-wrap items-end gap-4">
          <SegmentedControl
            label={t.template}
            value={mau}
            onChange={(m) => router.replace(kvgsPrintHref(dossierId, branch, m))}
            options={[{ value: "cont", label: t.templateCont }, { value: "le", label: t.templateLe }]}
          />
          {branches.length > 1 && (
            <SegmentedControl
              label={t.branch}
              value={String(branch)}
              onChange={(b) => router.replace(kvgsPrintHref(dossierId, Number(b), mau))}
              options={branches.map((b) => ({ value: String(b.no), label: fill(t.branchOption, { n: b.no }) }))}
            />
          )}
        </div>
        {mismatch && <Alert tone="warning">{mau === "cont" ? t.mismatchCont : t.mismatchLe}</Alert>}
      </div>
      <KvgsDocument sheet={sheet} template={mau} />
    </Stack>
  );
}
