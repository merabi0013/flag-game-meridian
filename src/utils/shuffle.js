/**
 * shuffle.js
 * Framework-agnostic — safe to reuse as-is in a future React Native/Expo
 * port. No DOM, no React, no browser APIs.
 */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
