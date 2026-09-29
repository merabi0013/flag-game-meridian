/**
 * appConfig.js
 * -----------------------------------------------------------------------
 * App-wide configuration that isn't game logic. Right now this is just
 * the external support/donation link.
 *
 * Recommendation: Ko-fi. For a solo game project wanting simple one-off
 * "tips," Ko-fi charges 0% platform fee on one-time donations (Buy Me a
 * Coffee takes ~5% unless you're on its paid plan), the signup/setup is
 * just as quick, and a Ko-fi page link works identically here — swap the
 * URL below for a Buy Me a Coffee or GitHub Sponsors link just as easily
 * if you'd rather use one of those instead.
 *
 * HOW TO ENABLE: replace SUPPORT_URL below with your real page URL
 * (e.g. 'https://ko-fi.com/yourname'). Until then, IS_SUPPORT_CONFIGURED
 * is false and every support UI element in the app stays hidden — no
 * placeholder or broken link is ever shown to players.
 * -----------------------------------------------------------------------
 */
export const SUPPORT_URL = 'YOUR_SUPPORT_PAGE_URL';

export const SUPPORT_LABEL = 'Support the Game ☕';

export const IS_SUPPORT_CONFIGURED =
  typeof SUPPORT_URL === 'string' && SUPPORT_URL.trim().length > 0 && SUPPORT_URL !== 'YOUR_SUPPORT_PAGE_URL';

/**
 * App identity + feature flags — the "simplest architecture that fits"
 * per the README's "Application configuration" section, not a generic
 * flag-management framework. Values here are read at build time (this
 * is a static JS object, not a live remote-config fetch); toggling one
 * means editing this file and redeploying, which is the right amount of
 * ceremony for a project this size. If a flag ever needs to change
 * without a redeploy, that's the signal to move it server-side instead
 * of adding complexity here.
 */
export const APP_NAME = 'Meridian';
export const APP_VERSION = '1.0.0';

export const FEATURE_FLAGS = {
  multiplayer: true,
  paidCategories: true,
  supportLink: IS_SUPPORT_CONFIGURED,
};
