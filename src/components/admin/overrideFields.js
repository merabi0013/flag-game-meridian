// Single shared source for the six explicitly-approved editable stat
// fields' display labels, so UserEditor.jsx doesn't hardcode them
// separately from what the backend actually accepts (see server's
// lib/userStats.js OVERRIDE_FIELDS — this list must match it).
export const OVERRIDE_FIELD_LABELS = {
  gamesPlayed: 'Games played',
  questionsAnswered: 'Questions answered',
  correct: 'Correct answers',
  incorrect: 'Incorrect answers',
  bestScore: 'Best score',
  bestStreak: 'Best streak',
};
