import { useEffect, useState } from 'react';

/**
 * Renders a country's flag fully visible inside the existing responsive
 * flag-frame window (see styles/game.css .flag-frame / .flag-frame img —
 * unchanged from the previous vanilla-JS version, object-fit: contain so
 * wide flags letterbox and narrow flags pillarbox instead of cropping).
 *
 * On a load error it tries the PNG fallback once, then falls back to a
 * text notice rather than a broken image icon.
 */
export default function FlagDisplay({ country }) {
  const [stage, setStage] = useState('svg'); // 'svg' | 'png' | 'broken'

  useEffect(() => {
    setStage('svg');
  }, [country?.id]);

  if (!country) return null;

  function handleError() {
    setStage((prev) => (prev === 'svg' ? 'png' : 'broken'));
  }

  return (
    <div className={`flag-frame${stage === 'broken' ? ' broken' : ''}`}>
      {stage !== 'broken' && (
        <img
          src={stage === 'svg' ? country.flagSvg : country.flagPng}
          alt="Flag to identify"
          draggable="false"
          onError={handleError}
        />
      )}
      <div className="flag-fallback">
        Flag image unavailable right now — you can still answer from memory, or skip.
      </div>
    </div>
  );
}
