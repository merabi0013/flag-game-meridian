import { Link } from 'react-router-dom';
import { labelForCategory } from '../utils/categories';
import { getCountryById } from '../data/countries';
import { IS_SUPPORT_CONFIGURED } from '../config/appConfig';
import MissedFlagsList from '../components/MissedFlagsList';
import SupportLink from '../components/SupportLink';
import Button from '../components/Button';

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function Results({ result, onPlayAgain, syncNote }) {
  const accuracy = result.totalQuestions ? Math.round((result.correct / result.totalQuestions) * 100) : 0;
  const reasonText = result.reason === 'timeout' ? "Time's up!" : 'Round complete';

  return (
    <div className="summary-card">
      <span className="eyebrow">{reasonText}</span>
      <div className="summary-score">{result.score}</div>
      <p className="summary-sub">
        {labelForCategory(result.categoryId)} · {result.difficulty} difficulty
      </p>

      <div className="summary-stat-grid">
        <div className="summary-stat">
          <b>{result.correct}/{result.totalQuestions}</b>
          <span>Correct</span>
        </div>
        <div className="summary-stat">
          <b>{accuracy}%</b>
          <span>Accuracy</span>
        </div>
        <div className="summary-stat">
          <b>{result.bestStreak}</b>
          <span>Best streak</span>
        </div>
        <div className="summary-stat">
          <b>{formatTime(result.durationSeconds)}</b>
          <span>Time played</span>
        </div>
      </div>

      <MissedFlagsList missed={result.missed} getCountry={getCountryById} />

      <div className="summary-actions">
        <Button variant="primary" onClick={onPlayAgain}>
          Play again
        </Button>
        <Link className="btn btn-ghost" to="/">
          New category
        </Link>
        <Link className="btn btn-ghost" to="/profile">
          View profile
        </Link>
      </div>
      <p className="sync-note">{syncNote}</p>

      {/* Subtle by design — never more prominent than Play Again above,
          and entirely absent (not a placeholder link) until a real
          SUPPORT_URL is set in config/appConfig.js. */}
      {IS_SUPPORT_CONFIGURED && (
        <p className="results-support-note">
          Enjoying the game? <SupportLink className="results-support-link" />
        </p>
      )}
    </div>
  );
}
