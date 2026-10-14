CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"tax_code" text NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"plan_code" text NOT NULL,
	"suspect_threshold" text DEFAULT 'BALANCED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plans" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"dossiers_per_month" integer NOT NULL,
	"pages_per_dossier" integer NOT NULL,
	"price_vnd" numeric(24, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_uq" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_tax_code_uq" ON "organizations" USING btree ("tax_code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE POLICY "memberships_rls" ON "memberships" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true) OR (coalesce(current_setting('app.org_id', true), '') = '' AND user_id = current_setting('app.user_id', true))) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "organizations_read" ON "organizations" AS PERMISSIVE FOR SELECT TO "kb_app" USING (id = current_setting('app.org_id', true) OR id IN (select org_id from memberships where user_id = current_setting('app.user_id', true)) OR (coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = ''));--> statement-breakpoint
CREATE POLICY "organizations_insert" ON "organizations" AS PERMISSIVE FOR INSERT TO "kb_app" WITH CHECK (coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = '');--> statement-breakpoint
CREATE POLICY "organizations_update" ON "organizations" AS PERMISSIVE FOR UPDATE TO "kb_app" USING (id = current_setting('app.org_id', true)) WITH CHECK (id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "users_read" ON "users" AS PERMISSIVE FOR SELECT TO "kb_app" USING (id = current_setting('app.user_id', true) OR id IN (select user_id from memberships where org_id = current_setting('app.org_id', true)) OR (coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = ''));--> statement-breakpoint
CREATE POLICY "users_insert" ON "users" AS PERMISSIVE FOR INSERT TO "kb_app" WITH CHECK (coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = '');--> statement-breakpoint
CREATE POLICY "users_update" ON "users" AS PERMISSIVE FOR UPDATE TO "kb_app" USING (id = current_setting('app.user_id', true)) WITH CHECK (id = current_setting('app.user_id', true));