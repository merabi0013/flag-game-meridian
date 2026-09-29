function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function ScoreDisplay({ score, streak, timerEnabled, timeRemaining }) {
  const low = timerEnabled && timeRemaining <= 10;
  return (
    <div className="stat-pills">
      <div className="stat-pill">
        <b>{score}</b>
        <span>Score</span>
      </div>
      <div className="stat-pill streak">
        <b>{streak}</b>
        <span>Streak</span>
      </div>
      {timerEnabled && (
        <div className={`stat-pill timer${low ? ' low' : ''}`}>
          <b>{formatTime(timeRemaining)}</b>
          <span>Time left</span>
        </div>
      )}
    </div>
  );
}
