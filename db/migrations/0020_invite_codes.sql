CREATE TABLE "invite_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"label" text NOT NULL,
	"code_hash" text NOT NULL,
	"code_hint" text NOT NULL,
	"study_id" uuid,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"last_used_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_codes_codeHash_unique" UNIQUE("code_hash"),
	CONSTRAINT "invite_codes_hash_ck" CHECK ("invite_codes"."code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "invite_codes_hint_ck" CHECK ("invite_codes"."code_hint" ~ '^[0-9A-Z]{4}$'),
	CONSTRAINT "invite_codes_label_ck" CHECK (btrim("invite_codes"."label") <> '' AND char_length("invite_codes"."label") <= 120),
	CONSTRAINT "invite_codes_max_uses_ck" CHECK ("invite_codes"."max_uses" IS NULL OR "invite_codes"."max_uses" > 0),
	CONSTRAINT "invite_codes_use_count_ck" CHECK ("invite_codes"."use_count" >= 0 AND ("invite_codes"."max_uses" IS NULL OR "invite_codes"."use_count" <= "invite_codes"."max_uses"))
);
--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invite_codes_created_idx" ON "invite_codes" USING btree ("created_at");