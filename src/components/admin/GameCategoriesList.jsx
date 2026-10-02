import { useState } from 'react';
import Button from '../Button';

const CURRENCY_SYMBOLS = { usd: '$', eur: '€', gbp: '£' };

function centsToInput(cents) {
  return (cents / 100).toFixed(2);
}
function inputToCents(value) {
  const n = Math.round(parseFloat(value) * 100);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Admin-only management of every category in the tree: Free or Paid,
 * enabled, price. `type` is the value the whole app obeys — the backend
 * checks it on every request and the browser never decides it. Only
 * categories whose flags are hosted by the backend can be Paid (bundled
 * flag data is public inside the app), which is why the type switch is
 * disabled for the others.
 */
export default function GameCategoriesList({ categories, onSave }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [errors, setErrors] = useState({});

  function draftFor(cat) {
    return drafts[cat.id] || { enabled: cat.enabled, paid: cat.type === 'paid', price: centsToInput(cat.priceCents) };
  }

  function updateDraft(cat, patch) {
    setDrafts((prev) => ({ ...prev, [cat.id]: { ...draftFor(cat), ...prev[cat.id], ...patch } }));
  }

  async function handleSave(cat) {
    const draft = draftFor(cat);
    setSavingId(cat.id);
    setErrors((prev) => ({ ...prev, [cat.id]: null }));
    try {
      await onSave(cat.id, {
        enabled: draft.enabled,
        type: draft.paid ? 'paid' : 'default',
        priceCents: inputToCents(draft.price),
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[cat.id];
        return next;
      });
    } catch (err) {
      setErrors((prev) => ({ ...prev, [cat.id]: err.message || 'Could not save.' }));
    } finally {
      setSavingId(null);
    }
  }

  if (!categories || !categories.length) {
    return <p className="panel-sub">No categories registered yet.</p>;
  }

  return (
    <div className="admin-user-table-wrap">
      <table className="admin-user-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Enabled</th>
            <th>Paid</th>
            <th>Price</th>
            <th>Owners</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const draft = draftFor(cat);
            const symbol = CURRENCY_SYMBOLS[cat.currency] || '';
            const dirty = !!drafts[cat.id];
            const canBePaid = cat.hosting === 'remote';
            return (
              <tr key={cat.id}>
                <td>
                  <div className="admin-user-row-name">{cat.name}</div>
                  <div className="admin-user-row-email">
                    {cat.id} · {cat.groupName}
                    {cat.flagNumber ? ` · ${cat.flagNumber} flags` : ''}
                  </div>
                </td>
                <td>
                  <label className="switch">
                    <input type="checkbox" checked={draft.enabled} onChange={(e) => updateDraft(cat, { enabled: e.target.checked })} />
                    <span className="track" />
                  </label>
                </td>
                <td>
                  <label className="switch" title={canBePaid ? '' : 'Bundled flag data is public, so this category cannot be paid.'}>
                    <input
                      type="checkbox"
                      checked={draft.paid}
                      disabled={!canBePaid}
                      onChange={(e) => updateDraft(cat, { paid: e.target.checked })}
                    />
                    <span className="track" />
                  </label>
                </td>
                <td>
                  <div className="admin-field" style={{ maxWidth: 100 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.price}
                      disabled={!draft.paid}
                      onChange={(e) => updateDraft(cat, { price: e.target.value })}
                    />
                  </div>
                  <span className="admin-form-note">{symbol}{draft.price}</span>
                </td>
                <td>{cat.ownerCount}</td>
                <td>
                  <Button variant="primary" size="sm" disabled={!dirty || savingId === cat.id} onClick={() => handleSave(cat)}>
                    {savingId === cat.id ? 'Saving…' : 'Save'}
                  </Button>
                  {errors[cat.id] && <p style={{ color: 'var(--rust-bright)', fontSize: '0.78rem', marginTop: 6 }}>{errors[cat.id]}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
