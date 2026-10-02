/**
 * config.js
 * -----------------------------------------------------------------------
 * Every environment variable the backend reads is parsed and validated
 * HERE, once, and handed to the rest of the app as a plain object. No other
 * file touches process.env. That makes "what does this server need to
 * run?" answerable by reading one file, and lets tests build a config from
 * an explicit object instead of mutating global state.
 *
 * Nothing in this file (or anywhere in server/) is ever sent to the
 * browser. The React app only ever sees what the API chooses to return.
 * -----------------------------------------------------------------------
 */

const PROVIDER_ENV = {
  google: { id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET', callback: 'GOOGLE_CALLBACK_URL' },
  discord: { id: 'DISCORD_CLIENT_ID', secret: 'DISCORD_CLIENT_SECRET', callback: 'DISCORD_CALLBACK_URL' },
};

function trimSlash(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const port = Number(env.PORT) || 8787;

  // Where the React app is served from, INCLUDING any GitHub Pages
  // subpath, no trailing slash. Used for post-login redirects.
  const clientUrl = trimSlash(env.CLIENT_URL) || 'http://localhost:5173';
  const clientOrigin = originOf(clientUrl);

  // Where THIS server is reachable from a browser. Used to derive the
  // OAuth callback URLs (<apiPublicUrl>/auth/<provider>/callback) unless a
  // *_CALLBACK_URL override is given.
  const apiPublicUrl = trimSlash(env.API_PUBLIC_URL) || `http://localhost:${port}`;

  // CORS: the exact origins allowed to call the API from a browser. The
  // frontend's own origin is always allowed; extras (e.g. the Vite dev
  // server) come from CORS_EXTRA_ORIGINS. There is no wildcard and no
  // credentialed-cookie mode: the API authenticates with a bearer token.
  const extra = String(env.CORS_EXTRA_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const devOrigins = isProd ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173', `http://localhost:${port}`];
  const allowedOrigins = [...new Set([clientOrigin, ...extra, ...devOrigins].filter(Boolean))];

  const providers = {};
  for (const [name, vars] of Object.entries(PROVIDER_ENV)) {
    const clientId = env[vars.id];
    const clientSecret = env[vars.secret];
    providers[name] = {
      configured: !!(clientId && clientSecret),
      clientId,
      clientSecret,
      callbackUrl: trimSlash(env[vars.callback]) || `${apiPublicUrl}/auth/${name}/callback`,
    };
  }

  return {
    nodeEnv,
    isProd,
    port,
    databaseUrl: env.DATABASE_URL || null,
    dbPoolMax: Number(env.DATABASE_POOL_MAX) || 5,
    // Signs the short-lived OAuth "state" cookie. Sessions themselves are
    // random opaque tokens stored (hashed) in the database, so this secret
    // only protects the ~10-minute login handshake.
    sessionSecret: env.SESSION_SECRET || null,
    sessionTtlDays: Number(env.SESSION_TTL_DAYS) || 30,
    // Per-IP requests per minute across the sign-in endpoints.
    authRateLimitPerMinute: Number(env.AUTH_RATE_LIMIT_PER_MINUTE) || 60,
    clientUrl,
    clientOrigin,
    apiPublicUrl,
    apiIsHttps: apiPublicUrl.startsWith('https://'),
    allowedOrigins,
    providers,
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY || null,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET || null,
    },
  };
}

/** Problems that make the server unsafe or useless to start. */
function validateConfig(config) {
  const problems = [];
  if (!config.databaseUrl) problems.push('DATABASE_URL is not set (see server/.env.example).');
  if (config.isProd) {
    if (!config.sessionSecret || config.sessionSecret.length < 32) {
      problems.push('SESSION_SECRET must be set to a random value of at least 32 characters in production.');
    }
    if (!config.clientOrigin) problems.push('CLIENT_URL must be a full URL such as https://<user>.github.io/<repo>.');
    if (!config.apiPublicUrl.startsWith('https://')) {
      problems.push('API_PUBLIC_URL must be an https:// URL in production.');
    }
  }
  return problems;
}

module.exports = { loadConfig, validateConfig, PROVIDER_ENV };
