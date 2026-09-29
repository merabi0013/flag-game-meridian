import { useState } from 'react';
import Button from '../Button';

function Badges({ user }) {
  return (
    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {user.isAdmin && <span className="badge badge-admin">Admin</span>}
      {user.status === 'disabled' && <span className="badge badge-disabled">Disabled</span>}
      {!user.isVerifiedIdentity && <span className="badge badge-unverified">Unverified</span>}
    </span>
  );
}

export default function UserTable({
  users,
  pagination,
  search,
  onSearchChange,
  onPageChange,
  selectedId,
  onSelectUser,
  onDeleteUser,
  currentUserId,
}) {
  const [confirmingId, setConfirmingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  async function handleConfirmDelete(id) {
    setDeletingId(id);
    try {
      await onDeleteUser(id);
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  return (
    <div>
      <div className="admin-toolbar">
        <input
          className="admin-search"
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="admin-user-table-wrap">
        <table className="admin-user-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Provider</th>
              <th>Games</th>
              <th>Accuracy</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.id === selectedId ? 'selected' : ''}>
                <td onClick={() => onSelectUser(u.id)} style={{ cursor: 'pointer' }}>
                  <div className="admin-user-row-name">{u.name || '(no name)'}</div>
                  <div className="admin-user-row-email">{u.email || '—'}</div>
                  <Badges user={u} />
                </td>
                <td>{u.provider}</td>
                <td>{u.gamesPlayed}</td>
                <td>{u.accuracy}%</td>
                <td>
                  <div className="admin-row-actions">
                    <Button variant="ghost" size="sm" onClick={() => onSelectUser(u.id)}>
                      Edit
                    </Button>
                    {confirmingId === u.id ? (
                      <span className="admin-confirm-row">
                        <span className="admin-confirm-text">Delete?</span>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>
                          Cancel
                        </Button>
                        <Button
                          variant="danger-ghost"
                          size="sm"
                          disabled={deletingId === u.id}
                          onClick={() => handleConfirmDelete(u.id)}
                        >
                          {deletingId === u.id ? 'Deleting…' : 'Confirm'}
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        disabled={u.id === currentUserId}
                        title={u.id === currentUserId ? "You can't delete your own account" : undefined}
                        onClick={() => setConfirmingId(u.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--parchment-dim)', padding: '20px 10px' }}>
                  No users match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="admin-pagination">
          <Button
            variant="ghost"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => onPageChange(pagination.page - 1)}
          >
            ← Prev
          </Button>
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} users
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => onPageChange(pagination.page + 1)}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
