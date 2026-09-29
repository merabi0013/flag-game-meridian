const ACTION_LABELS = {
  CREATE_USER: 'Created user',
  MODIFY_USER: 'Modified user',
  DELETE_USER: 'Deleted user',
};

export default function AuditLogList({ entries }) {
  if (!entries || !entries.length) {
    return <p className="panel-sub">No administrative actions recorded yet.</p>;
  }

  return (
    <div className="recent-list">
      {entries.map((e) => (
        <div className="recent-row" key={e.id}>
          <span className="r-cat">
            {ACTION_LABELS[e.action] || e.action}
            {e.targetName ? ` — ${e.targetName}` : ''}
            <br />
            <span style={{ color: 'var(--parchment-dim)', fontWeight: 400, fontSize: '0.8rem' }}>{e.summary}</span>
          </span>
          <span className="r-meta">
            {e.adminName || e.adminEmail || 'unknown admin'}
            <br />
            {new Date(e.at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
