CREATE TABLE "value_charges" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "value_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "value_charges" ADD CONSTRAINT "value_charges_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "value_charges_org_dossier_uq" ON "value_charges" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE POLICY "value_charges_rls" ON "value_charges" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));