const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { Strategy: DiscordStrategy } = require('passport-discord');
const crypto = require('crypto');
const db = require('./db');
const { isBootstrapAdminEmail } = require('./lib/adminEmails');

function findOrCreateUser({ provider, providerId, email, name }) {
  let user = db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?').get(provider, providerId);

  if (!user) {
    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO users (id, provider, provider_id, email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, provider, providerId, email || null, name || null, new Date().toISOString());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  // Bootstrap-grant only — see lib/adminEmails.js for why this never
  // revokes, only grants, and why it's not the source of truth on its own.
  if (!user.is_admin && isBootstrapAdminEmail(user.email)) {
    db.prepare('UPDATE users SET is_admin = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  return user;
}

function configurePassport() {
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    try {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      // A disabled account loses its session on the very next request,
      // server-side — no need to touch or trust the client's cookie.
      if (!user || user.status === 'disabled') return done(null, false);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  const hasGoogleCreds = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;
  const hasDiscordCreds = process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET;

  if (hasGoogleCreds) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        (accessToken, refreshToken, profile, done) => {
          try {
            const user = findOrCreateUser({
              provider: 'google',
              providerId: profile.id,
              email: profile.emails && profile.emails[0] && profile.emails[0].value,
              name: profile.displayName,
            });
            if (user.status === 'disabled') return done(null, false, { message: 'This account has been disabled.' });
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );
  } else {
    console.warn('[auth] GOOGLE_CLIENT_ID/SECRET not set — Google sign-in is disabled until configured.');
  }

  if (hasDiscordCreds) {
    passport.use(
      new DiscordStrategy(
        {
          clientID: process.env.DISCORD_CLIENT_ID,
          clientSecret: process.env.DISCORD_CLIENT_SECRET,
          callbackURL: process.env.DISCORD_CALLBACK_URL,
          scope: ['identify', 'email'],
        },
        (accessToken, refreshToken, profile, done) => {
          try {
            const user = findOrCreateUser({
              provider: 'discord',
              providerId: profile.id,
              email: profile.email,
              name: profile.username,
            });
            if (user.status === 'disabled') return done(null, false, { message: 'This account has been disabled.' });
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );
  } else {
    console.warn('[auth] DISCORD_CLIENT_ID/SECRET not set — Discord sign-in is disabled until configured.');
  }

  return { hasGoogleCreds, hasDiscordCreds };
}

module.exports = { configurePassport };
