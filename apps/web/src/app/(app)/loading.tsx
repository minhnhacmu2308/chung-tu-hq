"use client";
// @kb/ui là thư viện component phía client (dùng hook) nên khung tải này phải là Client Component.
import { Grid, Skeleton, Stack } from "@kb/ui";

// Khung tải khi chuyển màn: giữ đúng dáng tiêu đề + hàng thẻ + khối nội dung để trang không nhảy.
export default function AppLoading() {
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </Stack>
      <Grid cols={{ base: 2, xl: 4 }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </Grid>
      <Skeleton className="h-80" />
    </Stack>
  );
}
