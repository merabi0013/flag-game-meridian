export default function TimerToggle({ enabled, onToggle, minutes, onMinutesChange }) {
  return (
    <div className="option-group">
      <div className="toggle-row">
        <span className="option-label" style={{ margin: 0 }}>Enable timer</span>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <span className="track" />
        </label>
      </div>
      {enabled && (
        <div className="timer-minutes">
          <input
            type="number"
            min={1}
            max={30}
            value={minutes}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onMinutesChange(isNaN(v) || v <= 0 ? 3 : v);
            }}
          />
          <span className="option-label" style={{ margin: 0 }}>minutes</span>
        </div>
      )}
    </div>
  );
}
