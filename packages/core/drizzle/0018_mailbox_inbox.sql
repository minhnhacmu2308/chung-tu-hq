-- Hộp thư chứng từ: hộp thư Gmail/Outlook đã kết nối (token mã hóa), email lấy về và file đính kèm chờ xếp vào hồ sơ.
CREATE TABLE "inbox_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"message_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"kind_guess" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"dossier_id" text,
	"added_by" text,
	"added_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"provider" text NOT NULL,
	"mailbox" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"subject" text NOT NULL,
	"snippet" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mail_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"email" text NOT NULL,
	"ciphertext" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"connected_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inbox_attachments" ADD CONSTRAINT "inbox_attachments_message_id_inbox_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."inbox_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_attachments_org_message_idx" ON "inbox_attachments" USING btree ("org_id","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_messages_org_conn_msg_uq" ON "inbox_messages" USING btree ("org_id","connection_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "inbox_messages_org_received_idx" ON "inbox_messages" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_connections_org_provider_email_uq" ON "mail_connections" USING btree ("org_id","provider","email");--> statement-breakpoint
CREATE POLICY "inbox_attachments_rls" ON "inbox_attachments" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "inbox_messages_rls" ON "inbox_messages" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "mail_connections_rls" ON "mail_connections" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));