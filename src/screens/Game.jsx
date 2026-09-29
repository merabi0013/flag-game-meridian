import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ALL_COUNTRIES } from '../data/countries';
import { labelForCategory, countriesForCategory, isPaidCategory } from '../utils/categories';
import { useGame } from '../hooks/useGame';
import { useAuthContext } from '../context/AuthContext';
import { usePaidCategoryCountries } from '../hooks/usePaidCategoryCountries';
import { useWarnBeforeUnload } from '../hooks/useWarnBeforeUnload';
import FlagDisplay from '../components/FlagDisplay';
import ProgressBar from '../components/ProgressBar';
import ScoreDisplay from '../components/ScoreDisplay';
import AnswerOption from '../components/AnswerOption';
import AnswerInput from '../components/AnswerInput';
import Button from '../components/Button';
import Results from './Results';
import MultiplayerGameSession from './MultiplayerGame';

function ErrorPanel({ title, message }) {
  return (
    <main className="game-shell">
      <div className="container">
        <div className="state-block">
          <svg className="compass-rose" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          </svg>
          <h3>{title}</h3>
          <p>{message}</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 14 }}>
            Back to category picker
          </Link>
        </div>
      </div>
    </main>
  );
}

/**
 * Outer gate: for a paid category, this is where "does the backend
 * actually say I own this" gets checked before any gameplay renders at
 * all -- GET /api/categories/:id/countries re-verifies auth + entitlement
 * server-side regardless of what the Home screen's UI showed (see
 * server/routes/categories.js). A free category skips straight to
 * GameSession, unchanged from before paid categories existed.
 */
export default function Game() {
  const [params] = useSearchParams();
  const categoryId = params.get('category') || 'world';
  const paid = isPaidCategory(categoryId);

  const { countries: paidCountries, loading: paidLoading, error: paidError } = usePaidCategoryCountries(categoryId, paid);

  if (paid && paidLoading) {
    return (
      <main className="game-shell">
        <div className="container state-block">
          <div className="spinner" />
          <p>Checking access…</p>
        </div>
      </main>
    );
  }

  if (paid && paidError) {
    return (
      <ErrorPanel
        title="You don't have access to this category"
        message={`${paidError} Head back to the category picker to purchase it.`}
      />
    );
  }

  return <ModeRouter categoryId={categoryId} paidPool={paid ? paidCountries : null} params={params} />;
}

function ModeRouter({ categoryId, paidPool, params }) {
  if (params.get('mode') === 'multiplayer') {
    return <MultiplayerGameSession categoryId={categoryId} paidPool={paidPool} params={params} ErrorPanel={ErrorPanel} />;
  }
  return <GameSession categoryId={categoryId} paidPool={paidPool} params={params} />;
}

function GameSession({ categoryId, paidPool, params }) {
  const { user } = useAuthContext();

  const config = useMemo(
    () => ({
      categoryId,
      difficulty: params.get('difficulty') || 'normal',
      timerEnabled: params.get('timer') === '1',
      timerMinutes: parseFloat(params.get('minutes')) || 3,
      questionCount: parseInt(params.get('count'), 10) || 20,
      allCountries: ALL_COUNTRIES,
      pool: paidPool || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryId, params.toString(), paidPool]
  );

  const { state, country, submitAnswer, useHint, skip, advance } = useGame(config, user);
  useWarnBeforeUnload(!state.ended && !state.error && state.questions?.length > 0);
  const [hintUsed, setHintUsed] = useState(false);

  const questionKey = state.questions?.[state.index]?.id;

  function handlePlayAgain() {
    const usp = new URLSearchParams({
      category: config.categoryId,
      difficulty: config.difficulty,
      timer: config.timerEnabled ? '1' : '0',
      minutes: String(config.timerMinutes),
      count: String(config.questionCount),
    });
    // A hard navigation (not react-router's navigate) is intentional here:
    // config above is derived from the URL's query string, so reloading
    // with a new query string is the simplest way to get a fully reset
    // game. import.meta.env.BASE_URL (e.g. "/" or "/flag-game-meridian/")
    // is prefixed so this still resolves correctly when the app is hosted
    // under a subpath, e.g. on GitHub Pages.
    window.location.href = `${import.meta.env.BASE_URL}game?${usp.toString()}`;
  }

  function handleHint() {
    if (state.answered || hintUsed) return;
    setHintUsed(true);
    useHint();
  }

  // One hint per question -- reset the lock whenever the question changes.
  useEffect(() => {
    setHintUsed(false);
  }, [questionKey]);

  if (state.error) {
    return <ErrorPanel title="No flags found for this category" message="Something's off with that selection." />;
  }

  const pool = paidPool || countriesForCategory(config.categoryId, ALL_COUNTRIES);

  return (
    <main className="game-shell">
      <div className="container">
        {!state.ended && (
          <div className="game-topbar">
            <div>
              <span className="eyebrow">{labelForCategory(config.categoryId)}</span>
              <div className="game-progress">
                Flag {state.index + 1} of {state.questions.length}
              </div>
              <ProgressBar index={state.index} total={state.questions.length} />
            </div>
            <ScoreDisplay
              score={state.score}
              streak={state.streak}
              timerEnabled={state.timerEnabled}
              timeRemaining={state.timeRemaining}
            />
          </div>
        )}

        <div className="play-area">
          {state.ended && state.result ? (
            <Results
              result={state.result}
              onPlayAgain={handlePlayAgain}
              syncNote={
                user
                  ? 'Saved to your account.'
                  : 'Saved to this browser. Sign in to keep results across devices.'
              }
            />
          ) : (
            <div className="flag-card">
              <FlagDisplay country={country} />

              <div className="answer-zone">
                {config.difficulty === 'easy' ? (
                  <div className="mc-grid">
                    {(state.currentOptions || []).map((opt) => (
                      <AnswerOption
                        key={opt.id}
                        option={opt}
                        answered={state.answered}
                        isCorrectOption={state.answered && opt.id === state.lastAnswer?.countryId}
                        isChosenWrong={
                          state.answered &&
                          !state.lastAnswer?.correct &&
                          opt.id === state.lastAnswer?.chosenId
                        }
                        onSelect={(id) => {
                          if (state.answered) return;
                          submitAnswer(id);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <AnswerInput
                    pool={pool}
                    difficulty={config.difficulty}
                    answered={state.answered}
                    lastAnswer={state.lastAnswer}
                    questionKey={questionKey}
                    onSubmit={submitAnswer}
                    onAdvance={advance}
                  />
                )}

                <div className={`feedback-line${state.lastHint && !state.answered ? ' hint' : state.answered ? (state.lastAnswer?.correct ? ' correct' : ' wrong') : ''}`}>
                  {state.answered
                    ? state.lastAnswer?.correct
                      ? `Correct — ${state.lastAnswer.countryName} (+${state.lastAnswer.gained})`
                      : `Not quite. That's ${state.lastAnswer?.countryName}.`
                    : state.lastHint?.type === 'text'
                    ? state.lastHint.text
                    : ''}
                </div>

                <div className="action-row">
                  <div className="action-row-left">
                    <Button variant="ghost" size="sm" disabled={state.answered || hintUsed} onClick={handleHint}>
                      💡 Hint
                    </Button>
                    <Button variant="ghost" size="sm" disabled={state.answered} onClick={skip}>
                      Skip
                    </Button>
                  </div>
                  <Button variant="primary" disabled={!state.answered} onClick={advance}>
                    Next flag →
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
