"use client";
// Thông tin Hải quan trả về cho tờ khai (người khai không nhập): đăng ký, phân loại kiểm tra, thuế & tỷ giá chính thức,
// trị giá tính thuế từng dòng, chỉ thị Hải quan, cấp phép thông quan. Dùng ở bước Khai báo Hải quan và tab "Hải quan trả về" của Review.
import {
  Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, Grid, Stack,
} from "@kb/ui";
import type { CustomsInfo, CustomsInfoItem } from "@kb/contracts";
import { Landmark } from "lucide-react";
import { formatDate, formatMoney, formatNumber, formatRelative, formatVnd } from "@/lib/format";
import { KeyValue } from "./declaration-parts";
import { inspectionLabel, vndDiff } from "./customs-info-view";

/** Số ứng dụng ước tính lúc dựng tờ khai – để người khai thấy chênh lệch với số Hải quan. */
export type CustomsEstimate = { taxVnd?: string | undefined; customsValueVnd?: string | undefined; exchangeRate?: string | undefined };

const pending = (text: string) => <span className="text-fg-subtle">{text}</span>;

function DiffHint({ customs, estimate }: { customs: string | undefined; estimate: string | undefined }) {
  const d = vndDiff(customs, estimate);
  if (!d || estimate === undefined) return null;
  return (
    <span>
      Ứng dụng ước tính {formatVnd(estimate)}
      {d.same ? " – khớp" : ` – chênh ${d.diff.startsWith("-") ? "" : "+"}${formatVnd(d.diff)}`}
    </span>
  );
}

const col = createDataTableColumnHelper<CustomsInfoItem>();

function ItemsTable({ kind, items }: { kind: "IDA" | "EDA"; items: CustomsInfoItem[] }) {
  const columns = col.columns([
    col.accessor("lineNo", { header: "#", size: 48, meta: { align: "center" } }),
    col.accessor("hsCode", { header: "Mã HS", cell: (c) => <span className="font-mono">{c.getValue() ?? "—"}</span> }),
    col.accessor("customsValue", {
      header: "Trị giá tính thuế",
      meta: { align: "end" },
      cell: (c) => {
        const v = c.getValue();
        const cur = c.row.original.customsValueCurrency ?? "VND";
        return v ? formatMoney(v, cur, cur === "VND" ? 0 : 2) : "—";
      },
    }),
    col.accessor("taxRate", { header: kind === "IDA" ? "Thuế suất NK" : "Thuế suất XK", meta: { align: "end" }, cell: (c) => (c.getValue() !== undefined ? `${formatNumber(c.getValue()!, 0)}%` : "—") }),
    col.accessor("taxAmountVnd", { header: kind === "IDA" ? "Thuế NK" : "Thuế XK", meta: { align: "end" }, cell: (c) => (c.getValue() !== undefined ? formatVnd(c.getValue()!) : "—") }),
  ]);
  return <DataTable aria-label="Trị giá, thuế từng dòng hàng theo Hải quan" columns={columns} data={items} getRowId={(r) => String(r.lineNo)} />;
}

export function CustomsInfoPanel({ kind, info, estimate }: { kind: "IDA" | "EDA"; info: CustomsInfo; estimate?: CustomsEstimate | undefined }) {
  const inspection = inspectionLabel(info.inspectionCode);
  const registered = info.registeredDate ? `${formatDate(info.registeredDate)}${info.registeredTime ? ` ${info.registeredTime}` : ""}` : null;
  const rate = info.exchangeRates[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Landmark aria-hidden="true" className="h-5 w-5 text-primary" />
          Hải quan trả về
          <Badge tone="success" size="sm">Người khai không nhập</Badge>
        </CardTitle>
        <CardDescription>Thông tin do hệ thống VNACCS cấp và tính – cập nhật {formatRelative(info.receivedAt)}. Số liệu thuế ở đây là số chính thức, thay cho số ứng dụng ước tính.</CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="lg">
          {info.directives.length > 0 && (
            <Alert tone="warning" title={`Chỉ thị của Hải quan (${info.directives.length})${info.directiveKind === "A" ? " – hướng dẫn sửa đổi" : info.directiveKind === "B" ? " – thay đổi khai báo" : ""}`}>
              <ul className="mt-1 flex flex-col gap-2">
                {info.directives.map((d, i) => (
                  <li key={i}>
                    <p className="font-medium">
                      {d.date ? `${formatDate(d.date)} · ` : ""}
                      {d.title ?? "Chỉ thị"}
                    </p>
                    <p>{d.content}</p>
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          {info.permitDate && (
            <Alert tone="success" title="Hải quan đã cấp phép thông quan">
              {formatDate(info.permitDate)}
              {info.permitTime ? ` ${info.permitTime}` : ""}
              {info.chiefName ? ` · ${info.chiefName}` : ""}
            </Alert>
          )}

          <Grid cols={{ base: 1, lg: 2 }} gap="lg">
            <section aria-labelledby="hq-reg">
              <h3 id="hq-reg" className="text-sm font-semibold text-fg">Đăng ký tờ khai</h3>
              <div className="divide-y divide-border">
                <KeyValue
                  label="Số tờ khai"
                  hint={info.branch ? `Tờ khai nhánh ${info.branch.no}/${info.branch.of}` : "11 số đầu là số tờ khai, số thứ 12 là số lần khai bổ sung"}
                  value={info.declarationNo ? <span className="font-mono">{info.declarationNo}</span> : pending("Chưa cấp")}
                />
                <KeyValue label="Ngày giờ đăng ký" hint="Mốc áp tỷ giá và thuế suất" value={registered ?? pending("Có sau khi khai chính thức")} />
                <KeyValue wrap label="Phân loại kiểm tra" value={inspection ?? pending("Có sau khi khai chính thức")} />
                <KeyValue wrap label="Chi cục Hải quan" value={info.customsOfficeName ?? pending("—")} />
                {info.subsection && <KeyValue label="Đội thủ tục" value={info.subsection} />}
                {info.representativeHs && <KeyValue label="Mã số hàng hóa đại diện" value={<span className="font-mono">{info.representativeHs}</span>} />}
                {(info.pages !== undefined || info.lines !== undefined) && (
                  <KeyValue label="Số trang / số dòng hàng" value={`${info.pages ?? "—"} / ${info.lines ?? "—"}`} />
                )}
              </div>
            </section>

            <section aria-labelledby="hq-tax">
              <h3 id="hq-tax" className="text-sm font-semibold text-fg">Thuế & tỷ giá theo Hải quan</h3>
              <div className="divide-y divide-border">
                {info.totalCustomsValue && (
                  <KeyValue
                    label="Tổng trị giá tính thuế"
                    hint={info.totalCustomsValue.currency === "VND" ? <DiffHint customs={info.totalCustomsValue.amount} estimate={estimate?.customsValueVnd} /> : undefined}
                    value={formatMoney(info.totalCustomsValue.amount, info.totalCustomsValue.currency, info.totalCustomsValue.currency === "VND" ? 0 : 2)}
                  />
                )}
                {info.exchangeRates.map((r) => (
                  <KeyValue
                    key={r.currency}
                    label={`Tỷ giá tính thuế (${r.currency})`}
                    hint={r === rate && estimate?.exchangeRate ? `Ứng dụng dùng ${formatNumber(estimate.exchangeRate)} VND/${r.currency}` : undefined}
                    value={`${formatNumber(r.rate)} VND/${r.currency}`}
                  />
                ))}
                {info.taxes.map((t) => (
                  <KeyValue key={`${t.code ?? ""}${t.name}`} label={t.name} value={formatVnd(t.amountVnd)} />
                ))}
                <KeyValue
                  strong
                  label="Tổng thuế phải nộp"
                  hint={<DiffHint customs={info.totalTaxVnd} estimate={estimate?.taxVnd} />}
                  value={info.totalTaxVnd !== undefined ? formatVnd(info.totalTaxVnd) : pending("Chưa có")}
                />
                {info.guaranteeVnd !== undefined && info.guaranteeVnd !== "0" && <KeyValue label="Số tiền bảo lãnh" value={formatVnd(info.guaranteeVnd)} />}
              </div>
            </section>
          </Grid>

          {info.items.length > 0 && (
            <section aria-labelledby="hq-items">
              <h3 id="hq-items" className="mb-2 text-sm font-semibold text-fg">Trị giá và thuế từng dòng hàng (Hải quan tính)</h3>
              <ItemsTable kind={kind} items={info.items} />
            </section>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
