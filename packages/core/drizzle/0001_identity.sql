CREATE TABLE "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "digital_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"subject" text NOT NULL,
	"issuer" text NOT NULL,
	"serial" text NOT NULL,
	"valid_to" date NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "digital_certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "join_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"ciphertext" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_secrets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "integration_status" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'NOT_CONFIGURED' NOT NULL,
	"detail" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_certificates" ADD CONSTRAINT "digital_certificates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_secrets" ADD CONSTRAINT "org_secrets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_status" ADD CONSTRAINT "integration_status_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_hash_uq" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "digital_certificates_org_idx" ON "digital_certificates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "join_requests_org_idx" ON "join_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notifications_org_user_idx" ON "notifications" USING btree ("org_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_secrets_org_kind_uq" ON "org_secrets" USING btree ("org_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_status_org_kind_uq" ON "integration_status" USING btree ("org_id","kind");--> statement-breakpoint
CREATE INDEX "integration_status_org_idx" ON "integration_status" USING btree ("org_id");--> statement-breakpoint
CREATE POLICY "auth_tokens_rw" ON "auth_tokens" AS PERMISSIVE FOR ALL TO "kb_app" USING ((coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = '') OR user_id = current_setting('app.user_id', true)) WITH CHECK ((coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = '') OR user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "digital_certificates_rls" ON "digital_certificates" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "join_requests_read" ON "join_requests" AS PERMISSIVE FOR SELECT TO "kb_app" USING (org_id = current_setting('app.org_id', true) OR user_id = current_setting('app.user_id', true) OR (coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = ''));--> statement-breakpoint
CREATE POLICY "join_requests_insert" ON "join_requests" AS PERMISSIVE FOR INSERT TO "kb_app" WITH CHECK ((coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = '') OR user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "join_requests_update" ON "join_requests" AS PERMISSIVE FOR UPDATE TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "notifications_rls" ON "notifications" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true) AND user_id = current_setting('app.user_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "org_secrets_rls" ON "org_secrets" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "sessions_rw" ON "sessions" AS PERMISSIVE FOR ALL TO "kb_app" USING ((coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = '') OR user_id = current_setting('app.user_id', true)) WITH CHECK ((coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = '') OR user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "integration_status_rls" ON "integration_status" AS PERMISSIVE FOR ALL TO "kb_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
ALTER POLICY "users_read" ON "users" TO kb_app USING (id = current_setting('app.user_id', true) OR id IN (select user_id from memberships where org_id = current_setting('app.org_id', true)) OR id IN (select user_id from join_requests where org_id = current_setting('app.org_id', true) and status = 'PENDING') OR (coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = ''));