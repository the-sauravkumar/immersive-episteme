-- Foundation migration: database extensions used across the platform.
--   pg_trgm  : fuzzy/trigram search over concept labels, local terms and CMS text
--   vector   : pgvector embeddings for semantic retrieval (knowledge graph, media)
--   pgcrypto : gen_random_uuid() and digest() for ids and content hashes
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
