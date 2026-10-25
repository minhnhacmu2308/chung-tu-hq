"use client";
// Thông tin Hải quan trả về cho tờ khai (người khai không nhập): đăng ký, phân loại kiểm tra, thuế & tỷ giá chính thức,
// trị giá tính thuế từng dòng, chỉ thị Hải quan, cấp phép thông quan. Dùng ở bước Khai báo Hải quan và tab "Hải quan trả về" của Review.
import {
  Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, fill, Grid, Stack, useMessages, useUiLocale,
} from "@kb/ui";
import type { CustomsInfo, CustomsInfoItem } from "@kb/contracts";
import { Landmark } from "lucide-react";
import { useId } from "react";
import { formatDate, formatMoney, formatNumber, formatRelative, formatVnd } from "@/lib/format";
import { KeyValue } from "./declaration-parts";
import { inspectionLabel, vndDiff } from "./customs-info-view";
import { CUSTOMS_INFO_MESSAGES } from "./customs-info-panel.messages";

/** Số ứng dụng ước tính lúc dựng tờ khai – để người khai thấy chênh lệch với số Hải quan. */
export type CustomsEstimate = { taxVnd?: string | undefined; customsValueVnd?: string | undefined; exchangeRate?: string | undefined };

const pending = (text: string) => <span className="text-fg-subtle">{text}</span>;

function DiffHint({ customs, estimate }: { customs: string | undefined; estimate: string | undefined }) {
  const t = useMessages(CUSTOMS_INFO_MESSAGES);
  const d = vndDiff(customs, estimate);
  if (!d || estimate === undefined) return null;
  return (
    <span>
      {fill(t.estimated, { amount: formatVnd(estimate) })}
      {d.same ? t.match : fill(t.diff, { diff: `${d.diff.startsWith("-") ? "" : "+"}${formatVnd(d.diff)}` })}
    </span>
  );
}

const col = createDataTableColumnHelper<CustomsInfoItem>();

function ItemsTable({ kind, items }: { kind: "IDA" | "EDA"; items: CustomsInfoItem[] }) {
  const t = useMessages(CUSTOMS_INFO_MESSAGES);
  const columns = col.columns([
    col.accessor("lineNo", { header: "#", size: 48, meta: { align: "center" } }),
    col.accessor("hsCode", { header: t.colHs, cell: (c) => <span className="font-mono">{c.getValue() ?? "—"}</span> }),
    col.accessor("customsValue", {
      header: t.colValue,
      meta: { align: "end" },
      cell: (c) => {
        const v = c.getValue();
        const cur = c.row.original.customsValueCurrency ?? "VND";
        return v ? formatMoney(v, cur, cur === "VND" ? 0 : 2) : "—";
      },
    }),
    col.accessor("taxRate", { header: kind === "IDA" ? t.colRateImport : t.colRateExport, meta: { align: "end" }, cell: (c) => (c.getValue() !== undefined ? `${formatNumber(c.getValue()!, 0)}%` : "—") }),
    col.accessor("taxAmountVnd", { header: kind === "IDA" ? t.colTaxImport : t.colTaxExport, meta: { align: "end" }, cell: (c) => (c.getValue() !== undefined ? formatVnd(c.getValue()!) : "—") }),
  ]);
  return <DataTable aria-label={t.itemsAria} columns={columns} data={items} getRowId={(r) => String(r.lineNo)} />;
}

/** `sheet`: lô nhiều tờ – tên tờ ghi sau tiêu đề (mỗi tờ một khối, id tiêu đề con riêng từng khối). */
export function CustomsInfoPanel({ kind, info, estimate, sheet }: { kind: "IDA" | "EDA"; info: CustomsInfo; estimate?: CustomsEstimate | undefined; sheet?: string }) {
  const t = useMessages(CUSTOMS_INFO_MESSAGES);
  const uid = useId();
  const locale = useUiLocale();
  const inspection = inspectionLabel(info.inspectionCode, locale);
  const registered = info.registeredDate ? `${formatDate(info.registeredDate)}${info.registeredTime ? ` ${info.registeredTime}` : ""}` : null;
  const rate = info.exchangeRates[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Landmark aria-hidden="true" className="h-5 w-5 text-primary" />
          {t.title}
          {sheet && <span className="text-fg-muted">· {sheet}</span>}
          <Badge tone="success" size="sm">{t.notEntered}</Badge>
        </CardTitle>
        <CardDescription>{fill(t.description, { when: formatRelative(info.receivedAt) })}</CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="lg">
          {info.directives.length > 0 && (
            <Alert tone="warning" title={`${fill(t.directives, { n: info.directives.length })}${info.directiveKind === "A" ? t.directiveA : info.directiveKind === "B" ? t.directiveB : ""}`}>
              <ul className="mt-1 flex flex-col gap-2">
                {info.directives.map((d, i) => (
                  <li key={i}>
                    <p className="font-medium">
                      {d.date ? `${formatDate(d.date)} · ` : ""}
                      {d.title ?? t.directive}
                    </p>
                    <p>{d.content}</p>
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          {info.permitDate && (
            <Alert tone="success" title={t.permitted}>
              {formatDate(info.permitDate)}
              {info.permitTime ? ` ${info.permitTime}` : ""}
              {info.chiefName ? ` · ${info.chiefName}` : ""}
            </Alert>
          )}

          <Grid cols={{ base: 1, lg: 2 }} gap="lg">
            <section aria-labelledby={`${uid}-hq-reg`}>
              <h3 id={`${uid}-hq-reg`} className="text-sm font-semibold text-fg">{t.registration}</h3>
              <div className="divide-y divide-border">
                <KeyValue
                  label={t.declNo}
                  hint={info.branch ? fill(t.branch, { no: info.branch.no, of: info.branch.of }) : t.declNoHint}
                  value={info.declarationNo ? <span className="font-mono">{info.declarationNo}</span> : pending(t.notIssued)}
                />
                <KeyValue label={t.registeredAt} hint={t.registeredHint} value={registered ?? pending(t.afterOfficial)} />
                <KeyValue wrap label={t.inspection} value={inspection ?? pending(t.afterOfficial)} />
                <KeyValue wrap label={t.office} value={info.customsOfficeName ?? pending("—")} />
                {info.subsection && <KeyValue label={t.subsection} value={info.subsection} />}
                {info.representativeHs && <KeyValue label={t.representativeHs} value={<span className="font-mono">{info.representativeHs}</span>} />}
                {(info.pages !== undefined || info.lines !== undefined) && (
                  <KeyValue label={t.pagesLines} value={`${info.pages ?? "—"} / ${info.lines ?? "—"}`} />
                )}
              </div>
            </section>

            <section aria-labelledby={`${uid}-hq-tax`}>
              <h3 id={`${uid}-hq-tax`} className="text-sm font-semibold text-fg">{t.taxTitle}</h3>
              <div className="divide-y divide-border">
                {info.totalCustomsValue && (
                  <KeyValue
                    label={t.totalValue}
                    hint={info.totalCustomsValue.currency === "VND" ? <DiffHint customs={info.totalCustomsValue.amount} estimate={estimate?.customsValueVnd} /> : undefined}
                    value={formatMoney(info.totalCustomsValue.amount, info.totalCustomsValue.currency, info.totalCustomsValue.currency === "VND" ? 0 : 2)}
                  />
                )}
                {info.exchangeRates.map((r) => (
                  <KeyValue
                    key={r.currency}
                    label={fill(t.rate, { currency: r.currency })}
                    hint={r === rate && estimate?.exchangeRate ? fill(t.appRate, { rate: `${formatNumber(estimate.exchangeRate)} VND/${r.currency}` }) : undefined}
                    value={`${formatNumber(r.rate)} VND/${r.currency}`}
                  />
                ))}
                {info.taxes.map((t) => (
                  <KeyValue key={`${t.code ?? ""}${t.name}`} label={t.name} value={formatVnd(t.amountVnd)} />
                ))}
                <KeyValue
                  strong
                  label={t.totalTax}
                  hint={<DiffHint customs={info.totalTaxVnd} estimate={estimate?.taxVnd} />}
                  value={info.totalTaxVnd !== undefined ? formatVnd(info.totalTaxVnd) : pending(t.none)}
                />
                {info.guaranteeVnd !== undefined && info.guaranteeVnd !== "0" && <KeyValue label={t.guarantee} value={formatVnd(info.guaranteeVnd)} />}
              </div>
            </section>
          </Grid>

          {info.items.length > 0 && (
            <section aria-labelledby={`${uid}-hq-items`}>
              <h3 id={`${uid}-hq-items`} className="mb-2 text-sm font-semibold text-fg">{t.itemsTitle}</h3>
              <ItemsTable kind={kind} items={info.items} />
            </section>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
