ALTER TABLE "sessions" ADD COLUMN "mfa_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_staff" ADD COLUMN "totp_ciphertext" text;--> statement-breakpoint
ALTER TABLE "platform_staff" ADD COLUMN "totp_pending_ciphertext" text;--> statement-breakpoint
ALTER TABLE "platform_staff" ADD COLUMN "totp_key_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_staff" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_staff" ADD COLUMN "totp_last_counter" bigint;--> statement-breakpoint
ALTER TABLE "platform_staff" ADD COLUMN "recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;