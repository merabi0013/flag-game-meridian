/**
 * A tiny fake OAuth 2.0 provider (authorize is never visited — tests drive
 * the browser steps by hand — but token + userinfo are real HTTP endpoints).
 * It genuinely enforces PKCE: /token rejects a code_verifier that does not
 * hash to the challenge the code was issued against.
 */
const http = require('http');
const crypto = require('crypto');

async function startFakeProvider() {
  const codes = new Map(); // code -> { profile, challenge, used }
  const tokens = new Map(); // access token -> profile
  let failToken = false;
  let failProfile = false;

  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'POST' && req.url === '/token') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        if (failToken) return send(500, { error: 'boom' });
        const p = new URLSearchParams(raw);
        const entry = codes.get(p.get('code'));
        if (!entry || entry.used) return send(400, { error: 'invalid_grant' });
        const expected = crypto.createHash('sha256').update(p.get('code_verifier') || '').digest('base64url');
        if (entry.challenge && expected !== entry.challenge) return send(400, { error: 'invalid_grant', detail: 'PKCE mismatch' });
        if (!p.get('client_secret') || !p.get('redirect_uri')) return send(400, { error: 'invalid_client' });
        entry.used = true;
        const at = `at_${crypto.randomBytes(8).toString('hex')}`;
        tokens.set(at, entry.profile);
        send(200, { access_token: at, token_type: 'Bearer' });
      });
    } else if (req.method === 'GET' && req.url === '/userinfo') {
      if (failProfile) return send(500, { error: 'boom' });
      const profile = tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
      if (!profile) return send(401, { error: 'bad token' });
      send(200, profile);
    } else {
      send(404, {});
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    overrides: {
      authorizeUrl: `${base}/authorize`,
      tokenUrl: `${base}/token`,
      userInfoUrl: `${base}/userinfo`,
    },
    /** Pretend the user approved: returns the ?code the provider would send back. */
    issueCode(profile, challenge) {
      const code = `code_${crypto.randomBytes(8).toString('hex')}`;
      codes.set(code, { profile, challenge, used: false });
      return code;
    },
    failTokenEndpoint(v = true) {
      failToken = v;
    },
    failProfileEndpoint(v = true) {
      failProfile = v;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

module.exports = { startFakeProvider };
