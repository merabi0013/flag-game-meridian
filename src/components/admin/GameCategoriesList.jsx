import { useState } from 'react';
import Button from '../Button';

const CURRENCY_SYMBOLS = { usd: '$', eur: '\u20ac', gbp: '\u00a3' };

function centsToInput(cents) {
  return (cents / 100).toFixed(2);
}
function inputToCents(value) {
  const n = Math.round(parseFloat(value) * 100);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Admin-only management for every backend-registered category (paid
 * world maps, Historical maps). This is the ONLY place `premium` can be
 * changed -- see server/routes/admin.js's field allowlist, which rejects
 * anything else that might try to touch it. Free-by-default (a new
 * Historical map seeds with premium=false) shows here as "Free"; an
 * admin can toggle it to Premium individually, per category, at any
 * time.
 */
export default function GameCategoriesList({ categories, onSave }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [errors, setErrors] = useState({});

  function draftFor(cat) {
    return drafts[cat.categoryId] || { enabled: cat.enabled, premium: cat.premium, price: centsToInput(cat.priceCents) };
  }

  function updateDraft(categoryId, patch) {
    setDrafts((prev) => ({ ...prev, [categoryId]: { ...draftFor({ categoryId, ...prev[categoryId] }), ...patch } }));
  }

  async function handleSave(cat) {
    const draft = draftFor(cat);
    setSavingId(cat.categoryId);
    setErrors((prev) => ({ ...prev, [cat.categoryId]: null }));
    try {
      await onSave(cat.categoryId, {
        enabled: draft.enabled,
        premium: draft.premium,
        priceCents: inputToCents(draft.price),
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[cat.categoryId];
        return next;
      });
    } catch (err) {
      setErrors((prev) => ({ ...prev, [cat.categoryId]: err.message || 'Could not save.' }));
    } finally {
      setSavingId(null);
    }
  }

  if (!categories || !categories.length) {
    return <p className="panel-sub">No backend-registered categories yet.</p>;
  }

  return (
    <div className="admin-user-table-wrap">
      <table className="admin-user-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Enabled</th>
            <th>Premium</th>
            <th>Price</th>
            <th>Owners</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const draft = draftFor(cat);
            const symbol = CURRENCY_SYMBOLS[cat.currency] || '';
            const dirty = !!drafts[cat.categoryId];
            return (
              <tr key={cat.categoryId}>
                <td>
                  <div className="admin-user-row-name">{cat.name}</div>
                  <div className="admin-user-row-email">{cat.categoryId}</div>
                </td>
                <td>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) => updateDraft(cat.categoryId, { enabled: e.target.checked })}
                    />
                    <span className="track" />
                  </label>
                </td>
                <td>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={draft.premium}
                      onChange={(e) => updateDraft(cat.categoryId, { premium: e.target.checked })}
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
                      disabled={!draft.premium}
                      onChange={(e) => updateDraft(cat.categoryId, { price: e.target.value })}
                    />
                  </div>
                  <span className="admin-form-note">{symbol}{draft.price}</span>
                </td>
                <td>{cat.ownerCount}</td>
                <td>
                  <Button variant="primary" size="sm" disabled={!dirty || savingId === cat.categoryId} onClick={() => handleSave(cat)}>
                    {savingId === cat.categoryId ? 'Saving…' : 'Save'}
                  </Button>
                  {errors[cat.categoryId] && (
                    <p style={{ color: 'var(--rust-bright)', fontSize: '0.78rem', marginTop: 6 }}>{errors[cat.categoryId]}</p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
