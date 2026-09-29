// Regression tests for the GitHub Pages deep-link round trip that used to
// produce  https://<user>.github.io/?/flag-game-meridian/game~and~...
// They execute the real <script> blocks from the templates.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const scriptOf = (file, marker) => {
  const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return blocks.find((b) => b.includes(marker));
};

function location(href) {
  const u = new URL(href);
  return {
    protocol: u.protocol, hostname: u.hostname, port: u.port,
    pathname: u.pathname, search: u.search, hash: u.hash,
    replaced: null,
    replace(url) { this.replaced = url; },
  };
}

function runFallback404(segments, href) {
  const src = scriptOf('spa-404.html', 'pathSegmentsToKeep').replace('__BASE_SEGMENTS__', String(segments));
  const loc = location(href);
  vm.runInNewContext(src, { window: { location: loc } });
  return loc.replaced;
}

function runDecoder(href) {
  const src = scriptOf('index.html', 'replaceState');
  const loc = location(href);
  let restored = null;
  vm.runInNewContext(src, { window: { location: loc, history: { replaceState: (_a, _b, url) => (restored = url) } } });
  return restored;
}

describe('GitHub Pages 404 fallback', () => {
  const base = 'https://merabi0013.github.io/flag-game-meridian';
  const gameUrl = `${base}/game?category=europe&difficulty=easy&timer=0&minutes=3&count=10`;

  it('keeps the repo segment in the redirect target (the reported bug)', () => {
    const redirect = runFallback404(1, gameUrl);
    expect(redirect).toBe(`${base}/?/game&category=europe~and~difficulty=easy~and~timer=0~and~minutes=3~and~count=10`);
    expect(redirect).not.toContain('github.io/?/flag-game-meridian');
  });

  it('restores the exact original URL', () => {
    const restored = runDecoder(runFallback404(1, gameUrl));
    expect(restored).toBe('/flag-game-meridian/game?category=europe&difficulty=easy&timer=0&minutes=3&count=10');
  });

  it('works for a root-hosted deployment (0 base segments)', () => {
    const restored = runDecoder(runFallback404(0, 'https://example.com/game?count=10&category=world'));
    expect(restored).toBe('/game?count=10&category=world');
  });

  it('is a no-op for a normal page load', () => {
    expect(runDecoder(`${base}/?login=failed`)).toBeNull();
  });
});
