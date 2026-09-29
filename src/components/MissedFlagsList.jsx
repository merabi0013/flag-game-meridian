export default function MissedFlagsList({ missed, getCountry }) {
  if (!missed.length) {
    return (
      <div className="missed-list">
        <h3>Perfect round</h3>
        <p style={{ color: 'var(--parchment-dim)', fontSize: '0.88rem' }}>
          You correctly named every flag. Nicely done.
        </p>
      </div>
    );
  }

  return (
    <div className="missed-list">
      <h3>Flags to review</h3>
      <div className="missed-grid">
        {missed.map((m) => {
          const c = getCountry(m.id);
          return (
            <span className="missed-chip" key={m.id}>
              {c && <img src={c.flagPngSmall} alt="" />}
              {m.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
