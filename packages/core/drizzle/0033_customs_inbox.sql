CREATE TABLE "customs_inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dedup_key" text NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"declaration_no" text NOT NULL,
	"message" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "customs_inbox_status_chk" CHECK (status in ('PENDING', 'APPLIED', 'UNMATCHED'))
);
--> statement-breakpoint
ALTER TABLE "customs_inbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "customs_inbox_org_key_uq" ON "customs_inbox" USING btree ("org_id","dedup_key");--> statement-breakpoint
CREATE INDEX "customs_inbox_org_status_idx" ON "customs_inbox" USING btree ("org_id","status","received_at");--> statement-breakpoint
CREATE POLICY "customs_inbox_rls" ON "customs_inbox" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));