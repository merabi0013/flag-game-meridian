const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
];

export default function DifficultySelector({ difficulty, onChange }) {
  return (
    <div className="option-group">
      <span className="option-label">Difficulty</span>
      <div className="segmented">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.value}
            type="button"
            className={difficulty === d.value ? 'active' : ''}
            onClick={() => onChange(d.value)}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
