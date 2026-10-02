/**
 * app.js — builds the Express app from explicit dependencies (config, db,
 * repositories, providers). Nothing here reads process.env or opens a
 * database connection itself, which is what lets the tests build a real
 * app against an in-memory Postgres and a fake OAuth provider.
 *
 * Request flow:  CORS -> (Stripe webhook, raw body) -> JSON body ->
 *                authenticate (bearer token -> req.user) -> routers
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { createRepositories } = require('./repositories');
const { buildProviders } = require('./auth/providers');
const { authenticate, requireAuth, requireAdmin } = require('./middleware/auth');
const { makeAccounts } = require('./services/accounts');
const { makeAccess } = require('./lib/access');
const { makeUserStats } = require('./lib/userStats');
const { makeFulfillment } = require('./lib/fulfillment');
const { makeStripeClient } = require('./lib/stripeClient');
const { loadTree } = require('./lib/categoryCatalog');

const { buildAuthRouter } = require('./routes/auth');
const { buildStatsRouter } = require('./routes/stats');
const { buildCategoriesRouter } = require('./routes/categories');
const { buildPurchaseRouter } = require('./routes/purchase');
const { buildMultiplayerRouter } = require('./routes/multiplayer');
const { buildWebhookRouter } = require('./routes/webhooks');
const { buildAdminRouter } = require('./routes/admin');

function createApp({ config, db, repos = createRepositories(db), providers = buildProviders(config), tree = loadTree(), env = process.env, stripeClient = makeStripeClient(config), serveFrontend = true }) {
  const app = express();
  // Behind Render/Fly/etc. the client IP and protocol arrive via
  // X-Forwarded-*; without this every user would share one rate-limit bucket.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const access = makeAccess(repos);
  const userStats = makeUserStats(repos);
  const fulfillment = makeFulfillment({ db, repos });
  const accounts = makeAccounts({ db, repos, env });

  // CORS: exact-origin allowlist, no wildcard, no cookies (bearer auth).
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || config.allowedOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      allowedHeaders: ['Authorization', 'Content-Type'],
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    })
  );

  // Before express.json(): Stripe signature checks need the raw bytes.
  app.use(buildWebhookRouter({ stripeClient, fulfillment }));
  app.use(express.json({ limit: '1mb' }));
  app.use(authenticate({ repos, config }));

  app.use(buildAuthRouter({ config, repos, providers, accounts }));
  app.use(buildStatsRouter({ repos, userStats, access }));
  app.use(buildCategoriesRouter({ repos, access, tree }));
  app.use(buildPurchaseRouter({ config, repos, access, stripeClient, fulfillment, tree }));
  app.use(buildMultiplayerRouter({ repos, access }));
  // Every admin route sits behind BOTH checks; none skips either.
  app.use('/api/admin', requireAuth, requireAdmin, buildAdminRouter({ repos, userStats, tree }));

  app.get('/api/health', async (req, res) => {
    let database = false;
    try {
      await db.query('SELECT 1');
      database = true;
    } catch {
      // reported below
    }
    res.status(database ? 200 : 503).json({
      ok: database,
      database,
      googleConfigured: providers.google.configured,
      discordConfigured: providers.discord.configured,
      paymentsConfigured: stripeClient.hasStripeCreds,
    });
  });

  // Optional: serve the built React app from this same process (single
  // deployable). With the GitHub Pages setup this finds no dist/ and is a no-op.
  const distRoot = path.join(__dirname, '..', 'dist');
  const distIndexHtml = path.join(distRoot, 'index.html');
  if (serveFrontend && fs.existsSync(distIndexHtml)) {
    app.use(express.static(distRoot));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next();
      res.sendFile(distIndexHtml);
    });
  }

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    console.error('[error]', req.method, req.path, err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });

  return app;
}

module.exports = { createApp };
