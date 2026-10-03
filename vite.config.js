import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves 404.html for any URL with no matching file (a
// refresh or deep link on a client-side route). That page has to know how
// many leading path segments belong to the deployment base, and a static
// file in public/ can't — so it's emitted here from spa-404.html with the
// segment count derived from the same `base` the rest of the build uses.
function spaFallback404(base) {
  const segments = new URL(base, 'http://localhost').pathname.split('/').filter(Boolean).length;
  return {
    name: 'meridian-spa-404',
    apply: 'build',
    generateBundle() {
      const template = readFileSync(new URL('./spa-404.html', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: '404.html',
        source: template.replace('pathSegmentsToKeep = __BASE_SEGMENTS__', `pathSegmentsToKeep = ${segments}`),
      });
    },
  };
}

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
    plugins: [react(), spaFallback404(base)],
    server: {
      port: 5173,
    },
    // Unit + component tests (npm test). Component tests opt in to a DOM
    // with a `// @vitest-environment jsdom` comment at the top of the file.
    test: {
      include: ['tests/**/*.test.{js,jsx}'],
      exclude: ['node_modules/**', 'server/**', 'dist/**'],
    },
  };
});
