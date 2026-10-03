/**
 * The three visual shapes of a FREE category tile. Which one a category
 * gets is decided by its group in the category tree (see CategoryGrid),
 * never by the category itself.
 */
function flagCountText(count) {
  return `${count} flag${count === 1 ? '' : 's'}`;
}

/** Compact grid tile (continents, regions, ...). */
export function CategoryCard({ id, label, count, selected, onClick }) {
  return (
    <button type="button" data-category={id} className={`category-card${selected ? ' selected' : ''}`} onClick={onClick}>
      <span className="cc-name">{label}</span>
      <span className="cc-count">{flagCountText(count)}</span>
    </button>
  );
}

/** Wide card pinned above the tabs (a group marked `featured`, e.g. World). */
export function WorldCard({ id, label, count, selected, onClick }) {
  return (
    <button type="button" data-category={id} className={`world-card${selected ? ' selected' : ''}`} onClick={onClick}>
      <span>
        <span className="cc-name">🌍 {label}</span>
        <br />
        <span className="cc-count">{flagCountText(count)}</span>
      </span>
      <span className="btn btn-sm btn-ghost" aria-hidden="true">
        Select
      </span>
    </button>
  );
}

/** Wide one-per-row card (a group with `layout: "list"`, e.g. Historical). */
export function ListCard({ id, label, count, selected, onClick }) {
  return (
    <button type="button" data-category={id} className={`world-card${selected ? ' selected' : ''}`} onClick={onClick}>
      <span>
        <span className="cc-name">🌍 {label}</span>
        <br />
        <span className="cc-count">{flagCountText(count)}</span> <span className="badge badge-owned">Free</span>
      </span>
      <span className="btn btn-sm btn-ghost" aria-hidden="true">
        Select
      </span>
    </button>
  );
}
