/**
 * Human-readable text for the short error codes the backend puts in
 * `?auth_error=` when a sign-in fails (see server/routes/auth.js). The
 * backend deliberately sends only a code — never provider error text.
 */
const MESSAGES = {
  access_denied: 'Sign-in was cancelled.',
  invalid_state: "That sign-in attempt expired or couldn't be verified. Please try again.",
  missing_code: "The sign-in provider didn't return a code. Please try again.",
  provider_error: 'The sign-in provider had a problem. Please try again in a moment.',
  provider_not_configured: "That sign-in method isn't set up on this server.",
  account_disabled: 'This account has been disabled.',
  already_linked: 'That account is already connected to a different Meridian profile.',
  link_expired: 'The link request expired. Please start connecting the account again.',
  server_misconfigured: "Sign-in isn't available right now (server configuration).",
  server_error: 'Something went wrong on our side. Please try again.',
};

export function authErrorMessage(code) {
  return MESSAGES[code] || 'Sign-in failed. Please try again.';
}

const PROVIDER_LABELS = { google: 'Google', discord: 'Discord' };
export function providerLabel(name) {
  return PROVIDER_LABELS[name] || name;
}

/** Providers the UI offers. Whether each is configured comes from GET /api/auth/providers. */
export const KNOWN_PROVIDERS = ['google', 'discord'];
