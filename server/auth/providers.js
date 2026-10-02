/**
 * auth/providers.js
 * -----------------------------------------------------------------------
 * One small object per OAuth 2.0 provider. To add a provider (GitHub,
 * Microsoft, ...) you add ONE entry here (its endpoints, scopes and how to
 * read its profile) plus its client id/secret in config.js's PROVIDER_ENV.
 * No route, database or frontend-flow code changes — the generic flow in
 * auth/oauth.js and routes/auth.js handles every provider identically.
 *
 * mapProfile() must return the provider's STABLE account id (never an
 * email or username, which can change) and say whether the provider
 * itself vouches for the email address.
 * -----------------------------------------------------------------------
 */
const PROVIDER_DEFINITIONS = {
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: ['openid', 'email', 'profile'],
    extraAuthParams: { prompt: 'select_account' },
    mapProfile: (p) => ({
      accountId: p.sub ? String(p.sub) : null,
      email: p.email || null,
      emailVerified: p.email_verified === true,
      displayName: p.name || p.email || null,
      avatarUrl: p.picture || null,
    }),
  },
  discord: {
    label: 'Discord',
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userInfoUrl: 'https://discord.com/api/users/@me',
    scopes: ['identify', 'email'],
    extraAuthParams: { prompt: 'consent' },
    mapProfile: (p) => ({
      accountId: p.id ? String(p.id) : null,
      email: p.email || null,
      emailVerified: p.verified === true,
      displayName: p.global_name || p.username || null,
      avatarUrl: p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png` : null,
    }),
  },
};

/**
 * Combine static definitions with the configured credentials.
 * `overrides` lets tests point a provider at a fake OAuth server.
 */
function buildProviders(config, overrides = {}) {
  const providers = {};
  for (const [name, def] of Object.entries(PROVIDER_DEFINITIONS)) {
    const creds = config.providers[name] || {};
    providers[name] = {
      name,
      ...def,
      ...(overrides[name] || {}),
      configured: !!creds.configured,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      callbackUrl: creds.callbackUrl,
    };
  }
  return providers;
}

module.exports = { PROVIDER_DEFINITIONS, buildProviders };
