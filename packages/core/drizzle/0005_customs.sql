CREATE TABLE "customs_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"operation" text NOT NULL,
	"direction" text NOT NULL,
	"result" text NOT NULL,
	"summary" text NOT NULL,
	"payload_masked" jsonb NOT NULL,
	"external_ref" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customs_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customs_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"declaration_id" text NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customs_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customs_results" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"external_id" text,
	"declaration_no" text,
	"channel" text,
	"channel_note" text,
	"clearance_status" text DEFAULT 'WAITING' NOT NULL,
	"customs_tax_vnd" numeric(24, 6),
	"state" text DEFAULT 'APPROVED' NOT NULL,
	"poll_count" integer DEFAULT 0 NOT NULL,
	"raw" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customs_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "customs_messages_org_dossier_idx" ON "customs_messages" USING btree ("org_id","dossier_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "customs_outbox_key_uq" ON "customs_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "customs_outbox_org_dossier_idx" ON "customs_outbox" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customs_results_dossier_uq" ON "customs_results" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "customs_results_org_idx" ON "customs_results" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE POLICY "customs_messages_read" ON "customs_messages" AS PERMISSIVE FOR SELECT TO "kb_app" USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "customs_messages_insert" ON "customs_messages" AS PERMISSIVE FOR INSERT TO "kb_app" WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "customs_outbox_rls" ON "customs_outbox" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "customs_results_rls" ON "customs_results" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));