/**
 * routes/auth.js
 * -----------------------------------------------------------------------
 * Browser flow (identical for every provider in auth/providers.js):
 *
 *   1. Frontend navigates to  GET <API>/auth/<provider>
 *      -> we create state + PKCE, remember them in a signed HttpOnly cookie
 *         scoped to /auth, and redirect to the provider.
 *   2. Provider redirects to  GET <API>/auth/<provider>/callback?code&state
 *      -> we verify state against the cookie, exchange the code (server
 *         side, with the client secret), fetch the profile, find-or-create
 *         the user, and mint a ONE-TIME login code (60 s, single use).
 *      -> we redirect to  <CLIENT_URL>/?auth_code=<code>
 *   3. Frontend calls  POST /api/auth/exchange {code}
 *      -> we return a long-lived opaque session token (stored hashed).
 *
 * The session token never appears in a URL, and the URL code is worthless
 * after one use. Explicit linking of a second provider to a signed-in
 * account goes through POST /api/auth/link/<provider>/start.
 *
 * Errors never reveal details: the browser is sent back with
 * ?auth_error=<short code> (see ERROR_CODES) and the reason is logged.
 * -----------------------------------------------------------------------
 */
const express = require('express');
const { newToken, hashToken, newPkce, signPayload, verifyPayload, parseCookies } = require('../auth/tokens');
const { OAuthError, buildAuthorizeUrl, exchangeCode, fetchProfile } = require('../auth/oauth');
const { AuthError } = require('../services/accounts');
const { requireAuth, rateLimit } = require('../middleware/auth');

const COOKIE = 'meridian_oauth';
const HANDSHAKE_TTL_MS = 10 * 60 * 1000;
const LOGIN_CODE_TTL_S = 60;
const LINK_CODE_TTL_S = 120;

/** Only same-app paths: "/profile" yes, "//evil.example", "https://…", "\\…" no. */
function safeReturnTo(value) {
  if (typeof value !== 'string' || value.length > 200) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n]/.test(value)) return null;
  return value;
}

function publicUser(user, identities) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    // isAdmin is for showing UI only; every /api/admin route re-checks the DB.
    isAdmin: !!user.isAdmin,
    provider: identities.length ? identities[0].provider : 'manual',
    providers: identities.map((i) => i.provider),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function buildAuthRouter({ config, repos, providers, accounts }) {
  const router = express.Router();
  const limiter = rateLimit({ windowMs: 60_000, max: config.authRateLimitPerMinute });

  const clientRedirect = (params) => {
    const url = new URL(`${config.clientUrl}/`);
    for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
    return url.toString();
  };

  const cookieAttrs = (maxAgeSeconds) =>
    ['Path=/auth', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, config.apiIsHttps ? 'Secure' : ''].filter(Boolean).join('; ');

  const setHandshake = (res, payload) =>
    res.append('Set-Cookie', `${COOKIE}=${signPayload({ ...payload, exp: Date.now() + HANDSHAKE_TTL_MS }, config.sessionSecret)}; ${cookieAttrs(HANDSHAKE_TTL_MS / 1000)}`);
  const clearHandshake = (res) => res.append('Set-Cookie', `${COOKIE}=; ${cookieAttrs(0)}`);

  const fail = (res, code, detail) => {
    if (detail) console.warn(`[auth] ${code}: ${detail}`);
    clearHandshake(res);
    return res.redirect(clientRedirect({ auth_error: code }));
  };

  async function newSession(userId, req) {
    const token = newToken();
    await repos.sessions.create({ userId, tokenHash: hashToken(token), ttlDays: config.sessionTtlDays, userAgent: req.headers['user-agent'] });
    return token;
  }

  // --- which providers exist (so the UI can hide unconfigured buttons) -----
  router.get('/api/auth/providers', (req, res) => {
    res.json({ providers: Object.values(providers).map((p) => ({ name: p.name, label: p.label, configured: p.configured })) });
  });

  // --- step 1: send the browser to the provider ------------------------------
  router.get('/auth/:provider', limiter, async (req, res) => {
    const provider = providers[req.params.provider];
    if (!provider) return res.status(404).json({ error: 'Unknown sign-in provider.' });
    if (!provider.configured) return fail(res, 'provider_not_configured');
    if (!config.sessionSecret) return fail(res, 'server_misconfigured', 'SESSION_SECRET is not set');

    try {
      // Linking: a signed-in user asked for this via /api/auth/link/:p/start
      // and holds a single-use link code that names them.
      let linkUserId = null;
      if (typeof req.query.link_code === 'string') {
        linkUserId = await repos.sessions.consumeCode(hashToken(req.query.link_code), 'link');
        if (!linkUserId) return fail(res, 'link_expired');
      }

      const state = newToken();
      const { verifier, challenge } = newPkce();
      setHandshake(res, { state, verifier, provider: provider.name, linkUserId, returnTo: safeReturnTo(req.query.return_to) });
      res.redirect(buildAuthorizeUrl(provider, { state, challenge }));
    } catch (err) {
      fail(res, 'server_error', err.message);
    }
  });

  // --- step 2: the provider sends the browser back ---------------------------
  router.get('/auth/:provider/callback', limiter, async (req, res) => {
    const provider = providers[req.params.provider];
    if (!provider || !provider.configured) return fail(res, 'provider_not_configured');

    const handshake = verifyPayload(parseCookies(req.headers.cookie)[COOKIE], config.sessionSecret || '');
    // The state in the URL must be the one we issued to THIS browser for
    // THIS provider. Anything else (forged callback, replay, expired
    // handshake, cookie blocked) is rejected before we spend the code.
    const queryState = typeof req.query.state === 'string' ? req.query.state : '';
    if (!handshake || handshake.provider !== provider.name || !queryState || queryState !== handshake.state) {
      return fail(res, 'invalid_state', 'state missing or mismatched');
    }
    if (req.query.error) {
      return fail(res, req.query.error === 'access_denied' ? 'access_denied' : 'provider_error', `provider returned error=${req.query.error}`);
    }
    if (typeof req.query.code !== 'string' || !req.query.code) return fail(res, 'missing_code');

    try {
      const accessToken = await exchangeCode(provider, { code: req.query.code, verifier: handshake.verifier });
      const profile = await fetchProfile(provider, accessToken);
      const { user, linked } = await accounts.resolveLogin(provider.name, profile, { linkUserId: handshake.linkUserId });

      clearHandshake(res);
      if (linked || handshake.linkUserId) {
        // Already signed in on the frontend: nothing to exchange.
        return res.redirect(clientRedirect({ auth_linked: provider.name, return_to: handshake.returnTo }));
      }
      const code = newToken();
      await repos.sessions.createCode({ codeHash: hashToken(code), userId: user.id, purpose: 'login', ttlSeconds: LOGIN_CODE_TTL_S });
      res.redirect(clientRedirect({ auth_code: code, return_to: handshake.returnTo }));
    } catch (err) {
      if (err instanceof OAuthError) return fail(res, err.code, err.message);
      if (err instanceof AuthError) return fail(res, err.code);
      fail(res, 'server_error', err.stack || err.message);
    }
  });

  // --- step 3: trade the one-time code for a session token -------------------
  router.post('/api/auth/exchange', limiter, async (req, res, next) => {
    try {
      const code = req.body && req.body.code;
      if (typeof code !== 'string' || !code || code.length > 200) return res.status(400).json({ error: 'Missing code.' });
      const userId = await repos.sessions.consumeCode(hashToken(code), 'login');
      if (!userId) return res.status(401).json({ error: 'This sign-in link has expired or was already used. Please sign in again.' });
      const user = await repos.users.findById(userId);
      if (!user || user.status === 'disabled') return res.status(403).json({ error: 'This account is disabled.' });

      const token = await newSession(user.id, req);
      const identities = await repos.identities.listForUser(user.id);
      res.json({ token, user: publicUser(user, identities) });
    } catch (err) {
      next(err);
    }
  });

  // --- linking a second provider to the signed-in account ---------------------
  router.post('/api/auth/link/:provider/start', requireAuth, limiter, async (req, res, next) => {
    try {
      const provider = providers[req.params.provider];
      if (!provider) return res.status(404).json({ error: 'Unknown sign-in provider.' });
      if (!provider.configured) return res.status(503).json({ error: `${provider.label} sign-in is not configured on this server.` });

      const code = newToken();
      await repos.sessions.createCode({ codeHash: hashToken(code), userId: req.user.id, purpose: 'link', ttlSeconds: LINK_CODE_TTL_S });
      const returnTo = safeReturnTo(req.body && req.body.returnTo);
      const url = new URL(`${config.apiPublicUrl}/auth/${provider.name}`);
      url.searchParams.set('link_code', code);
      if (returnTo) url.searchParams.set('return_to', returnTo);
      res.json({ url: url.toString() });
    } catch (err) {
      next(err);
    }
  });

  // --- who am I / sign out ----------------------------------------------------
  router.get('/api/me', async (req, res, next) => {
    try {
      if (!req.user) return res.json({ user: null });
      res.json({ user: publicUser(req.user, await repos.identities.listForUser(req.user.id)) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/logout', async (req, res, next) => {
    try {
      if (req.sessionTokenHash) await repos.sessions.remove(req.sessionTokenHash);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildAuthRouter, safeReturnTo, publicUser };
