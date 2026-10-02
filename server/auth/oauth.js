/**
 * auth/oauth.js
 * -----------------------------------------------------------------------
 * The provider-agnostic OAuth 2.0 authorization-code flow (with PKCE),
 * server side only. Three steps, each a tiny function:
 *
 *   buildAuthorizeUrl()  where to send the browser
 *   exchangeCode()       swap the returned ?code for an access token
 *                        (uses the client SECRET — never leaves the server)
 *   fetchProfile()       ask the provider who that token belongs to
 *
 * The client secret, authorization code and access token exist only inside
 * this process; the browser never sees any of them.
 * -----------------------------------------------------------------------
 */
const USER_AGENT = 'Meridian (https://github.com/merabi0013/flag-game-meridian)';
const TIMEOUT_MS = 10_000;

class OAuthError extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.code = code;
  }
}

function buildAuthorizeUrl(provider, { state, challenge }) {
  const url = new URL(provider.authorizeUrl);
  const params = {
    client_id: provider.clientId,
    redirect_uri: provider.callbackUrl,
    response_type: 'code',
    scope: provider.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(provider.extraAuthParams || {}),
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

async function exchangeCode(provider, { code, verifier }, fetchImpl = fetch) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: provider.callbackUrl,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code_verifier: verifier,
  });
  let res;
  try {
    res = await fetchImpl(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': USER_AGENT },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new OAuthError('provider_error', `token request failed: ${err.message}`);
  }
  if (!res.ok) throw new OAuthError('provider_error', `token endpoint returned ${res.status}`);
  const json = await res.json().catch(() => null);
  if (!json || typeof json.access_token !== 'string') throw new OAuthError('provider_error', 'token response had no access_token');
  return json.access_token;
}

async function fetchProfile(provider, accessToken, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(provider.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new OAuthError('provider_error', `profile request failed: ${err.message}`);
  }
  if (!res.ok) throw new OAuthError('provider_error', `profile endpoint returned ${res.status}`);
  const raw = await res.json().catch(() => null);
  const profile = raw && provider.mapProfile(raw);
  if (!profile || !profile.accountId) throw new OAuthError('provider_error', 'profile had no account id');
  return profile;
}

module.exports = { OAuthError, buildAuthorizeUrl, exchangeCode, fetchProfile };
