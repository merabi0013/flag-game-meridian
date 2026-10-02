import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { labelForCategory, CATEGORY_TREE } from '../utils/categories';
import { buildStatsSections } from '../utils/categoryStats';
import { KNOWN_PROVIDERS, providerLabel } from '../utils/authMessages';
import { readGuestStats, clearGuestStats, accuracy as accuracyOf } from '../utils/storage';
import { readGuestMultiplayerGames, clearGuestMultiplayerGames } from '../utils/multiplayerStorage';
import { rankPlayers, formatDurationMs } from '../utils/ranking';
import { loginUrl } from '../hooks/useAuth';
import { useCatalog } from '../context/CatalogContext';
import Button from '../components/Button';

export default function Profile() {
  const { user, backendReachable, authedFetch, linkProvider } = useAuthContext();
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
  const { catalog } = useCatalog();
  const [linkError, setLinkError] = useState(null);

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
  // Per-category statistics, grouped like the category picker. Generated
  // from the category tree and whatever categories appear in the records.
  const categorySections = buildStatsSections(stats.categoryStats, CATEGORY_TREE, labelForCategory);
  const ownedPaid = Object.values(catalog.byId).filter((c) => c.type === 'paid' && c.owned);
  const linkedProviders = (user && user.providers) || [];

  async function handleLink(provider) {
    setLinkError(null);
    try {
      await linkProvider(provider, '/profile');
    } catch (err) {
      setLinkError(err.message);
    }
  }
  const recentGames = stats.recentGames || [];

  return (
    <>
      <div className="container profile-header">
        <div className="profile-avatar">{(user?.name || user?.email || 'G').charAt(0).toUpperCase()}</div>
        <div>
          <h1 className="profile-name">{user ? user.name || user.email : 'Guest player'}</h1>
          <div className="profile-meta">
            {user
              ? `Signed in via ${(linkedProviders.length ? linkedProviders : [user.provider]).map(providerLabel).join(' + ')}`
              : 'Stats saved in this browser only'}
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

        <section className="profile-section">
          <div className="profile-grid">
            <div className="profile-stat"><b>{stats.gamesPlayed}</b><span>Games played</span></div>
            <div className="profile-stat"><b>{stats.questionsAnswered}</b><span>Questions answered</span></div>
            <div className="profile-stat"><b>{accuracy}%</b><span>Accuracy</span></div>
            <div className="profile-stat"><b>{stats.bestStreak}</b><span>Best streak</span></div>
            <div className="profile-stat"><b>{stats.bestScore}</b><span>Best score</span></div>
            <div className="profile-stat"><b>{avgScore}</b><span>Average score</span></div>
          </div>
        </section>

        {user && (
          <section className="profile-section">
            <h2>Connected accounts</h2>
            <p className="panel-sub">Sign in with any of these and you land on this same profile.</p>
            <div className="recent-list">
              {KNOWN_PROVIDERS.map((provider) => {
                const connected = linkedProviders.includes(provider);
                return (
                  <div className="recent-row" key={provider}>
                    <span className="r-cat">{providerLabel(provider)}</span>
                    <span className="r-meta">
                      {connected ? (
                        <span className="badge badge-owned">Connected</span>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handleLink(provider)}>
                          Connect {providerLabel(provider)}
                        </Button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {linkError && <p style={{ color: 'var(--rust-bright)', fontSize: '0.85rem', marginTop: 8 }}>{linkError}</p>}
          </section>
        )}

        {user && ownedPaid.length > 0 && (
          <section className="profile-section">
            <h2>Your games</h2>
            <div className="recent-list">
              {ownedPaid.map((c) => (
                <div className="recent-row" key={c.id}>
                  <span className="r-cat">{c.name}</span>
                  <span className="r-meta">{c.viaAdmin ? 'Admin access' : 'Purchased'}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="profile-section" data-testid="category-stats">
          <h2>Statistics by category</h2>
          {categorySections.isEmpty ? (
            <p className="panel-sub" style={{ marginTop: 12 }}>
              No games played yet in any category — head to the home page and play a round.
            </p>
          ) : (
            <>
              {categorySections.sections.map((section) => (
                <div className="stats-group" key={section.id}>
                  <h3 className="stats-group-title">{section.name}</h3>
                  <div className="table-scroll">
                    <table className="category-perf-table stats-by-category">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Games</th>
                          <th>Questions</th>
                          <th colSpan={2}>Accuracy</th>
                          <th>Best score</th>
                          <th>Best streak</th>
                          <th>Avg score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((r) => (
                          <tr key={r.id} data-category={r.id}>
                            <td>{r.name}</td>
                            <td>{r.gamesPlayed ?? '—'}</td>
                            <td>{r.questionsAnswered}</td>
                            <td style={{ width: 90 }}>
                              <div className="perf-bar-track"><div className="perf-bar-fill" style={{ width: `${r.accuracy}%` }} /></div>
                            </td>
                            <td style={{ width: 52 }}>{r.accuracy}%</td>
                            <td>{r.bestScore ?? '—'}</td>
                            <td>{r.bestStreak ?? '—'}</td>
                            <td>{r.averageScore ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {categorySections.hasPartial && (
                <p className="panel-sub" style={{ marginTop: 10 }}>
                  Detailed per-category numbers for guest play start from this update; earlier games only count
                  toward questions and accuracy.
                </p>
              )}
            </>
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
