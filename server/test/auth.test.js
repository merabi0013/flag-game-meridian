import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestApp, CLIENT_URL } = require('./helpers/testApp');
const { hashToken, signPayload } = require('../auth/tokens');
const { safeReturnTo } = require('../routes/auth');

let t;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('starting a sign-in', () => {
  it('redirects to the provider with state, PKCE S256 and the configured callback', async () => {
    const res = await t.client.get('/auth/google');
    expect(res.status).toBe(302);
    const url = new URL(res.location);
    expect(url.searchParams.get('client_id')).toBe('google-id');
    expect(url.searchParams.get('redirect_uri')).toBe(`${t.config.apiPublicUrl}/auth/google/callback`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state').length).toBeGreaterThan(20);
    // the client secret never travels through the browser
    expect(res.location).not.toContain('google-secret');
  });

  it('sets a short-lived, HttpOnly, SameSite=Lax handshake cookie scoped to /auth', async () => {
    const res = await t.client.get('/auth/discord');
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toMatch(/^meridian_oauth=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/Max-Age=600/);
  });

  it('404s an unknown provider', async () => {
    expect((await t.client.get('/auth/myspace')).status).toBe(404);
  });

  it('reports which providers are configured', async () => {
    const res = await t.client.get('/api/auth/providers');
    expect(res.json.providers.map((p) => [p.name, p.configured])).toEqual([
      ['google', true],
      ['discord', true],
    ]);
  });
});

describe('unconfigured provider', () => {
  it('sends the browser back with provider_not_configured', async () => {
    const t2 = await createTestApp({ envOverrides: { DISCORD_CLIENT_ID: '', DISCORD_CLIENT_SECRET: '' } });
    try {
      const res = await t2.client.get('/auth/discord');
      expect(new URL(res.location).searchParams.get('auth_error')).toBe('provider_not_configured');
    } finally {
      await t2.close();
    }
  });
});

describe('first login creates an account, later logins reuse it', () => {
  it('creates a user + identity on first Google login and redirects with a one-time code', async () => {
    const out = await t.signIn('google', t.profiles.google('g-first'));
    expect(out.callback.status).toBe(302);
    expect(out.dest.origin + out.dest.pathname).toBe(`${new URL(CLIENT_URL).origin}${new URL(CLIENT_URL).pathname}/`);
    expect(out.authCode).toBeTruthy();
    expect(out.error).toBeNull();

    const ex = await t.client.post('/api/auth/exchange', { code: out.authCode });
    expect(ex.status).toBe(200);
    expect(ex.json.token).toBeTruthy();
    expect(ex.json.user).toMatchObject({ name: 'Google g-first', email: 'g-first@example.com', provider: 'google', isAdmin: false });

    const identity = await t.repos.identities.find('google', 'g-first');
    expect(identity.userId).toBe(ex.json.user.id);
    const user = await t.repos.users.findById(ex.json.user.id);
    expect(user.status).toBe('active');
    expect(user.createdAt).toBeTruthy();
    expect(user.lastLoginAt).toBeTruthy();
  });

  it('logs the SAME user in again on a second login, updating last login', async () => {
    const a = await t.login('google', t.profiles.google('g-repeat'));
    const before = (await t.repos.users.findById(a.user.id)).lastLoginAt;
    await new Promise((r) => setTimeout(r, 15));
    const b = await t.login('google', t.profiles.google('g-repeat', { name: 'Renamed' }));
    expect(b.user.id).toBe(a.user.id);
    const after = (await t.repos.users.findById(a.user.id)).lastLoginAt;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
    const { total } = await t.repos.users.list({ search: 'g-repeat', page: 1, pageSize: 10 });
    expect(total).toBe(1);
  });

  it('supports Discord the same way through the same code path', async () => {
    const a = await t.login('discord', t.profiles.discord('d-1'));
    expect(a.user.provider).toBe('discord');
    expect(a.user.name).toBe('disc_d-1');
    const b = await t.login('discord', t.profiles.discord('d-1'));
    expect(b.user.id).toBe(a.user.id);
  });

  it('keeps the requested return_to (same-app paths only)', async () => {
    const ok = await t.signIn('google', t.profiles.google('g-rt'), { returnTo: '/profile' });
    expect(ok.dest.searchParams.get('return_to')).toBe('/profile');
    const evil = await t.signIn('google', t.profiles.google('g-rt'), { returnTo: '//evil.example/x' });
    expect(evil.dest.searchParams.get('return_to')).toBeNull();
    expect(safeReturnTo('https://evil.example')).toBeNull();
    expect(safeReturnTo('/a\\b')).toBeNull();
    expect(safeReturnTo('/game?count=10')).toBe('/game?count=10');
  });
});

describe('identities are never merged automatically', () => {
  it('gives a Discord account with the SAME email a separate user', async () => {
    const g = await t.login('google', t.profiles.google('same-1', { email: 'shared@example.com' }));
    const d = await t.login('discord', t.profiles.discord('same-2', { email: 'shared@example.com' }));
    expect(d.user.id).not.toBe(g.user.id);
  });

  it('links a second provider only through the explicit, authenticated linking flow', async () => {
    const g = await t.login('google', t.profiles.google('link-g'));
    const start = await t.client.post('/api/auth/link/discord/start', {}, { token: g.token });
    expect(start.status).toBe(200);
    const linkCode = new URL(start.json.url).searchParams.get('link_code');
    expect(start.json.url.startsWith(`${t.config.apiPublicUrl}/auth/discord?`)).toBe(true);

    const out = await t.signIn('discord', t.profiles.discord('link-d'), { linkCode });
    expect(out.linked).toBe('discord');
    expect(out.authCode).toBeNull(); // already signed in; no new session needed

    const me = await t.client.get('/api/me', { token: g.token });
    expect(me.json.user.providers).toEqual(['google', 'discord']);

    // Signing in with Discord now lands on the SAME account.
    const viaDiscord = await t.login('discord', t.profiles.discord('link-d'));
    expect(viaDiscord.user.id).toBe(g.user.id);
  });

  it('refuses to link a provider account that already belongs to someone else', async () => {
    await t.login('discord', t.profiles.discord('taken-d'));
    const other = await t.login('google', t.profiles.google('wants-link'));
    const start = await t.client.post('/api/auth/link/discord/start', {}, { token: other.token });
    const linkCode = new URL(start.json.url).searchParams.get('link_code');
    const out = await t.signIn('discord', t.profiles.discord('taken-d'), { linkCode });
    expect(out.error).toBe('already_linked');
    expect(out.authCode).toBeNull();
    const me = await t.client.get('/api/me', { token: other.token });
    expect(me.json.user.providers).toEqual(['google']);
  });

  it('requires a signed-in user to start linking, and a link code is single-use', async () => {
    expect((await t.client.post('/api/auth/link/discord/start', {})).status).toBe(401);
    const g = await t.login('google', t.profiles.google('link-once'));
    const start = await t.client.post('/api/auth/link/discord/start', {}, { token: g.token });
    const linkCode = new URL(start.json.url).searchParams.get('link_code');
    const first = await t.client.get(`/auth/discord?link_code=${linkCode}`);
    expect(first.location.startsWith(t.fake.overrides.authorizeUrl)).toBe(true);
    const second = await t.client.get(`/auth/discord?link_code=${linkCode}`);
    expect(new URL(second.location).searchParams.get('auth_error')).toBe('link_expired');
  });
});

describe('invalid callbacks are rejected', () => {
  async function begin(provider = 'google') {
    const start = await t.client.get(`/auth/${provider}`);
    const authorize = new URL(start.location);
    return {
      cookie: start.headers.get('set-cookie').split(';')[0],
      state: authorize.searchParams.get('state'),
      challenge: authorize.searchParams.get('code_challenge'),
    };
  }
  const errorOf = (res) => new URL(res.location).searchParams.get('auth_error');

  it('rejects a callback with no handshake cookie (forged / cookie blocked)', async () => {
    const { state, challenge } = await begin();
    const code = t.fake.issueCode(t.profiles.google('nocookie'), challenge);
    const res = await t.client.get(`/auth/google/callback?code=${code}&state=${state}`);
    expect(errorOf(res)).toBe('invalid_state');
  });

  it('rejects a mismatched state', async () => {
    const { cookie, challenge } = await begin();
    const code = t.fake.issueCode(t.profiles.google('badstate'), challenge);
    const res = await t.client.get(`/auth/google/callback?code=${code}&state=not-the-state`, { cookie });
    expect(errorOf(res)).toBe('invalid_state');
    expect(await t.repos.identities.find('google', 'badstate')).toBeNull();
  });

  it('rejects a missing state', async () => {
    const { cookie, challenge } = await begin();
    const code = t.fake.issueCode(t.profiles.google('nostate'), challenge);
    const res = await t.client.get(`/auth/google/callback?code=${code}`, { cookie });
    expect(errorOf(res)).toBe('invalid_state');
  });

  it("rejects a cookie from a different provider's handshake", async () => {
    const { cookie, state, challenge } = await begin('discord');
    const code = t.fake.issueCode(t.profiles.google('xprov'), challenge);
    const res = await t.client.get(`/auth/google/callback?code=${code}&state=${state}`, { cookie });
    expect(errorOf(res)).toBe('invalid_state');
  });

  it('rejects a tampered handshake cookie', async () => {
    const { cookie, state } = await begin();
    const tampered = cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    const res = await t.client.get(`/auth/google/callback?code=x&state=${state}`, { cookie: tampered });
    expect(errorOf(res)).toBe('invalid_state');
  });

  it('rejects an expired handshake', async () => {
    const { state } = await begin();
    const expired = signPayload({ state, verifier: 'v', provider: 'google', exp: Date.now() - 1000 }, t.config.sessionSecret);
    const res = await t.client.get(`/auth/google/callback?code=x&state=${state}`, { cookie: `meridian_oauth=${expired}` });
    expect(errorOf(res)).toBe('invalid_state');
  });

  it('reports access_denied when the user cancels at the provider', async () => {
    const { cookie, state } = await begin();
    const res = await t.client.get(`/auth/google/callback?error=access_denied&state=${state}`, { cookie });
    expect(errorOf(res)).toBe('access_denied');
  });

  it('reports a missing code', async () => {
    const { cookie, state } = await begin();
    expect(errorOf(await t.client.get(`/auth/google/callback?state=${state}`, { cookie }))).toBe('missing_code');
  });

  it('turns a failing token endpoint into provider_error without leaking details', async () => {
    t.fake.failTokenEndpoint();
    try {
      const out = await t.signIn('google', t.profiles.google('tokfail'));
      expect(out.error).toBe('provider_error');
      expect(out.callback.location).not.toMatch(/boom|500/);
    } finally {
      t.fake.failTokenEndpoint(false);
    }
  });

  it('turns a failing profile endpoint into provider_error', async () => {
    t.fake.failProfileEndpoint();
    try {
      expect((await t.signIn('google', t.profiles.google('proffail'))).error).toBe('provider_error');
    } finally {
      t.fake.failProfileEndpoint(false);
    }
  });

  it('rejects a code that the provider will not honour (wrong PKCE verifier)', async () => {
    const { cookie, state } = await begin();
    const code = t.fake.issueCode(t.profiles.google('pkce'), 'a-different-challenge');
    const res = await t.client.get(`/auth/google/callback?code=${code}&state=${state}`, { cookie });
    expect(errorOf(res)).toBe('provider_error');
    expect(await t.repos.identities.find('google', 'pkce')).toBeNull();
  });

  it('rejects a profile without a stable account id', async () => {
    const out = await t.signIn('google', { email: 'noid@example.com' });
    expect(out.error).toBe('provider_error');
  });

  it('clears the handshake cookie after the callback', async () => {
    const out = await t.signIn('google', t.profiles.google('cleared'));
    expect(out.callback.headers.get('set-cookie')).toMatch(/meridian_oauth=;.*Max-Age=0/);
  });
});

describe('disabled accounts', () => {
  it('cannot sign in and existing sessions stop working immediately', async () => {
    const a = await t.login('google', t.profiles.google('to-disable'));
    await t.repos.users.update(a.user.id, { status: 'disabled' });
    expect((await t.client.get('/api/me', { token: a.token })).json.user).toBeNull();
    const out = await t.signIn('google', t.profiles.google('to-disable'));
    expect(out.error).toBe('account_disabled');
    expect(out.authCode).toBeNull();
  });
});

describe('one-time login codes', () => {
  it('can be exchanged exactly once', async () => {
    const out = await t.signIn('google', t.profiles.google('once'));
    const first = await t.client.post('/api/auth/exchange', { code: out.authCode });
    const second = await t.client.post('/api/auth/exchange', { code: out.authCode });
    expect(first.status).toBe(200);
    expect(second.status).toBe(401);
  });

  it('rejects unknown, missing and expired codes', async () => {
    expect((await t.client.post('/api/auth/exchange', { code: 'nope' })).status).toBe(401);
    expect((await t.client.post('/api/auth/exchange', {})).status).toBe(400);
    const u = await t.login('google', t.profiles.google('expiring'));
    await t.repos.sessions.createCode({ codeHash: hashToken('old'), userId: u.user.id, purpose: 'login', ttlSeconds: -10 });
    expect((await t.client.post('/api/auth/exchange', { code: 'old' })).status).toBe(401);
  });

  it("a 'link' code cannot be used to log in", async () => {
    const u = await t.login('google', t.profiles.google('purpose'));
    await t.repos.sessions.createCode({ codeHash: hashToken('linkcode'), userId: u.user.id, purpose: 'link', ttlSeconds: 60 });
    expect((await t.client.post('/api/auth/exchange', { code: 'linkcode' })).status).toBe(401);
  });
});

describe('sessions', () => {
  it('persist: the token keeps identifying the user across requests', async () => {
    const a = await t.login('google', t.profiles.google('persist'));
    for (let i = 0; i < 3; i++) {
      const me = await t.client.get('/api/me', { token: a.token });
      expect(me.json.user.id).toBe(a.user.id);
    }
  });

  it('stores only a hash of the token', async () => {
    const a = await t.login('google', t.profiles.google('hashed'));
    const { rows } = await t.db.query('SELECT token_hash FROM sessions WHERE user_id = $1', [a.user.id]);
    expect(rows.map((r) => r.token_hash)).toContain(hashToken(a.token));
    expect(rows.map((r) => r.token_hash)).not.toContain(a.token);
  });

  it('are per-device: two logins give two independent tokens', async () => {
    const a = await t.login('google', t.profiles.google('two-dev'));
    const b = await t.login('google', t.profiles.google('two-dev'));
    expect(a.token).not.toBe(b.token);
    await t.client.post('/api/logout', {}, { token: a.token });
    expect((await t.client.get('/api/me', { token: a.token })).json.user).toBeNull();
    expect((await t.client.get('/api/me', { token: b.token })).json.user.id).toBe(b.user.id);
  });

  it('end on logout', async () => {
    const a = await t.login('google', t.profiles.google('logout'));
    expect((await t.client.post('/api/logout', {}, { token: a.token })).status).toBe(200);
    expect((await t.client.get('/api/me', { token: a.token })).json.user).toBeNull();
    expect((await t.client.get('/api/me/stats', { token: a.token })).status).toBe(401);
  });

  it('expire', async () => {
    const a = await t.login('google', t.profiles.google('expire'));
    await t.db.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [a.user.id]);
    expect((await t.client.get('/api/me', { token: a.token })).json.user).toBeNull();
  });

  it('slide forward while in use', async () => {
    const a = await t.login('google', t.profiles.google('slide'));
    await t.db.query(
      "UPDATE sessions SET last_seen_at = now() - interval '2 hours', expires_at = now() + interval '1 day' WHERE user_id = $1",
      [a.user.id]
    );
    await t.client.get('/api/me', { token: a.token });
    const { rows } = await t.db.query('SELECT expires_at FROM sessions WHERE user_id = $1', [a.user.id]);
    expect(rows[0].expires_at.getTime() - Date.now()).toBeGreaterThan(20 * 24 * 3600 * 1000);
  });

  it('are not accepted from garbage, or from a cookie', async () => {
    expect((await t.client.get('/api/me', { token: 'garbage' })).json.user).toBeNull();
    const a = await t.login('google', t.profiles.google('nocookieauth'));
    expect((await t.client.get('/api/me', { cookie: `session=${a.token}` })).json.user).toBeNull();
  });

  it('purgeExpired removes dead sessions and codes only', async () => {
    const a = await t.login('google', t.profiles.google('purge'));
    await t.repos.sessions.createCode({ codeHash: hashToken('dead'), userId: a.user.id, purpose: 'login', ttlSeconds: -5 });
    await t.repos.sessions.purgeExpired();
    const { rows } = await t.db.query('SELECT 1 FROM one_time_codes WHERE code_hash = $1', [hashToken('dead')]);
    expect(rows).toHaveLength(0);
    expect((await t.client.get('/api/me', { token: a.token })).json.user.id).toBe(a.user.id);
  });
});

describe('admin bootstrap', () => {
  it('grants admin to an ADMIN_EMAILS address that the provider verified', async () => {
    const a = await t.login('google', t.profiles.google('boss-1', { email: 'boss@example.com' }));
    expect(a.user.isAdmin).toBe(true);
  });

  it('does NOT grant admin for an unverified email', async () => {
    const a = await t.login('discord', t.profiles.discord('fake-boss', { email: 'boss@example.com', verified: false }));
    expect(a.user.isAdmin).toBe(false);
  });

  it('does not grant admin to other users', async () => {
    const a = await t.login('google', t.profiles.google('regular'));
    expect(a.user.isAdmin).toBe(false);
  });
});

describe('rate limiting', () => {
  it('throttles repeated sign-in requests from one client', async () => {
    const t2 = await createTestApp({ envOverrides: { AUTH_RATE_LIMIT_PER_MINUTE: '5' } });
    try {
      const statuses = [];
      for (let i = 0; i < 8; i++) statuses.push((await t2.client.post('/api/auth/exchange', { code: 'x' })).status);
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(5)).toEqual([429, 429, 429]);
    } finally {
      await t2.close();
    }
  });
});

describe('CORS', () => {
  it('allows the configured frontend origin and no other', async () => {
    const ok = await t.client.get('/api/health', { headers: { Origin: new URL(CLIENT_URL).origin } });
    expect(ok.headers.get('access-control-allow-origin')).toBe(new URL(CLIENT_URL).origin);
    const bad = await t.client.get('/api/health', { headers: { Origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    expect(ok.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('answers the Authorization preflight', async () => {
    const res = await t.client.get('/api/me', { headers: {} });
    expect(res.status).toBe(200);
    const pre = await fetch(`${t.client.base}/api/me`, {
      method: 'OPTIONS',
      headers: { Origin: new URL(CLIENT_URL).origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
    });
    expect(pre.headers.get('access-control-allow-headers')).toMatch(/authorization/i);
  });
});
