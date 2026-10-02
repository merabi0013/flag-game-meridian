import { useEffect, useState } from 'react';
import Button from '../Button';
import { OVERRIDE_FIELD_LABELS } from './overrideFields';

function emptyOverridesForm() {
  return { gamesPlayed: '', questionsAnswered: '', correct: '', incorrect: '', bestScore: '', bestStreak: '' };
}

export default function UserEditor({ userId, detail, loading, error, onSave, onDelete, onClose, currentUserId, saving }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('active');
  const [overrides, setOverrides] = useState(emptyOverridesForm());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!detail) return;
    setName(detail.user.name || '');
    setEmail(detail.user.email || '');
    setStatus(detail.user.status);
    // Pre-fill with computed stats so admins see current values, but we
    // only ever SEND the fields they actually touch (see handleSave).
    setOverrides({
      gamesPlayed: String(detail.stats.gamesPlayed ?? ''),
      questionsAnswered: String(detail.stats.questionsAnswered ?? ''),
      correct: String(detail.stats.correct ?? ''),
      incorrect: String(detail.stats.incorrect ?? ''),
      bestScore: String(detail.stats.bestScore ?? ''),
      bestStreak: String(detail.stats.bestStreak ?? ''),
    });
    setConfirmingDelete(false);
    setFormError(null);
  }, [detail, userId]);

  if (loading) {
    return (
      <div className="panel">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel">
        <p style={{ color: 'var(--rust-bright)' }}>{error}</p>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
    );
  }

  if (!detail) return null;
  const { user } = detail;

  function handleOverrideChange(field, value) {
    if (value !== '' && !/^\d*$/.test(value)) return; // digits only
    setOverrides((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setFormError(null);
    const patch = {};
    if (name.trim() !== (user.name || '')) patch.name = name.trim();
    if ((email.trim() || null) !== (user.email || null)) patch.email = email.trim() || null;
    if (status !== user.status) patch.status = status;

    const statOverrides = {};
    let touchedOverrides = false;
    for (const field of Object.keys(overrides)) {
      const raw = overrides[field];
      const original = detail.stats[field];
      if (raw === '') continue;
      const parsed = parseInt(raw, 10);
      if (!Number.isInteger(parsed)) continue;
      if (parsed !== original) {
        statOverrides[field] = parsed;
        touchedOverrides = true;
      }
    }
    if (touchedOverrides) patch.statOverrides = statOverrides;

    if (Object.keys(patch).length === 0) {
      setFormError('No changes to save.');
      return;
    }

    try {
      await onSave(user.id, patch);
    } catch (err) {
      setFormError(err.message || 'Could not save changes.');
    }
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>{user.name || '(no name)'}</h2>
          <p className="panel-sub" style={{ margin: 0 }}>
            {user.providers && user.providers.length ? user.providers.join(' + ') : 'no sign-in linked'} · joined {new Date(user.createdAt).toLocaleDateString()}
            {user.isAdmin && ' · administrator'}
            {!user.isVerifiedIdentity && ' · unverified placeholder record'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      <div className="admin-editor-grid">
        <div className="admin-field">
          <label htmlFor="edit-name">Display name</label>
          <input id="edit-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div className="admin-field">
          <label htmlFor="edit-email">Email</label>
          <input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
        </div>
        <div className="admin-field">
          <label htmlFor="edit-status">Account status</label>
          <select id="edit-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>Game performance</h3>
      <p className="admin-form-note" style={{ marginBottom: 12 }}>
        These are stored as an override on top of the player's real game history — their per-category breakdown and
        recent games are never rewritten, only these six top-line numbers as displayed.
      </p>
      <div className="admin-editor-grid">
        {Object.entries(OVERRIDE_FIELD_LABELS).map(([field, label]) => (
          <div className="admin-field" key={field}>
            <label htmlFor={`edit-${field}`}>{label}</label>
            <input
              id={`edit-${field}`}
              type="text"
              inputMode="numeric"
              value={overrides[field]}
              onChange={(e) => handleOverrideChange(field, e.target.value)}
            />
          </div>
        ))}
      </div>

      {formError && <p style={{ color: 'var(--rust-bright)', fontSize: '0.85rem', marginBottom: 10 }}>{formError}</p>}

      <div className="admin-editor-actions">
        <div className="admin-editor-actions-left">
          <Button variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>

        {confirmingDelete ? (
          <span className="admin-confirm-row">
            <span className="admin-confirm-text">Permanently delete this user and their game history?</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
            <Button variant="danger-ghost" size="sm" onClick={() => onDelete(user.id)}>Delete user</Button>
          </span>
        ) : (
          <Button
            variant="danger-ghost"
            size="sm"
            disabled={user.id === currentUserId}
            title={user.id === currentUserId ? "You can't delete your own account" : undefined}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete user
          </Button>
        )}
      </div>
    </div>
  );
}
