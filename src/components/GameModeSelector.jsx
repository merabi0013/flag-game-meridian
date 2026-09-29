const MODES = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
];

export default function GameModeSelector({ length, onLengthChange, customLength, onCustomLengthChange, maxAvailable }) {
  const max = Math.max(1, maxAvailable);

  function handleCustomInput(e) {
    let v = parseInt(e.target.value, 10);
    if (isNaN(v)) v = 1;
    v = Math.min(Math.max(1, v), max);
    onCustomLengthChange(v);
  }

  return (
    <div className="option-group">
      <span className="option-label">Game length</span>
      <div className="segmented">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className={length === m.value ? 'active' : ''}
            onClick={() => onLengthChange(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {length === 'custom' && (
        <div className="inline-number-row">
          <input type="number" min={1} max={max} value={customLength} onChange={handleCustomInput} />
          <span className="option-label" style={{ margin: 0 }}>
            flags (max {max})
          </span>
        </div>
      )}
    </div>
  );
}
