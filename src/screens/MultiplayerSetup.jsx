import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { labelForCategory } from '../utils/categories';
import { parseAndValidatePlayers, MIN_PLAYERS } from '../utils/playerNames';
import Button from '../components/Button';

export default function MultiplayerSetup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [namesRaw, setNamesRaw] = useState('');
  const [guessingOrder, setGuessingOrder] = useState('written');

  const categoryId = params.get('category');
  const difficulty = params.get('difficulty') || 'normal';
  const count = params.get('count') || '20';
  // The actual, already-clamped game length the engine will use (Home.jsx
  // resolves "10 / 20 / All / Custom" against the real category size
  // before this screen ever sees it) -- comparing against this number,
  // not the raw setting, is what makes "All" and "Custom" behave
  // correctly here too.
  const flagCount = parseInt(count, 10) || 0;

  const { names, errors, valid } = useMemo(() => parseAndValidatePlayers(namesRaw), [namesRaw]);

  // Enforced again in utils/multiplayerLogic.js itself, not just here --
  // this is the UI reflecting that same rule immediately as the host
  // types, not the only place it's applied.
  const mustRandomize = names.length > 0 && flagCount > 0 && names.length > flagCount;

  useEffect(() => {
    if (mustRandomize) setGuessingOrder('randomized');
  }, [mustRandomize]);

  const effectiveOrder = mustRandomize ? 'randomized' : guessingOrder;

  const description = useMemo(() => {
    if (!names.length) return null;
    const playerWord = names.length === 1 ? 'player' : 'players';
    let orderText;
    if (mustRandomize) {
      orderText = `Because there are more players (${names.length}) than flags (${flagCount}), the guessing order has been automatically randomized so every flag is assigned fairly.`;
    } else if (effectiveOrder === 'randomized') {
      orderText = 'The guessing order will be randomized before the game begins.';
    } else {
      orderText = 'Players will guess in the order they were entered above, looping back to the first player as needed.';
    }
    return `${names.length} ${playerWord} will take turns guessing ${count} ${labelForCategory(categoryId)} flags on ${difficulty} difficulty. Each player keeps an individual score, streak, and total time. ${orderText}`;
  }, [names.length, count, categoryId, difficulty, effectiveOrder, mustRandomize, flagCount]);

  function handleStart() {
    if (!valid || names.length < MIN_PLAYERS) return;
    const gameParams = new URLSearchParams({
      mode: 'multiplayer',
      category: categoryId,
      difficulty,
      timer: params.get('timer') || '0',
      minutes: params.get('minutes') || '3',
      count,
      order: effectiveOrder,
      players: names.join('|'),
    });
    navigate(`/game?${gameParams.toString()}`);
  }

  if (!categoryId) {
    return (
      <main className="setup">
        <div className="container state-block">
          <h3>No category selected</h3>
          <p>Head back and choose a category before setting up teams.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 14 }}>
            Back home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="setup">
      <div className="container">
        <div className="setup-grid">
          <div className="panel">
            <h2>Multiplayer setup</h2>
            <p className="panel-sub">
              {labelForCategory(categoryId)} · {difficulty} difficulty · {count} flags · Multiplayer
            </p>

            <div className="option-group">
              <span className="option-label">Player names</span>
              <textarea
                className="player-names-input"
                placeholder={'Enter player names — one per line, or separated by commas\ne.g. Alice, Bob\nCharlie\nDavid, Eve'}
                value={namesRaw}
                onChange={(e) => setNamesRaw(e.target.value)}
              />
              <p className="admin-form-note">Players: {names.length}</p>
              {errors.map((err) => (
                <p key={err} style={{ color: 'var(--rust-bright)', fontSize: '0.85rem', marginTop: 4 }}>
                  {err}
                </p>
              ))}
              {mustRandomize && (
                <p className="admin-form-note" style={{ color: 'var(--brass-bright)', marginTop: 8 }}>
                  ⓘ There are more players ({names.length}) than flags ({flagCount}). Guessing order has been
                  automatically randomized so every flag can be assigned fairly.
                </p>
              )}
            </div>

            <div className="option-group">
              <span className="option-label">Guessing order</span>
              <div className="segmented">
                <button
                  type="button"
                  className={effectiveOrder === 'written' ? 'active' : ''}
                  onClick={() => setGuessingOrder('written')}
                  aria-pressed={effectiveOrder === 'written'}
                  disabled={mustRandomize}
                  title={mustRandomize ? 'Unavailable: more players than flags' : undefined}
                >
                  Written order
                </button>
                <button
                  type="button"
                  className={effectiveOrder === 'randomized' ? 'active' : ''}
                  onClick={() => setGuessingOrder('randomized')}
                  aria-pressed={effectiveOrder === 'randomized'}
                >
                  Randomized
                </button>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>Game configuration</h2>
            <p className="panel-sub">Review before starting.</p>

            <table className="category-perf-table" style={{ marginBottom: 18 }}>
              <tbody>
                <tr><td>Mode</td><td>Multiplayer</td></tr>
                <tr><td>Category</td><td>{labelForCategory(categoryId)}</td></tr>
                <tr><td>Difficulty</td><td style={{ textTransform: 'capitalize' }}>{difficulty}</td></tr>
                <tr><td>Flags</td><td>{count}</td></tr>
                <tr><td>Players</td><td>{names.length || '—'}</td></tr>
                <tr><td>Guessing order</td><td style={{ textTransform: 'capitalize' }}>{effectiveOrder}</td></tr>
              </tbody>
            </table>

            {description && <p className="panel-sub" style={{ marginBottom: 18 }}>{description}</p>}

            <Button variant="primary" block disabled={!valid || names.length < MIN_PLAYERS} onClick={handleStart}>
              Start game
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
