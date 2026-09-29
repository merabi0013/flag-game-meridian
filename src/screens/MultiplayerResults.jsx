import { Link } from 'react-router-dom';
import { labelForCategory } from '../utils/categories';
import { rankPlayers, formatDurationMs } from '../utils/ranking';
import Button from '../components/Button';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const SCROLL_THRESHOLD = 12;

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function MultiplayerResults({ result, onPlayAgain, syncNote }) {
  const ranked = rankPlayers(result.players);
  const reasonText = result.reason === 'timeout' ? "Time's up!" : 'Game complete';
  const scrollable = ranked.length > SCROLL_THRESHOLD;

  return (
    <div className="summary-card" style={{ maxWidth: 560 }}>
      <span className="eyebrow">{reasonText}</span>
      <h2 style={{ margin: '6px 0 4px' }}>Final results</h2>
      <p className="summary-sub">
        {labelForCategory(result.categoryId)} · {result.difficulty} difficulty · {result.totalQuestions} flags ·{' '}
        {result.guessingOrder} order
      </p>

      <div
        className={`recent-list${scrollable ? ' recent-list-scroll' : ''}`}
        style={{ marginBottom: 24, textAlign: 'left' }}
      >
        {ranked.map((p) => (
          <div className="recent-row" key={p.id}>
            <span className="r-cat">
              {MEDALS[p.rank] || `${p.rank}.`} {p.name}
            </span>
            <span className="r-meta">
              {p.score} pts · {p.correct}/{p.turnsTaken} correct ({p.accuracy}%) · best streak {p.bestStreak} · time{' '}
              {formatDurationMs(p.totalTimeMs)}
            </span>
          </div>
        ))}
      </div>

      <p className="admin-form-note" style={{ marginBottom: 20 }}>Played in {formatTime(result.durationSeconds)}</p>

      <div className="summary-actions">
        <Button variant="primary" onClick={onPlayAgain}>
          Play again
        </Button>
        <Link className="btn btn-ghost" to="/">
          New game
        </Link>
        <Link className="btn btn-ghost" to="/profile">
          View profile
        </Link>
      </div>
      <p className="sync-note">{syncNote}</p>
    </div>
  );
}
