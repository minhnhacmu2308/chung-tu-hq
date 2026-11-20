DROP INDEX "customs_identifiers_dossier_attempt_uq";--> statement-breakpoint
DROP INDEX "customs_identifiers_sending_uq";--> statement-breakpoint
ALTER TABLE "customs_identifiers" ALTER COLUMN "dossier_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_identifiers" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "customs_identifiers" ADD COLUMN "batch_index" integer;--> statement-breakpoint
ALTER TABLE "customs_identifiers" ADD COLUMN "used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customs_identifiers" ADD COLUMN "used_by_dossier_id" text;--> statement-breakpoint
ALTER TABLE "customs_identifiers" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customs_identifiers" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "customs_identifiers" ADD CONSTRAINT "customs_identifiers_used_by_dossier_id_dossiers_id_fk" FOREIGN KEY ("used_by_dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customs_identifiers_batch_uq" ON "customs_identifiers" USING btree ("org_id","batch_id","batch_index") WHERE "customs_identifiers"."batch_id" is not null;--> statement-breakpoint
CREATE INDEX "customs_identifiers_org_sent_idx" ON "customs_identifiers" USING btree ("org_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customs_identifiers_dossier_attempt_uq" ON "customs_identifiers" USING btree ("dossier_id","attempt") WHERE "customs_identifiers"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "customs_identifiers_sending_uq" ON "customs_identifiers" USING btree ("dossier_id") WHERE "customs_identifiers"."status" = 'SENDING' and "customs_identifiers"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "customs_identifiers" ADD CONSTRAINT "customs_identifiers_batch_chk" CHECK ((batch_id is null) = (batch_index is null));