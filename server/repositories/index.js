/** Builds every repository around one db handle: `const repos = createRepositories(db)`. */
const { makeUsersRepo } = require('./users');
const { makeIdentitiesRepo } = require('./identities');
const { makeSessionsRepo } = require('./sessions');
const { makeGamesRepo } = require('./games');
const { makeMultiplayerRepo } = require('./multiplayer');
const { makeCategoriesRepo } = require('./categories');
const { makeCommerceRepo } = require('./commerce');
const { makeAuditRepo } = require('./audit');

function createRepositories(db) {
  return {
    users: makeUsersRepo(db),
    identities: makeIdentitiesRepo(db),
    sessions: makeSessionsRepo(db),
    games: makeGamesRepo(db),
    multiplayer: makeMultiplayerRepo(db),
    categories: makeCategoriesRepo(db),
    commerce: makeCommerceRepo(db),
    audit: makeAuditRepo(db),
  };
}

module.exports = { createRepositories };
