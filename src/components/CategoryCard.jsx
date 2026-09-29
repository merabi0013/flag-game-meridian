export function CategoryCard({ label, count, selected, onClick }) {
  return (
    <button type="button" className={`category-card${selected ? ' selected' : ''}`} onClick={onClick}>
      <span className="cc-name">{label}</span>
      <span className="cc-count">
        {count} flag{count === 1 ? '' : 's'}
      </span>
    </button>
  );
}

export function WorldCard({ count, selected, onClick }) {
  return (
    <button type="button" className={`world-card${selected ? ' selected' : ''}`} onClick={onClick}>
      <span>
        <span className="cc-name">🌍 World</span>
        <br />
        <span className="cc-count">{count} flags</span>
      </span>
      <span className="btn btn-sm btn-ghost" aria-hidden="true">
        Select
      </span>
    </button>
  );
}
