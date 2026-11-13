CREATE TABLE "container_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"branch" integer DEFAULT 1 NOT NULL,
	"attempt" integer NOT NULL,
	"rows" jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"ref_id" text,
	"receipt_no" text,
	"receipt_date" date,
	"errors" jsonb,
	"sent_rows" jsonb,
	"sent_by" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "container_lists_status_chk" CHECK (status in ('DRAFT', 'SENDING', 'ACCEPTED', 'REJECTED', 'NO_RESPONSE'))
);
--> statement-breakpoint
ALTER TABLE "container_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kvgs_sheets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"branch" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'SENDING' NOT NULL,
	"ref_id" text,
	"receipt_no" text,
	"receipt_date" date,
	"errors" jsonb,
	"sheet" jsonb,
	"raw" jsonb,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kvgs_sheets_status_chk" CHECK (status in ('DRAFT', 'SENDING', 'ACCEPTED', 'REJECTED', 'NO_RESPONSE'))
);
--> statement-breakpoint
ALTER TABLE "kvgs_sheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "container_lists" ADD CONSTRAINT "container_lists_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kvgs_sheets" ADD CONSTRAINT "kvgs_sheets_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "container_lists_dossier_branch_attempt_uq" ON "container_lists" USING btree ("dossier_id","branch","attempt");--> statement-breakpoint
CREATE INDEX "container_lists_org_dossier_idx" ON "container_lists" USING btree ("org_id","dossier_id","branch");--> statement-breakpoint
CREATE INDEX "kvgs_sheets_org_dossier_idx" ON "kvgs_sheets" USING btree ("org_id","dossier_id","branch");--> statement-breakpoint
CREATE UNIQUE INDEX "kvgs_sheets_sending_uq" ON "kvgs_sheets" USING btree ("dossier_id","branch") WHERE "kvgs_sheets"."status" = 'SENDING';--> statement-breakpoint
CREATE POLICY "container_lists_rls" ON "container_lists" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "kvgs_sheets_rls" ON "kvgs_sheets" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));