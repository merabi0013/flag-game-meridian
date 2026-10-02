/** `npm run migrate` — apply pending database migrations and seed categories, then exit. */
require('dotenv').config();
const { loadConfig } = require('../config');
const { createDb } = require('../db/pool');
const { migrate } = require('../db/migrate');
const { createRepositories } = require('../repositories');
const { loadTree, seedCategories } = require('../lib/categoryCatalog');

(async () => {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL is not set');
  const db = createDb({ connectionString: config.databaseUrl, max: 2 });
  try {
    const applied = await migrate(db);
    await seedCategories(createRepositories(db), loadTree());
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database already up to date.');
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
