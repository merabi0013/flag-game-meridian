const express = require('express');
const passport = require('passport');

function buildAuthRouter({ hasGoogleCreds, hasDiscordCreds }) {
  const router = express.Router();

  // CLIENT_URL is "where the frontend is served from" (see server/.env.example).
  // When the backend also serves the built frontend from the same process
  // (server/index.js's dist/ fallback), CLIENT_URL is this server's own
  // origin and a relative redirect would have worked just as well. But
  // CLIENT_URL is also how a *separately hosted* frontend is configured —
  // e.g. the static build deployed to GitHub Pages while this server runs
  // elsewhere (Render, Railway, Fly, etc.) — and in that split-origin setup
  // a relative res.redirect('/profile') would resolve against this API
  // server's own host, not the frontend, landing the user on a 404 here
  // instead of back in the app. Building an absolute URL from CLIENT_URL
  // fixes that while behaving identically in the same-origin case.
  const CLIENT_URL = (process.env.CLIENT_URL || '').replace(/\/$/, '');

  function absoluteReturn(path) {
    return CLIENT_URL ? `${CLIENT_URL}${path}` : path;
  }

  function guardConfigured(configured, providerLabel) {
    return (req, res, next) => {
      if (!configured) {
        return res
          .status(503)
          .send(
            `${providerLabel} sign-in is not configured on this server yet. ` +
              `Set the ${providerLabel.toUpperCase()}_CLIENT_ID / _CLIENT_SECRET environment variables and restart. ` +
              `See server/.env.example.`
          );
      }
      next();
    };
  }

  function safeReturnTo(req) {
    const returnTo = req.query.returnTo || '/';
    // Only ever allow a same-site relative path — never an absolute URL —
    // so this can't be used as an open redirect.
    return typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : '/';
  }

  // --- Google ---------------------------------------------------------
  router.get('/google', guardConfigured(hasGoogleCreds, 'google'), (req, res, next) => {
    req.session.returnTo = safeReturnTo(req);
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  });

  router.get(
    '/google/callback',
    guardConfigured(hasGoogleCreds, 'google'),
    passport.authenticate('google', { failureRedirect: absoluteReturn('/?login=failed') }),
    (req, res) => {
      const dest = req.session.returnTo || '/';
      delete req.session.returnTo;
      res.redirect(absoluteReturn(dest));
    }
  );

  // --- Discord ----------------------------------------------------------
  router.get('/discord', guardConfigured(hasDiscordCreds, 'discord'), (req, res, next) => {
    req.session.returnTo = safeReturnTo(req);
    passport.authenticate('discord')(req, res, next);
  });

  router.get(
    '/discord/callback',
    guardConfigured(hasDiscordCreds, 'discord'),
    passport.authenticate('discord', { failureRedirect: absoluteReturn('/?login=failed') }),
    (req, res) => {
      const dest = req.session.returnTo || '/';
      delete req.session.returnTo;
      res.redirect(absoluteReturn(dest));
    }
  );

  return router;
}

module.exports = { buildAuthRouter };
