/**
 * One Easy-mode multiple-choice button.
 * State rules (unchanged from the previous vanilla-JS version):
 *   - not answered yet: neutral, clickable
 *   - answered + this is the correct country: green ("correct")
 *   - answered + this was the player's own wrong pick: red ("wrong")
 *   - answered + neither: dimmed neutral, so the right/wrong pair reads
 *     unambiguously at a glance
 */
export default function AnswerOption({ option, answered, isCorrectOption, isChosenWrong, onSelect }) {
  const classes = ['mc-option'];
  if (isCorrectOption) classes.push('correct');
  if (isChosenWrong) classes.push('wrong');

  return (
    <button
      type="button"
      className={classes.join(' ')}
      disabled={answered}
      onClick={() => onSelect(option.id)}
    >
      {option.name}
    </button>
  );
}
