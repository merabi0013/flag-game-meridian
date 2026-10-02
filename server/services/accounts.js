/**
 * services/accounts.js
 * -----------------------------------------------------------------------
 * Turns "this provider says the person is <accountId>" into a Meridian
 * user. The rules, in order:
 *
 *  1. Known identity (same provider + same provider account id)
 *       -> that user logs in. Their profile details are refreshed.
 *  2. Unknown identity, NOT linking
 *       -> a new user is created with this identity.
 *  3. Unknown identity, linking (an already signed-in user asked to add
 *     this provider)
 *       -> the identity is attached to THAT user.
 *
 * What it deliberately does NOT do: match by email. Two identities that
 * merely share an email address are never merged automatically — anyone
 * can create a Discord account with someone else's email, and a provider
 * that doesn't verify email would turn that into an account takeover.
 * People who use both Google and Discord link them explicitly while signed
 * in (see routes/auth.js -> /api/auth/link/:provider/start).
 * -----------------------------------------------------------------------
 */
const { isBootstrapAdminEmail } = require('../lib/adminEmails');

class AuthError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function makeAccounts({ db, repos, env = process.env }) {
  async function resolveLogin(provider, profile, { linkUserId = null } = {}) {
    return db.tx(async (q) => {
      let identity = await repos.identities.find(provider, profile.accountId, q);
      let user;
      let isNew = false;
      let linked = false;

      if (linkUserId) {
        // Linking: the target must still exist and be active.
        user = await repos.users.findById(linkUserId, q);
        if (!user || user.status === 'disabled') throw new AuthError('account_disabled');
        if (identity && identity.userId !== user.id) throw new AuthError('already_linked');
        if (!identity) {
          identity = await repos.identities.create({ userId: user.id, provider, providerAccountId: profile.accountId, ...profile }, q);
          linked = true;
        }
      } else if (identity) {
        user = await repos.users.findById(identity.userId, q);
      } else {
        user = await repos.users.create({ name: profile.displayName || `${provider} player`, email: profile.email }, q);
        identity = await repos.identities.create({ userId: user.id, provider, providerAccountId: profile.accountId, ...profile }, q);
        if (!identity) {
          // Lost a race with a concurrent first login for the same account:
          // discard the user we just made and use the winner's.
          await repos.users.remove(user.id, q);
          identity = await repos.identities.find(provider, profile.accountId, q);
          user = await repos.users.findById(identity.userId, q);
        } else {
          isNew = true;
        }
      }

      if (!user) throw new AuthError('account_missing');
      if (user.status === 'disabled') throw new AuthError('account_disabled');

      await repos.identities.touch(identity.id, profile, q);
      await repos.users.touchLogin(user.id, q);

      // Bootstrap admin (grant-only; see lib/adminEmails.js). Only a
      // provider-VERIFIED email counts, so nobody gets admin by typing an
      // address into a provider that doesn't check it.
      if (!user.isAdmin && profile.emailVerified && isBootstrapAdminEmail(profile.email, env)) {
        await repos.users.setAdmin(user.id, true, q);
        user = { ...user, isAdmin: true };
      }

      return { user, isNew, linked };
    });
  }

  return { resolveLogin };
}

module.exports = { makeAccounts, AuthError };
