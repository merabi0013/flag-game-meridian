export default function ProgressBar({ index, total }) {
  const pct = total ? Math.round((index / total) * 100) : 0;
  return (
    <div className="progress-bar">
      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
