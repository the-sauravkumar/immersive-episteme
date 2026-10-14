-- Runs once, on first initialisation of the data volume.
-- Creates the isolated database used by integration tests (TEST_DATABASE_URL).
-- Extensions are enabled by the Drizzle migrations, not here, so both databases
-- go through exactly the same migration path.
CREATE DATABASE episteme_test OWNER episteme;
