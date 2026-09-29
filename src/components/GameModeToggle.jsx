export default function GameModeToggle({ mode, onChange }) {
  return (
    <div className="option-group">
      <span className="option-label">Game mode</span>
      <div className="segmented">
        <button type="button" className={mode === 'solo' ? 'active' : ''} onClick={() => onChange('solo')}>
          Solo
        </button>
        <button type="button" className={mode === 'multiplayer' ? 'active' : ''} onClick={() => onChange('multiplayer')}>
          Multiplayer
        </button>
      </div>
    </div>
  );
}
