import { useState } from 'react';
import Button from '../Button';

export default function CreateUserForm({ onCreate, onCancel }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [provider, setProvider] = useState('manual');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Display name is required.');
      return;
    }
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), email: email.trim() || undefined, provider });
      setName('');
      setEmail('');
      setProvider('manual');
    } catch (err) {
      setError(err.message || 'Could not create user.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2 style={{ marginBottom: 4 }}>Create user</h2>
      <p className="panel-sub">
        This creates an application record for tracking purposes only — it is <em>not</em> a real Google/Discord
        login. If the person later signs in for real, that will create a separate account; this won't automatically
        link to it.
      </p>

      <div className="admin-editor-grid">
        <div className="admin-field">
          <label htmlFor="create-name">Display name</label>
          <input id="create-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </div>
        <div className="admin-field">
          <label htmlFor="create-email">Email (optional)</label>
          <input id="create-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
        </div>
        <div className="admin-field">
          <label htmlFor="create-provider">Labeled as</label>
          <select id="create-provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="manual">Manual / imported record</option>
            <option value="google">Google (unverified placeholder)</option>
            <option value="discord">Discord (unverified placeholder)</option>
          </select>
        </div>
      </div>

      {error && <p style={{ color: 'var(--rust-bright)', fontSize: '0.85rem', marginBottom: 10 }}>{error}</p>}

      <div className="admin-editor-actions">
        <div className="admin-editor-actions-left">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create user'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}
