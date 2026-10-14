CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"tasks" jsonb NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_hs" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"mfn" numeric(24, 6) NOT NULL,
	"pref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"vat" numeric(24, 6) NOT NULL,
	"policy" text,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_hs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "declarations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"fields" jsonb NOT NULL,
	"exchange_rate" numeric(24, 6) NOT NULL,
	"exchange_rate_date" date NOT NULL,
	"customs_value_vnd" numeric(24, 6) NOT NULL,
	"value_adjustments" jsonb NOT NULL,
	"est_import_duty_vnd" numeric(24, 6) NOT NULL,
	"est_vat_vnd" numeric(24, 6) NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "declarations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"date" date NOT NULL,
	"rate" numeric(24, 6) NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hs_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"line_item_id" text NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"confidence" real NOT NULL,
	"rates" jsonb,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hs_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(24, 6) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(24, 6) NOT NULL,
	"amount" numeric(24, 6) NOT NULL,
	"origin" text DEFAULT '' NOT NULL,
	"invoice_hs_code" text,
	"hs_suggested" text,
	"hs_confidence" real,
	"hs_confirmed" text,
	"hs_confirmed_by" text,
	"hs_confirmed_at" timestamp with time zone,
	"import_duty_rate" numeric(24, 6),
	"vat_rate" numeric(24, 6),
	"policy_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hs_suggestions" ADD CONSTRAINT "hs_suggestions_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_org_dossier_idx" ON "agent_runs" USING btree ("org_id","dossier_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "declarations_dossier_version_uq" ON "declarations" USING btree ("dossier_id","version");--> statement-breakpoint
CREATE INDEX "declarations_org_dossier_idx" ON "declarations" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_currency_date_uq" ON "exchange_rates" USING btree ("currency","date");--> statement-breakpoint
CREATE INDEX "hs_suggestions_item_idx" ON "hs_suggestions" USING btree ("line_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "line_items_dossier_line_uq" ON "line_items" USING btree ("dossier_id","line_no");--> statement-breakpoint
CREATE INDEX "line_items_org_dossier_idx" ON "line_items" USING btree ("org_id","dossier_id");--> statement-breakpoint
CREATE POLICY "agent_runs_rls" ON "agent_runs" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "catalog_hs_read" ON "catalog_hs" AS PERMISSIVE FOR SELECT TO "kb_app" USING (true);--> statement-breakpoint
CREATE POLICY "declarations_rls" ON "declarations" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "exchange_rates_read" ON "exchange_rates" AS PERMISSIVE FOR SELECT TO "kb_app" USING (true);--> statement-breakpoint
CREATE POLICY "hs_suggestions_rls" ON "hs_suggestions" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "line_items_rls" ON "line_items" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));