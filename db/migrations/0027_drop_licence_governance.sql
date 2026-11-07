ALTER TABLE "assets" DROP CONSTRAINT "assets_max_pixels_ck";--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_licence_term_ck";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "max_pixels";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "licence_expires_on";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "licence_term_months";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "first_published_on";