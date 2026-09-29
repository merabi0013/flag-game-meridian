import { labelForCategory } from '../../utils/categories';
import { rankPlayers, formatDurationMs } from '../../utils/ranking';

export default function MultiplayerGamesList({ games }) {
  if (!games || !games.length) {
    return <p className="panel-sub">No multiplayer games played yet.</p>;
  }

  return (
    <div className="recent-list">
      {games.map((g) => {
        const winner = rankPlayers(g.players)[0];
        return (
          <div className="recent-row" key={g.id}>
            <span className="r-cat">
              {labelForCategory(g.categoryId)}{' '}
              <span style={{ color: 'var(--parchment-dim)', fontWeight: 400 }}>
                · {g.playerCount} players · {g.guessingOrder} order
              </span>
              <br />
              <span style={{ color: 'var(--parchment-dim)', fontWeight: 400, fontSize: '0.8rem' }}>
                Host: {g.hostName || g.hostEmail || 'unknown'}
              </span>
            </span>
            <span className="r-meta">
              Winner: {winner?.name} ({winner?.score} pts, {formatDurationMs(winner?.totalTimeMs)})
              <br />
              {new Date(g.createdAt).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
