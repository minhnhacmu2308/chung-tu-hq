"use client";
// Khối "AI đối chiếu chéo": luật lỗi/lưu ý lên đầu, luật khớp gọn lại (bấm để xem).
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn, Skeleton, Stack } from "@kb/ui";
import { CheckCircle2, ChevronDown, MinusCircle, Sparkles, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { DOC_KIND_LABELS, type CrossCheck, type RuleResult } from "@/mocks/types";

const ORDER: Record<RuleResult, number> = { FAIL: 0, WARN: 1, SKIPPED: 2, PASS: 3 };

const ICON: Record<RuleResult, { icon: typeof CheckCircle2; className: string; label: string }> = {
  PASS: { icon: CheckCircle2, className: "text-success-subtle-fg", label: "Khớp" },
  WARN: { icon: TriangleAlert, className: "text-warning-subtle-fg", label: "Lưu ý" },
  FAIL: { icon: XCircle, className: "text-danger-subtle-fg", label: "Lỗi" },
  SKIPPED: { icon: MinusCircle, className: "text-fg-subtle", label: "Chưa kiểm tra" },
};

function CheckRow({ c }: { c: CrossCheck }) {
  const { icon: Icon, className, label } = ICON[c.result];
  return (
    <li className={cn("flex gap-3 rounded-md px-3 py-2", c.result === "FAIL" && "bg-danger-subtle", c.result === "WARN" && "bg-warning-subtle")}>
      <Icon aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", className)} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-fg">
          <span className="sr-only">{label}: </span>
          {c.title}
          {c.result === "FAIL" && c.severity === "BLOCKER" && (
            <Badge tone="danger" variant="solid">
              Chặn truyền tờ khai
            </Badge>
          )}
        </p>
        <p className="mt-0.5 text-sm text-fg-muted">{c.detail}</p>
        <p className="mt-1 text-xs text-fg-subtle">
          {c.documentKinds.map((k) => DOC_KIND_LABELS[k]).join(" · ")} <span className="font-mono">· {c.ruleCode}</span>
        </p>
      </div>
    </li>
  );
}

export function CrossCheckPanel({ checks, loading }: { checks: CrossCheck[] | undefined; loading: boolean }) {
  const [showPass, setShowPass] = useState(false);
  if (loading || !checks) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Stack gap="sm">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </Stack>
        </CardContent>
      </Card>
    );
  }
  const sorted = [...checks].sort((a, b) => ORDER[a.result] - ORDER[b.result]);
  // Lỗi + lưu ý luôn hiện; luật đã khớp / chờ dữ liệu gọn lại để không chiếm màn hình.
  const issues = sorted.filter((c) => c.result === "FAIL" || c.result === "WARN");
  const passed = sorted.filter((c) => c.result === "PASS" || c.result === "SKIPPED");
  const count = (r: RuleResult) => checks.filter((c) => c.result === r).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" />
          AI đối chiếu chéo
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <span>{checks.length} luật đã chạy trên bộ chứng từ</span>
          <Badge tone="success">{count("PASS")} khớp</Badge>
          {count("WARN") > 0 && <Badge tone="warning">{count("WARN")} lưu ý</Badge>}
          {count("FAIL") > 0 && <Badge tone="danger">{count("FAIL")} lỗi</Badge>}
          {count("SKIPPED") > 0 && <Badge tone="neutral">{count("SKIPPED")} chờ dữ liệu</Badge>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {checks.length === 0 ? (
          <p className="text-sm text-fg-muted">Chưa đủ chứng từ để đối chiếu.</p>
        ) : (
          <Stack gap="sm">
            {issues.length > 0 && (
              <ul className="grid gap-1.5 xl:grid-cols-2" aria-label="Luật cần chú ý">
                {issues.map((c) => (
                  <CheckRow key={c.id} c={c} />
                ))}
              </ul>
            )}
            {passed.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  aria-expanded={showPass}
                  rightIcon={<ChevronDown className={cn("h-4 w-4 transition-transform", showPass && "rotate-180")} />}
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? "Ẩn" : "Xem"} {passed.length} luật khác (đã khớp / chờ dữ liệu)
                </Button>
                {showPass && (
                  <ul className="flex flex-col gap-1.5" aria-label="Luật đã khớp hoặc chờ dữ liệu">
                    {passed.map((c) => (
                      <CheckRow key={c.id} c={c} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
