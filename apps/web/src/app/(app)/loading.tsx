"use client";
// @kb/ui là thư viện component phía client (dùng hook) nên khung tải này phải là Client Component.
import { PageLoading } from "@kb/ui";

// Khung tải khi chuyển màn: giữ đúng dáng tiêu đề + hàng thẻ + khối nội dung để trang không nhảy.
export default function AppLoading() {
  return <PageLoading />;
}
