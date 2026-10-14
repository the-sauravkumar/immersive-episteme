// Vitest setup for the node project. Loads .env (if present) so integration tests can reach
// TEST_DATABASE_URL; CI provides the variables directly. `server-only` is stubbed via the
// alias in vitest.config.ts so server modules can be unit-tested.
import "dotenv/config";
