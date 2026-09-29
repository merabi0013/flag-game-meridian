import { useEffect, useRef, useState } from 'react';
import Button from './Button';

export default function AnswerInput({ pool, difficulty, answered, lastAnswer, questionKey, onSubmit, onAdvance }) {
  const [value, setValue] = useState('');
  const [matches, setMatches] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);

  // Reset per-question local state and refocus when a new flag appears.
  useEffect(() => {
    setValue('');
    setMatches([]);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, [questionKey]);

  const showAutocomplete = difficulty === 'normal';

  function updateMatches(text) {
    const q = text.trim().toLowerCase();
    if (!q) {
      setMatches([]);
      return;
    }
    const found = pool
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
      .slice(0, 6);
    setMatches(found);
    setActiveIndex(-1);
  }

  function handleChange(e) {
    setValue(e.target.value);
    if (showAutocomplete) updateMatches(e.target.value);
  }

  function submit(text) {
    if (answered || !text.trim()) return;
    setMatches([]);
    onSubmit(text);
  }

  function pick(country) {
    setValue(country.name);
    setMatches([]);
    submit(country.name);
  }

  function handleKeyDown(e) {
    if (showAutocomplete && matches.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Escape') {
        setMatches([]);
        return;
      }
      if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        pick(matches[activeIndex]);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (answered) onAdvance();
      else submit(value);
    }
  }

  const stateClass = answered ? (lastAnswer?.correct ? ' state-correct' : ' state-wrong') : '';

  return (
    <div style={{ position: 'relative' }}>
      <div className="answer-input-row">
        <input
          ref={inputRef}
          type="text"
          className={`answer-input${stateClass}`}
          placeholder="Type a country name…"
          autoComplete="off"
          spellCheck="false"
          value={answered && lastAnswer && !lastAnswer.correct ? '' : value}
          disabled={answered}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <Button variant="primary" type="button" disabled={answered} onClick={() => submit(value)}>
          Submit
        </Button>
      </div>
      {showAutocomplete && (
        <div className={`autocomplete-list${matches.length ? ' open' : ''}`}>
          {matches.map((c, i) => (
            <div
              key={c.id}
              className={`autocomplete-item${i === activeIndex ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
            >
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
