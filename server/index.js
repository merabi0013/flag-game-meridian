/**
 * Meridian API server — process entry point.
 *
 *   validate config -> connect to Postgres -> run migrations ->
 *   seed category configuration -> listen
 *
 * Everything else lives in app.js (routes) and the modules it wires up.
 */
require('dotenv').config();
const { loadConfig, validateConfig } = require('./config');
const { createDb } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { createRepositories } = require('./repositories');
const { loadTree, seedCategories } = require('./lib/categoryCatalog');
const { createApp } = require('./app');

async function main() {
  const config = loadConfig();
  const problems = validateConfig(config);
  if (problems.length) {
    console.error('[startup] Cannot start:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  if (!config.sessionSecret) {
    console.warn('[startup] SESSION_SECRET is not set: sign-in is disabled until it is (see server/.env.example).');
  }

  const db = createDb({ connectionString: config.databaseUrl, max: config.dbPoolMax });
  const repos = createRepositories(db);

  // Neon may be waking from idle; the first query can take a few seconds.
  await migrate(db);
  const tree = loadTree();
  await seedCategories(repos, tree);

  const app = createApp({ config, db, repos, tree });
  const server = app.listen(config.port, () => {
    console.log(`Meridian API listening on port ${config.port}`);
    console.log(`  frontend origin : ${config.clientOrigin}`);
    console.log(`  public API URL  : ${config.apiPublicUrl}`);
    for (const [name, p] of Object.entries(config.providers)) {
      console.log(`  ${name.padEnd(7)} sign-in : ${p.configured ? `enabled (callback ${p.callbackUrl})` : 'disabled (no credentials)'}`);
    }
    console.log(`  payments        : ${config.stripe.secretKey ? 'enabled' : 'disabled'}`);
  });

  // Housekeeping: expired sessions and one-time codes.
  const purge = setInterval(() => repos.sessions.purgeExpired().catch((e) => console.error('[purge]', e.message)), 6 * 60 * 60 * 1000);
  purge.unref();

  const shutdown = () => {
    clearInterval(purge);
    server.close(() => db.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[startup] fatal:', err.message);
  process.exit(1);
});
