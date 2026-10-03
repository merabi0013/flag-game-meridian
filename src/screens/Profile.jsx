import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { labelForCategory, categoryGroups } from '../utils/categories';
import { buildStatsSections } from '../utils/categoryStats';
import { readGuestStats, clearGuestStats, accuracy as accuracyOf } from '../utils/storage';
import { readGuestMultiplayerGames, clearGuestMultiplayerGames } from '../utils/multiplayerStorage';
import { rankPlayers, formatDurationMs } from '../utils/ranking';
import { loginUrl } from '../hooks/useAuth';
import { usePaidAccess } from '../hooks/usePaidAccess';
import Button from '../components/Button';

const dash = '—';

/** One category's statistics: a heading and the same five metrics for every category. */
function CategoryStatCard({ row }) {
  const mark = row.partial ? '†' : '';
  const value = (v, suffix = '') => (v === null || v === undefined ? dash : `${v}${suffix}${suffix === '' ? mark : ''}`);
  const metrics = [
    ['Games played', value(row.gamesPlayed)],
    ['Questions answered', String(row.questionsAnswered)],
    ['Accuracy', `${row.accuracy}%`],
    ['Best score', value(row.bestScore)],
    ['Best streak', value(row.bestStreak)],
  ];
  return (
    <div className="cat-stat-card" data-category={row.id}>
      <h4 className="cat-stat-name">{row.name}</h4>
      <dl className="cat-stat-grid">
        {metrics.map(([label, v]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function Profile() {
  const { user, backendReachable, authedFetch } = useAuthContext();
  // location.pathname is the real browser path (already includes the
  // GitHub Pages subpath, if any) — use it instead of a hardcoded
  // '/profile' literal so sign-in still returns here correctly under a
  // subpath deployment.
  const location = useLocation();
  const returnToHere = location.pathname;
  const showToast = useToast();
  const [stats, setStats] = useState(readGuestStats());
  const [source, setSource] = useState('guest');
  const [multiplayerGames, setMultiplayerGames] = useState([]);
  const { paidCategories } = usePaidAccess(user);

  useEffect(() => {
    let cancelled = false;
    async function loadServerStats() {
      if (!user) {
        setStats(readGuestStats());
        setSource('guest');
        setMultiplayerGames(readGuestMultiplayerGames());
        return;
      }
      const res = await authedFetch('/api/me/stats');
      if (cancelled) return;
      if (res && res.ok) {
        const data = await res.json();
        setStats(data);
        setSource('server');
      } else {
        setStats(readGuestStats());
        setSource('guest');
      }

      const mpRes = await authedFetch('/api/me/multiplayer-games');
      if (cancelled) return;
      if (mpRes && mpRes.ok) {
        const mpData = await mpRes.json();
        setMultiplayerGames(mpData.games);
      } else {
        setMultiplayerGames([]);
      }
    }
    loadServerStats();
    return () => {
      cancelled = true;
    };
  }, [user, authedFetch]);

  function handleClearGuest() {
    if (!window.confirm('Clear locally saved guest statistics? This cannot be undone.')) return;
    clearGuestStats();
    clearGuestMultiplayerGames();
    setStats(readGuestStats());
    setMultiplayerGames([]);
    showToast('Guest stats cleared.');
  }

  const accuracy = source === 'server' ? stats.accuracy ?? accuracyOf(stats) : accuracyOf(stats);
  const avgScore = stats.gamesPlayed ? Math.round(stats.totalScore / stats.gamesPlayed) : 0;
  // Category -> performance records -> calculated stats -> sections (utils/categoryStats.js).
  const categorySections = buildStatsSections(stats.categoryStats, categoryGroups(), labelForCategory);
  const recentGames = stats.recentGames || [];

  return (
    <>
      <div className="container profile-header">
        <div className="profile-avatar">{(user?.name || user?.email || 'G').charAt(0).toUpperCase()}</div>
        <div>
          <h1 className="profile-name">{user ? user.name || user.email : 'Guest player'}</h1>
          <div className="profile-meta">
            {user ? `Signed in via ${user.provider}` : 'Stats saved in this browser only'}
          </div>
        </div>
      </div>

      <main className="container profile-body">
        {user?.isAdmin && (
          <div className="guest-banner" style={{ background: 'linear-gradient(135deg, rgba(207,159,69,0.16), rgba(207,159,69,0.05))' }}>
            <div>
              <h2 style={{ marginBottom: 2 }}>Administrator</h2>
              <p>You have administrator access on this account.</p>
            </div>
            <Link to="/admin" className="btn btn-primary">Administrative Panel</Link>
          </div>
        )}

        {!user && (
          <div className="guest-banner">
            <div>
              <h2 style={{ marginBottom: 2 }}>Playing as a guest</h2>
              {backendReachable === false ? (
                <p>
                  Sign-in isn't available in this deployment (no backend configured). Your progress below is stored
                  in this browser.
                </p>
              ) : (
                <p>Your stats are saved in this browser only. Sign in to keep them across devices, or just keep playing as a guest.</p>
              )}
            </div>
            {backendReachable !== false && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a className="btn btn-primary" href={loginUrl('google', returnToHere)}>Continue with Google</a>
                <a className="btn btn-ghost" href={loginUrl('discord', returnToHere)}>Continue with Discord</a>
              </div>
            )}
          </div>
        )}

        {user && Object.values(paidCategories).some((c) => c.owned) && (
          <section className="profile-section">
            <h2>Your games</h2>
            <div className="recent-list">
              {Object.values(paidCategories)
                .filter((c) => c.owned)
                .map((c) => (
                  <div className="recent-row" key={c.categoryId}>
                    <span className="r-cat">{c.name}</span>
                    <span className="r-meta">{c.viaAdmin ? 'Admin access' : 'Purchased'}</span>
                  </div>
                ))}
            </div>
          </section>
        )}

        <section className="profile-section" data-testid="statistics">
          <h2>Your statistics</h2>

          <div className="stats-group" data-testid="overall-stats">
            <h3 className="stats-group-title">All categories</h3>
            <div className="profile-grid">
              <div className="profile-stat"><b>{stats.gamesPlayed}</b><span>Games played</span></div>
              <div className="profile-stat"><b>{stats.questionsAnswered}</b><span>Questions answered</span></div>
              <div className="profile-stat"><b>{accuracy}%</b><span>Accuracy</span></div>
              <div className="profile-stat"><b>{stats.bestStreak}</b><span>Best streak</span></div>
              <div className="profile-stat"><b>{stats.bestScore}</b><span>Best score</span></div>
              <div className="profile-stat"><b>{avgScore}</b><span>Average score</span></div>
            </div>
          </div>

          {categorySections.isEmpty ? (
            <p className="panel-sub" style={{ marginTop: 12 }}>
              No games played yet in any category — head to the home page and play a round.
            </p>
          ) : (
            <div data-testid="category-stats">
              {categorySections.sections.map((section) => {
                // A group holding one category of the same name (World) needs no extra heading.
                const redundantTitle = section.rows.length === 1 && section.rows[0].name === section.name;
                return (
                  <div className="stats-group" key={section.id} data-group={section.id}>
                    {!redundantTitle && <h3 className="stats-group-title">{section.name}</h3>}
                    <div className="cat-stat-list">
                      {section.rows.map((row) => (
                        <CategoryStatCard key={row.id} row={row} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {categorySections.hasPartial && (
                <p className="stats-footnote">
                  † Detailed per-category tracking began recently. Games, best score and best streak marked † cover
                  games since then; earlier games in that category are already included in questions answered and
                  accuracy.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="profile-section">
          <h2>Solo game history</h2>
          {recentGames.length ? (
            <div className="recent-list">
              {recentGames.map((g, i) => (
                <div className="recent-row" key={i}>
                  <span className="r-cat">
                    {labelForCategory(g.categoryId)}{' '}
                    <span style={{ color: 'var(--parchment-dim)', fontWeight: 400 }}>· {g.difficulty}</span>
                  </span>
                  <span className="r-meta">
                    {g.score} pts · {g.correct}/{g.totalQuestions} · {new Date(g.at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel-sub">Nothing here yet.</p>
          )}
        </section>

        <section className="profile-section">
          <h2>Multiplayer game history</h2>
          {multiplayerGames.length ? (
            <div className="recent-list">
              {multiplayerGames.map((g, i) => {
                const winner = rankPlayers(g.players)[0];
                return (
                  <div className="recent-row" key={g.id ?? i}>
                    <span className="r-cat">
                      {labelForCategory(g.categoryId)}{' '}
                      <span style={{ color: 'var(--parchment-dim)', fontWeight: 400 }}>
                        · {g.playerCount ?? g.players.length} players · {g.guessingOrder} order
                      </span>
                    </span>
                    <span className="r-meta">
                      Winner: {winner?.name} ({winner?.score} pts, {formatDurationMs(winner?.totalTimeMs)}) · {new Date(g.at).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="panel-sub">
              No multiplayer games yet — pick Multiplayer in game setup to play pass-and-play with friends.
            </p>
          )}
        </section>

        <section className="profile-section">
          <Button variant="danger-ghost" size="sm" onClick={handleClearGuest}>
            Clear guest stats on this device
          </Button>
        </section>
      </main>
    </>
  );
}
