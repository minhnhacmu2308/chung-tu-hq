"use client";
// Tab 3 – Theo dõi & nghiệp vụ: nhật ký thông điệp Hải quan, nghiệp vụ bổ sung, tra cứu, số hóa chứng từ. Bản mẫu: nút chỉ báo "chưa kết nối".
import { Button, Card, CardContent, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, EmptyState, Field, Grid, Stack, Textarea, toast } from "@kb/ui";
import { FileStack, FileUp, Search } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { PrototypeFixture, Stage } from "./fixtures";

type Message = PrototypeFixture["messages"][number];
const col = createDataTableColumnHelper<Message>();
const columns = col.columns([
  col.accessor("code", { header: "Mã thông điệp", cell: (c) => <span className="font-mono">{c.getValue()}</span> }),
  col.accessor("name", { header: "Tên thông điệp", meta: { wrap: true } }),
  col.accessor("at", { header: "Thời gian", cell: (c) => formatDateTime(c.getValue()) }),
]);

const OPERATIONS = ["Đăng ký bổ sung file đính kèm (HYS)", "Khai sửa đổi bổ sung sau thông quan (AMA)", "Khai báo danh sách container", "Lấy danh sách container", "Chứng từ bổ sung", "Cập nhật trạng thái tờ khai hủy"];
const LOOKUPS = ["Tra cứu trạng thái tờ khai VNACCS", "Tra cứu nợ thuế", "Tra cứu nộp thuế", "In mã vạch qua KVGS", "Lấy phản hồi phân luồng thông quan"];
const notConnected = (name: string) => () => toast({ tone: "info", title: "Bản mẫu – chưa kết nối", description: name });

export function OperationsTab({ fixture, stage }: { fixture: PrototypeFixture; stage: Stage }) {
  const messages = stage === "nhap" ? [] : stage === "da-khai" ? fixture.messages.slice(0, 2) : fixture.messages;
  return (
    <Stack gap="lg">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Thông điệp Hải quan</CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length ? (
            <DataTable aria-label="Thông điệp Hải quan" columns={columns} data={messages} getRowId={(m) => m.code + m.at} />
          ) : (
            <EmptyState icon={<FileStack />} title="Chưa có thông điệp" description="Thông điệp gửi/nhận với Hải quan hiện ở đây sau khi khai báo." />
          )}
        </CardContent>
      </Card>
      <Grid cols={{ base: 1, lg: 2 }} gap="lg">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Nghiệp vụ bổ sung</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack gap="sm">
              {OPERATIONS.map((o) => (
                <Button key={o} variant="secondary" className="justify-start" leftIcon={<FileUp className="h-4 w-4" />} onClick={notConnected(o)}>
                  {o}
                </Button>
              ))}
              <Field label="Lý do hủy tờ khai">
                <Textarea rows={2} placeholder="Nhập khi cập nhật hủy tờ khai" />
              </Field>
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">Tra cứu tờ khai</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack gap="sm">
              {LOOKUPS.map((o) => (
                <Button key={o} variant="secondary" className="justify-start" leftIcon={<Search className="h-4 w-4" />} onClick={notConnected(o)}>
                  {o}
                </Button>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Grid>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Số hóa chứng từ</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={<FileStack />} title="Chưa có chứng từ số hóa" description="Chứng từ đính kèm gửi Hải quan (HYS) hiện ở đây." action={<Button variant="secondary" onClick={notConnected("Số hóa chứng từ")}>Thêm chứng từ</Button>} />
        </CardContent>
      </Card>
    </Stack>
  );
}
