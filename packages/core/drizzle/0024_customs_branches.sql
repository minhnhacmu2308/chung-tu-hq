DROP INDEX "customs_results_dossier_uq";--> statement-breakpoint
DROP INDEX "post_amendments_dossier_seq_uq";--> statement-breakpoint
DROP INDEX "customs_messages_org_dossier_idx";--> statement-breakpoint
DROP INDEX "customs_outbox_org_dossier_idx";--> statement-breakpoint
ALTER TABLE "customs_messages" ADD COLUMN "branch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_outbox" ADD COLUMN "branch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_results" ADD COLUMN "branch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "post_amendments" ADD COLUMN "branch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customs_results_dossier_branch_uq" ON "customs_results" USING btree ("dossier_id","branch");--> statement-breakpoint
CREATE UNIQUE INDEX "post_amendments_dossier_branch_seq_uq" ON "post_amendments" USING btree ("dossier_id","branch","seq");--> statement-breakpoint
CREATE INDEX "customs_messages_org_dossier_idx" ON "customs_messages" USING btree ("org_id","dossier_id","branch","at");--> statement-breakpoint
CREATE INDEX "customs_outbox_org_dossier_idx" ON "customs_outbox" USING btree ("org_id","dossier_id","branch");