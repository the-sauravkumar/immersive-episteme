ALTER TABLE "assets" ADD COLUMN "licence_term_months" smallint;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "first_published_on" date;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_licence_term_ck" CHECK ("assets"."licence_term_months" IS NULL OR "assets"."licence_term_months" > 0);