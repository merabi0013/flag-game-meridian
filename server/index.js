require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');

const { configurePassport } = require('./passport-config');
const { buildAuthRouter } = require('./routes/auth');
const { buildStatsRouter } = require('./routes/stats');
const { buildAdminRouter } = require('./routes/admin');
const { buildCategoriesRouter } = require('./routes/categories');
const { buildPurchaseRouter } = require('./routes/purchase');
const { buildMultiplayerRouter } = require('./routes/multiplayer');
const { buildWebhookRouter } = require('./routes/webhooks');
const { requireAuth } = require('./middleware/requireAuth');
const { requireAdmin } = require('./middleware/requireAdmin');

const app = express();
const PORT = process.env.PORT || 8787;
const CLIENT_URL = process.env.CLIENT_URL || `http://localhost:${PORT}`;
const IS_PROD = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  console.warn(
    '[startup] SESSION_SECRET is not set in .env — using an insecure temporary value. ' +
      'Set a real one before deploying (see server/.env.example).'
  );
}

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

// Mounted BEFORE express.json(): Stripe webhook signature verification
// needs the raw, unparsed request body bytes. See routes/webhooks.js.
app.use(buildWebhookRouter());

app.use(express.json());

// NOTE on session storage: this uses express-session's default in-memory
// store, which is fine for local development and small single-instance
// deployments, but it resets on every restart and does not work across
// multiple server instances. For real production use, swap in a
// persistent store (e.g. connect-sqlite3 pointed at the same database, or
// Redis) - the rest of this file does not need to change.
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'insecure-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

const providerConfig = configurePassport();

app.use('/auth', buildAuthRouter(providerConfig));
app.use('/', buildStatsRouter());
app.use('/', buildCategoriesRouter());
app.use('/', buildPurchaseRouter());
app.use('/', buildMultiplayerRouter());

// Every route in buildAdminRouter() runs behind BOTH of these, in this
// order, on every single request — there is no admin route that skips
// either check. See middleware/requireAuth.js and requireAdmin.js.
app.use('/api/admin', requireAuth, requireAdmin, buildAdminRouter());

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    googleConfigured: providerConfig.hasGoogleCreds,
    discordConfigured: providerConfig.hasDiscordCreds,
    paymentsConfigured: require('./lib/stripeClient').hasStripeCreds,
  });
});

// Serve the built React frontend (npm run build in ../ → dist/) from this
// same process so the whole app is a single deployable unit. See README
// "Serving the frontend". In local development you'll usually run the
// Vite dev server separately instead (npm run dev), in which case this
// block simply finds nothing at ../dist and is a no-op.
const distRoot = path.join(__dirname, '..', 'dist');
const distIndexHtml = path.join(distRoot, 'index.html');
const hasBuiltFrontend = fs.existsSync(distIndexHtml);

if (hasBuiltFrontend) {
  app.use(express.static(distRoot));

  // React Router uses client-side routing (/, /game, /profile all resolve
  // to the same index.html), so any GET that isn't an API/auth route and
  // isn't a real static file falls back to index.html and lets the
  // client-side router take over.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next();
    res.sendFile(distIndexHtml);
  });
} else {
  console.log('[startup] No dist/ build found next to server/ — run `npm run build` in the project root to serve the frontend from here. API routes still work on their own.');
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Meridian server listening on http://localhost:${PORT}`);
  if (!providerConfig.hasGoogleCreds) console.log('  → Google sign-in disabled (no credentials configured)');
  if (!providerConfig.hasDiscordCreds) console.log('  → Discord sign-in disabled (no credentials configured)');
});
