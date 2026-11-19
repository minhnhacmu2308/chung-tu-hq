"use client";
// Trang in tờ khai (chỉ đọc): lối tắt từ bước Khai báo Hải quan và menu "…" của danh sách Hồ sơ / Khai báo Hải quan – không phải quay về tab Review.
// Dùng lại bản in của Review với canEdit=false. Chữ chìm theo giai đoạn (printTitle): chưa khai → "BẢN NHÁP", khai tạm, đã hủy; có kết quả → không chữ chìm.
// Chờ cả giai đoạn truyền: chưa biết giai đoạn mà in sẽ ra chữ chìm "BẢN NHÁP" trên tờ khai đã có số.
import { branchCount } from "@kb/contracts";
import { Button, EmptyState, fill, PageHeader, PageLoading, Stack, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileCheck2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { customsKeys, getSubmission } from "@/api/customs";
import { declarationKeys, getDeclarationView } from "@/api/declaration";
import { LoadError } from "@/components/common/load-error";
import { PrintDeclaration } from "./print-declaration";
import { DECLARATION_PRINT_PAGE_MESSAGES } from "./declaration-print-page.messages";

/** Trang in tờ khai; `sheet` = tờ khai nhánh (1-based), bỏ trống = tờ 1. */
export const declarationPrintHref = (dossierId: string, sheet?: number) =>
  `/dossiers/${dossierId}/declaration/print${sheet && sheet > 1 ? `?to=${sheet}` : ""}`;

export function DeclarationPrintPage({ dossierId, sheet: wanted }: { dossierId: string; sheet: number }) {
  const t = useMessages(DECLARATION_PRINT_PAGE_MESSAGES);
  const router = useRouter();
  const viewQ = useQuery({ queryKey: declarationKeys.view(dossierId), queryFn: () => getDeclarationView(dossierId) });
  const subQ = useQuery({ queryKey: customsKeys.submission(dossierId), queryFn: () => getSubmission(dossierId) });

  if (viewQ.isLoading || subQ.isLoading) return <PageLoading />;
  if (viewQ.isError || subQ.isError) {
    return <LoadError title={t.loadFailed} onRetry={() => void (viewQ.isError ? viewQ.refetch() : subQ.refetch())} />;
  }
  const { declaration: decl, items, branches } = viewQ.data!;
  const sub = subQ.data;
  const back = (
    <Button asChild variant="secondary">
      <Link href={`/dossiers/${dossierId}`}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t.backToDossier}
      </Link>
    </Button>
  );
  if (!decl) return <EmptyState icon={<FileCheck2 />} title={t.emptyTitle} description={t.emptyDesc} action={back} />;

  const sheet = Math.max(1, Math.min(branchCount(items.length), wanted));
  const sent = Boolean(sub && sub.stage !== "NOT_SENT");
  const declNo = sub?.branches.find((b) => b.no === sheet)?.declarationNo ?? (sheet === 1 ? sub?.result?.declarationNo : null) ?? null;

  return (
    <Stack gap="lg">
      <div className="print:hidden">
        <PageHeader
          title={declNo ? fill(t.titleNo, { no: declNo }) : t.title}
          description={t.description}
          actions={
            <Button asChild variant="secondary">
              <Link href={`/dossiers/${dossierId}?step=${sent ? "submit" : "review"}`}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                {sent ? t.backToSubmit : t.backToReview}
              </Link>
            </Button>
          }
        />
      </div>
      {/* Tiêu đề vùng trên bản in là h3 (như trong tab Review) – h2 ẩn để thứ bậc tiêu đề liền mạch dưới h1 của trang. */}
      <h2 className="sr-only">{t.paperHeading}</h2>
      <PrintDeclaration
        dossierId={dossierId}
        decl={decl}
        items={items}
        mode="LOCKED"
        canEdit={false}
        submission={sub}
        branches={branches}
        sheet={sheet}
        onSheetChange={(no) => router.replace(declarationPrintHref(dossierId, no), { scroll: false })}
      />
    </Stack>
  );
}
