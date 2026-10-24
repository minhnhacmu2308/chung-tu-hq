-- Gói dịch vụ chỉ đọc với role ứng dụng (kb_app): giá và hạn mức chỉ sửa qua khu Quản trị (kb_platform) hoặc seed. Thêm index cho các truy vấn thường gặp.
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "auth_tokens_user_idx" ON "auth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "join_requests_user_idx" ON "join_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("org_id","user_id") WHERE read_at is null;--> statement-breakpoint
CREATE INDEX "line_items_hs_job_idx" ON "line_items" USING btree ("org_id","hs_job_id");--> statement-breakpoint
CREATE INDEX "line_items_hs_item_idx" ON "line_items" USING btree ("org_id","hs_item_id");--> statement-breakpoint
CREATE INDEX "admin_audit_target_idx" ON "admin_audit" USING btree ("target_type","target_id","at");--> statement-breakpoint
CREATE INDEX "inbox_attachments_org_dossier_idx" ON "inbox_attachments" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE POLICY "plans_read" ON "plans" AS PERMISSIVE FOR SELECT TO "kb_app" USING (true);