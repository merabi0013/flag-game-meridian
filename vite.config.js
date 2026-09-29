import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The app is hosted at "/" in local dev and in most production setups
// (a custom domain, or a backend serving the built files itself — see
// server/index.js). GitHub Pages project sites are the one common case
// that's different: they're served under a subpath named after the repo
// (https://<user>.github.io/<repo>/), so every asset URL and client-side
// route needs that prefix.
//
// Rather than hardcoding a repo name anywhere, that prefix is read from
// the VITE_BASE_PATH env var at build time (see .env.example and the
// "Deploying to GitHub Pages" section of the README). Leave it unset for
// local dev, a custom domain, or a user/org root site (<user>.github.io) —
// all of those are served at "/". The GitHub Actions workflow
// (.github/workflows/deploy-pages.yml) sets it automatically for you.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  let base = env.VITE_BASE_PATH && env.VITE_BASE_PATH.trim() ? env.VITE_BASE_PATH.trim() : '/';
  // Normalize to always start and end with "/" (e.g. "flag-game-meridian"
  // or "/flag-game-meridian" both become "/flag-game-meridian/") so a
  // slightly-off value in an env var or workflow input doesn't silently
  // break asset resolution.
  if (!base.startsWith('/') && !/^https?:\/\//.test(base)) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;

  return {
    base,
    plugins: [react()],
    server: {
      port: 5173,
    },
  };
});
