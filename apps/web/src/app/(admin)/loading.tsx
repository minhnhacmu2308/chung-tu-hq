"use client";
// @kb/ui là thư viện component phía client (dùng hook) nên khung tải này phải là Client Component.
import { PageLoading } from "@kb/ui";

export default function AdminLoading() {
  return <PageLoading variant="table" />;
}
