CREATE TABLE "email_campaign_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"org_name" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "email_campaign_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text,
	"subject" text NOT NULL,
	"preheader" text,
	"blocks" jsonb NOT NULL,
	"signature_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audience" jsonb NOT NULL,
	"audience_label" text NOT NULL,
	"status" text NOT NULL,
	"total" integer NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"sent_by" text NOT NULL,
	"sent_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "email_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"blocks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_signatures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"preheader" text,
	"blocks" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mail_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"secure" boolean NOT NULL,
	"username" text NOT NULL,
	"password_ciphertext" text,
	"key_version" integer DEFAULT 1 NOT NULL,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"reply_to" text,
	"updated_by" text NOT NULL,
	"last_test_ok" boolean,
	"last_test_detail" text,
	"last_test_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_campaign_recipients_campaign_idx" ON "email_campaign_recipients" USING btree ("campaign_id","status");