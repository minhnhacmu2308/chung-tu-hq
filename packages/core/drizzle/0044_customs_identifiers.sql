CREATE TABLE "customs_identifiers" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" text DEFAULT 'SENDING' NOT NULL,
	"request" jsonb NOT NULL,
	"ref_id" text,
	"receipt_no" text,
	"receipt_date" date,
	"customs_state" text,
	"identifier_no" text,
	"identified_on" date,
	"qr_png" text,
	"result_text" text,
	"errors" jsonb,
	"send_attempts" integer DEFAULT 0 NOT NULL,
	"sent_by" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_identifiers_status_chk" CHECK (status in ('SENDING', 'ACCEPTED', 'REJECTED', 'NO_RESPONSE'))
);
--> statement-breakpoint
ALTER TABLE "customs_identifiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customs_identifiers" ADD CONSTRAINT "customs_identifiers_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customs_identifiers_dossier_attempt_uq" ON "customs_identifiers" USING btree ("dossier_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "customs_identifiers_sending_uq" ON "customs_identifiers" USING btree ("dossier_id") WHERE "customs_identifiers"."status" = 'SENDING';--> statement-breakpoint
CREATE INDEX "customs_identifiers_org_dossier_idx" ON "customs_identifiers" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE POLICY "customs_identifiers_rls" ON "customs_identifiers" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));