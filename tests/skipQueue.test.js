import { describe, it, expect } from 'vitest';
import { createInitialState, gameReducer, canSkip, currentCountry } from '../src/utils/gameLogic';
import { ALL_COUNTRIES } from '../src/data/countries';

function newGame(overrides = {}) {
  return createInitialState({
    categoryId: 'world',
    allCountries: ALL_COUNTRIES,
    difficulty: 'normal',
    questionCount: 4,
    timerEnabled: false,
    ...overrides,
  });
}
const ids = (s) => s.questions.map((q) => q.id);
const run = (s, ...actions) => actions.reduce((acc, a) => gameReducer(acc, a), s);
const answerRight = (s) => run(s, { type: 'SUBMIT_ANSWER', value: currentCountry(s).name });

describe('Skip defers a flag to the end of the queue', () => {
  it('rotates the queue (A B C D -> B C D A) without moving progress', () => {
    const s0 = newGame();
    const [a, b, c, d] = ids(s0);
    const s1 = run(s0, { type: 'SKIP' });
    expect(ids(s1)).toEqual([b, c, d, a]);
    expect(s1.index).toBe(0);
    expect(s1.questions).toHaveLength(4);
  });

  it('is not a completed question: no score, streak, correct or incorrect change', () => {
    const s0 = answerRight(newGame()); // streak 1, score > 0
    const s1 = run(s0, { type: 'ADVANCE' }, { type: 'SKIP' });
    expect(s1.score).toBe(s0.score);
    expect(s1.streak).toBe(1);
    expect(s1.correct).toBe(1);
    expect(s1.incorrect).toBe(0);
    expect(s1.missed).toEqual([]);
    expect(s1.skipped).toBe(1);
  });

  it('keeps supporting repeated skips without losing flags (A B C D -> C D A B)', () => {
    const s0 = newGame();
    const [a, b, c, d] = ids(s0);
    const s2 = run(s0, { type: 'SKIP' }, { type: 'SKIP' });
    expect(ids(s2)).toEqual([c, d, a, b]);
    expect([...ids(s2)].sort()).toEqual([a, b, c, d].sort());
  });

  it('shows the skipped flag again and finishes with every flag answered exactly once', () => {
    let s = newGame();
    const [a] = ids(s);
    s = run(s, { type: 'SKIP' });
    const seen = [];
    while (!s.ended) {
      seen.push(currentCountry(s).id);
      s = run(answerRight(s), { type: 'ADVANCE' });
    }
    expect(seen).toHaveLength(4);
    expect(seen[seen.length - 1]).toBe(a);
    expect(s.result.reason).toBe('completed');
    expect(s.result.correct).toBe(4);
    expect(s.result.totalQuestions).toBe(4);
    expect(s.result.skipped).toBe(1);
  });

  it('progress only advances when a flag is answered', () => {
    let s = newGame();
    s = run(s, { type: 'SKIP' }, { type: 'SKIP' });
    expect(s.index).toBe(0); // still "Flag 1 of 4"
    s = run(answerRight(s), { type: 'ADVANCE' });
    expect(s.index).toBe(1);
  });

  it('cannot skip the last remaining flag (no infinite/broken state)', () => {
    let s = newGame({ questionCount: 2 });
    s = run(answerRight(s), { type: 'ADVANCE' });
    expect(canSkip(s)).toBe(false);
    const after = run(s, { type: 'SKIP' });
    expect(after).toBe(s);
  });

  it('cannot skip once the current flag is already answered', () => {
    const s = answerRight(newGame());
    expect(canSkip(s)).toBe(false);
    expect(run(s, { type: 'SKIP' })).toBe(s);
  });

  it('does not touch the timer or start time', () => {
    const s0 = newGame({ timerEnabled: true, timerMinutes: 1 });
    const ticked = run(s0, { type: 'TICK' }, { type: 'TICK' });
    const s1 = run(ticked, { type: 'SKIP' });
    expect(s1.timeRemaining).toBe(ticked.timeRemaining);
    expect(s1.timeTotal).toBe(ticked.timeTotal);
    expect(s1.startedAt).toBe(ticked.startedAt);
  });

  it('rebuilds Easy-mode options for the flag that takes its place', () => {
    const s0 = newGame({ difficulty: 'easy' });
    const s1 = run(s0, { type: 'SKIP' });
    expect(s1.currentOptions.some((o) => o.id === currentCountry(s1).id)).toBe(true);
  });

  it('a skipped flag keeps the hint penalty it already incurred', () => {
    const s0 = newGame({ questionCount: 3 });
    const [a] = ids(s0);
    let s = run(s0, { type: 'USE_HINT' }, { type: 'SKIP' });
    expect(s.hintsUsedThisQuestion).toBe(0);
    // queue is now B C A: answer B and C, and A comes back last
    s = run(answerRight(s), { type: 'ADVANCE' });
    s = run(answerRight(s), { type: 'ADVANCE' });
    expect(currentCountry(s).id).toBe(a);
    expect(s.hintsUsedThisQuestion).toBe(1);
  });
});
