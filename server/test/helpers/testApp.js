/**
 * Boots the REAL app (routes, middleware, repositories, migrations) against
 * a test Postgres and a fake OAuth provider, and returns a small HTTP
 * client. Redirects are never followed, so tests can inspect every hop.
 */
const http = require('http');
const { createTestDb } = require('./testDb');
const { startFakeProvider } = require('./fakeProvider');
const { loadConfig } = require('../../config');
const { buildProviders } = require('../../auth/providers');
const { createRepositories } = require('../../repositories');
const { loadTree, seedCategories } = require('../../lib/categoryCatalog');
const { createApp } = require('../../app');

const CLIENT_URL = 'https://tester.github.io/flag-game-meridian';

async function createTestApp({ tree, stripeClient, envOverrides = {} } = {}) {
  const db = await createTestDb();
  const repos = createRepositories(db);
  const theTree = tree || loadTree();
  await seedCategories(repos, theTree);
  const fake = await startFakeProvider();

  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const env = {
    DATABASE_URL: 'postgres://unused',
    SESSION_SECRET: 'x'.repeat(48),
    CLIENT_URL,
    API_PUBLIC_URL: base,
    GOOGLE_CLIENT_ID: 'google-id',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    DISCORD_CLIENT_ID: 'discord-id',
    DISCORD_CLIENT_SECRET: 'discord-secret',
    ADMIN_EMAILS: 'boss@example.com',
    AUTH_RATE_LIMIT_PER_MINUTE: '100000',
    ...envOverrides,
  };
  const config = loadConfig(env);
  const providers = buildProviders(config, { google: fake.overrides, discord: fake.overrides });
  const app = createApp({ config, db, repos, providers, tree: theTree, env, stripeClient, serveFrontend: false });
  server.on('request', app);

  async function request(method, path, { body, token, headers = {}, cookie } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // redirects / plain text
    }
    return { status: res.status, headers: res.headers, json, text, location: res.headers.get('location') };
  }

  const client = {
    base,
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body: body === undefined ? {} : body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
  };

  const profiles = {
    google: (id, extra = {}) => ({ sub: id, email: `${id}@example.com`, email_verified: true, name: `Google ${id}`, ...extra }),
    discord: (id, extra = {}) => ({ id, email: `${id}@example.com`, verified: true, username: `disc_${id}`, ...extra }),
  };

  /** Runs the whole browser flow for one provider and returns every hop. */
  async function signIn(provider, profile, { linkCode, returnTo } = {}) {
    const qs = new URLSearchParams();
    if (linkCode) qs.set('link_code', linkCode);
    if (returnTo) qs.set('return_to', returnTo);
    const query = qs.toString();
    const start = await client.get(`/auth/${provider}${query ? `?${query}` : ''}`);
    if (start.status !== 302 || !start.location.startsWith(fake.overrides.authorizeUrl)) {
      return { start, dest: start.location ? new URL(start.location) : null, error: start.location ? new URL(start.location).searchParams.get('auth_error') : null };
    }
    const authorize = new URL(start.location);
    const cookie = (start.headers.get('set-cookie') || '').split(';')[0];
    const code = fake.issueCode(profile, authorize.searchParams.get('code_challenge'));
    const callback = await client.get(`/auth/${provider}/callback?code=${code}&state=${authorize.searchParams.get('state')}`, { cookie });
    const dest = callback.location ? new URL(callback.location) : null;
    return {
      start,
      authorize,
      cookie,
      callback,
      dest,
      authCode: dest && dest.searchParams.get('auth_code'),
      error: dest && dest.searchParams.get('auth_error'),
      linked: dest && dest.searchParams.get('auth_linked'),
    };
  }

  /** Sign in and exchange, returning { token, user }. */
  async function login(provider, profile) {
    const out = await signIn(provider, profile);
    if (!out.authCode) throw new Error(`login failed: ${out.error || (out.callback && out.callback.status)}`);
    const ex = await client.post('/api/auth/exchange', { code: out.authCode });
    return { token: ex.json.token, user: ex.json.user };
  }

  const makeAdmin = () => login('google', profiles.google('admin-1', { email: 'boss@example.com' }));

  return {
    db,
    repos,
    config,
    tree: theTree,
    fake,
    client,
    profiles,
    signIn,
    login,
    makeAdmin,
    CLIENT_URL,
    async close() {
      await new Promise((r) => server.close(r));
      await fake.close();
      await db.end();
    },
  };
}

module.exports = { createTestApp, CLIENT_URL };
