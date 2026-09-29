import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { labelForCategory, countriesForCategory } from '../utils/categories';
import { ALL_COUNTRIES } from '../data/countries';
import { formatDurationMs } from '../utils/ranking';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { useWarnBeforeUnload } from '../hooks/useWarnBeforeUnload';
import { useEnterToAdvance } from '../hooks/useEnterToAdvance';
import { useAuthContext } from '../context/AuthContext';
import FlagDisplay from '../components/FlagDisplay';
import ProgressBar from '../components/ProgressBar';
import AnswerOption from '../components/AnswerOption';
import AnswerInput from '../components/AnswerInput';
import Button from '../components/Button';
import MultiplayerResults from './MultiplayerResults';

function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Mirrors screens/Game.jsx's GameSession almost exactly -- same
 * FlagDisplay/AnswerOption/AnswerInput components, same hint/skip/advance
 * flow -- the only real differences are the current-player panel (score,
 * streak, live total time) in place of Solo's single score/streak pills,
 * and using useMultiplayerGame() instead of useGame(). No matching or
 * scoring logic is duplicated here; see utils/multiplayerLogic.js.
 *
 * Only the CURRENT player's stats are shown during play, by design (see
 * README "Multiplayer in-game display") -- the full scoreboard only
 * appears once, on the results screen after the game ends.
 */
export default function MultiplayerGameSession({ categoryId, paidPool, params, ErrorPanel }) {
  const { user } = useAuthContext();
  const navigate = useNavigate();

  const playerNames = useMemo(() => (params.get('players') || '').split('|').filter(Boolean), [params]);

  const config = useMemo(
    () => ({
      categoryId,
      difficulty: params.get('difficulty') || 'normal',
      timerEnabled: params.get('timer') === '1',
      timerMinutes: parseFloat(params.get('minutes')) || 3,
      questionCount: parseInt(params.get('count'), 10) || 20,
      allCountries: ALL_COUNTRIES,
      pool: paidPool || undefined,
      playerNames,
      guessingOrder: params.get('order') === 'randomized' ? 'randomized' : 'written',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryId, params.toString(), paidPool]
  );

  const { state, country, player, submitAnswer, useHint, skip, advance } = useMultiplayerGame(config, user);
  useWarnBeforeUnload(!state.ended && !state.error && state.questions?.length > 0);
  // Enter = "Next flag", but only while that button is actually enabled.
  useEnterToAdvance(!state.ended && !state.error && state.answered, advance);
  const [hintUsed, setHintUsed] = useState(false);

  // Ticks once a second purely to force a re-render while a turn is in
  // progress, so the live "Total time" display below keeps counting up
  // rather than only updating when a turn resolves. The actual
  // authoritative time bookkeeping happens in the reducer
  // (utils/multiplayerLogic.js), not here -- this never writes state.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state.answered || state.ended) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [state.answered, state.ended, state.index]);

  const questionKey = state.questions?.[state.index]?.id;

  useEffect(() => {
    setHintUsed(false);
  }, [questionKey]);

  function handlePlayAgain() {
    const usp = new URLSearchParams({
      mode: 'multiplayer',
      category: config.categoryId,
      difficulty: config.difficulty,
      timer: config.timerEnabled ? '1' : '0',
      minutes: String(config.timerMinutes),
      count: String(config.questionCount),
      order: state.guessingOrder || config.guessingOrder,
      players: playerNames.join('|'),
    });
    // See the matching comment in Game.jsx: client-side navigation, so the
    // router's basename is applied and no server request is made.
    navigate({ pathname: '/game', search: `?${usp.toString()}` });
  }

  function handleHint() {
    if (state.answered || hintUsed) return;
    setHintUsed(true);
    useHint();
  }

  if (state.error) {
    return <ErrorPanel title="Couldn't start this multiplayer game" message={state.error} />;
  }

  const pool = paidPool || countriesForCategory(config.categoryId, ALL_COUNTRIES);

  const liveTurnMs = !state.ended && !state.answered ? Math.max(0, Date.now() - state.turnStartedAt) : 0;
  const liveTotalMs = player ? player.totalTimeMs + liveTurnMs : 0;

  return (
    <main className="game-shell">
      <div className="container">
        {!state.ended && (
          <>
            <div className="game-topbar">
              <div>
                <span className="eyebrow">{labelForCategory(config.categoryId)} · Multiplayer</span>
                <div className="game-progress">
                  Flag {state.index + 1} of {state.questions.length}
                </div>
                <ProgressBar index={state.index} total={state.questions.length} />
              </div>
              {state.timerEnabled && (
                <div className="stat-pills">
                  <div className={`stat-pill timer${state.timeRemaining <= 10 ? ' low' : ''}`}>
                    <b>{formatSeconds(state.timeRemaining)}</b>
                    <span>Time left</span>
                  </div>
                </div>
              )}
            </div>

            <div className="panel" style={{ marginBottom: 20, textAlign: 'center' }}>
              <span className="eyebrow">Current player</span>
              <h2 style={{ margin: '4px 0 14px' }}>🎯 {player?.name}</h2>
              <div className="stat-pills" style={{ justifyContent: 'center' }}>
                <div className="stat-pill">
                  <b>{player?.score ?? 0}</b>
                  <span>Score</span>
                </div>
                <div className="stat-pill streak">
                  <b>{player?.streak ?? 0}</b>
                  <span>Streak</span>
                </div>
                <div className="stat-pill">
                  <b>{formatDurationMs(liveTotalMs)}</b>
                  <span>Total time</span>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="play-area">
          {state.ended && state.result ? (
            <MultiplayerResults
              result={state.result}
              onPlayAgain={handlePlayAgain}
              syncNote={
                user
                  ? 'Saved to your account.'
                  : 'Saved to this browser. Sign in to keep multiplayer history across devices.'
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
                          state.answered && !state.lastAnswer?.correct && opt.id === state.lastAnswer?.chosenId
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

                <div
                  className={`feedback-line${
                    state.lastHint && !state.answered ? ' hint' : state.answered ? (state.lastAnswer?.correct ? ' correct' : ' wrong') : ''
                  }`}
                >
                  {state.answered
                    ? state.lastAnswer?.correct
                      ? `${state.lastAnswer.playerName} got it — ${state.lastAnswer.countryName} (+${state.lastAnswer.gained})`
                      : `${state.lastAnswer.playerName} missed it. That's ${state.lastAnswer.countryName}.`
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
