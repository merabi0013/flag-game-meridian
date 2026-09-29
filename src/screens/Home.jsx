import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { countriesForCategory, labelForCategory, isPaidCategory } from '../utils/categories';
import { ALL_COUNTRIES } from '../data/countries';
import { useAuthContext } from '../context/AuthContext';
import { usePaidAccess } from '../hooks/usePaidAccess';
import { usePaidCategoryCountries } from '../hooks/usePaidCategoryCountries';
import CategoryGrid from '../components/CategoryGrid';
import GameModeSelector from '../components/GameModeSelector';
import GameModeToggle from '../components/GameModeToggle';
import { FEATURE_FLAGS } from '../config/appConfig';
import DifficultySelector from '../components/DifficultySelector';
import TimerToggle from '../components/TimerToggle';
import Button from '../components/Button';
import PurchaseModal from '../components/PurchaseModal';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { paidCategories } = usePaidAccess(user);

  const [tab, setTab] = useState('continent');
  const [categoryId, setCategoryId] = useState(null);
  const [length, setLength] = useState('20');
  const [customLength, setCustomLength] = useState(1);
  const [difficulty, setDifficulty] = useState('normal');
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(3);
  const [gameMode, setGameMode] = useState('solo');
  const [purchaseCategoryId, setPurchaseCategoryId] = useState(null);

  const selectedIsPaid = categoryId ? isPaidCategory(categoryId) : false;
  const selectedPaidAccess = selectedIsPaid ? paidCategories[categoryId] : null;
  const canPlaySelectedPaid = selectedPaidAccess && (selectedPaidAccess.owned || selectedPaidAccess.viaAdmin);

  // For a paid category, the real flag count only comes from the
  // entitlement-gated endpoint — the bundled ALL_COUNTRIES has nothing
  // for it (see utils/categories.js). Only fetched once access is
  // actually confirmed, same rule the backend itself enforces.
  const { countries: paidCountries } = usePaidCategoryCountries(categoryId, selectedIsPaid && canPlaySelectedPaid);

  const categoryCount = useMemo(() => {
    if (!categoryId) return 0;
    if (selectedIsPaid) return paidCountries ? paidCountries.length : 0;
    return countriesForCategory(categoryId, ALL_COUNTRIES).length;
  }, [categoryId, selectedIsPaid, paidCountries]);

  const effectiveCount = useMemo(() => {
    if (!categoryId || !categoryCount) return 0;
    if (length === 'all') return categoryCount;
    if (length === 'custom') return Math.min(Math.max(1, customLength), categoryCount);
    return Math.min(parseInt(length, 10), categoryCount);
  }, [categoryId, length, customLength, categoryCount]);

  function selectCategory(id) {
    setCategoryId(id);
    if (!isPaidCategory(id)) {
      const max = countriesForCategory(id, ALL_COUNTRIES).length || 1;
      if (customLength > max) setCustomLength(max);
    }
  }

  function countFor(id) {
    return countriesForCategory(id, ALL_COUNTRIES).length;
  }

  function handlePlay() {
    if (!categoryId || (selectedIsPaid && !canPlaySelectedPaid)) return;
    const params = new URLSearchParams({
      category: categoryId,
      difficulty,
      timer: timerEnabled ? '1' : '0',
      minutes: String(timerMinutes),
      count: String(effectiveCount),
    });
    if (gameMode === 'multiplayer') {
      navigate(`/multiplayer/setup?${params.toString()}`);
    } else {
      navigate(`/game?${params.toString()}`);
    }
  }

  const purchaseCategory = purchaseCategoryId ? paidCategories[purchaseCategoryId] : null;

  return (
    <>
      <header className="hero">
        <div className="graticule" />
        <div className="container">
          <span className="eyebrow hero-kicker">World flag atlas</span>
          <h1>
            Chart the world,
            <br />
            one flag at a time.
          </h1>
          <p className="hero-sub">
            Pick a continent, a region, or the whole world, and see how many flags you can place correctly. Play
            instantly as a guest, or sign in to keep score across sessions.
          </p>
          <div className="hero-actions">
            <a href="#setup" className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Start playing
            </a>
            <Link to="/profile" className="btn btn-ghost">
              View your stats
            </Link>
          </div>
          <div className="hero-stat-strip">
            <div className="hero-stat">
              <b>{ALL_COUNTRIES.length}</b>
              <span>Flags in the atlas</span>
            </div>
            <div className="hero-stat">
              <b>18</b>
              <span>Regions &amp; continents</span>
            </div>
            <div className="hero-stat">
              <b>3</b>
              <span>Difficulty modes</span>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="setup" id="setup">
          <div className="container">
            <div className="setup-grid">
              <div className="panel">
                <h2>Choose a category</h2>
                <p className="panel-sub">Continents, hand-picked regions, or every flag in the atlas.</p>
                <CategoryGrid
                  allCountries={ALL_COUNTRIES}
                  tab={tab}
                  onTabChange={setTab}
                  categoryId={categoryId}
                  onSelectCategory={selectCategory}
                  countFor={countFor}
                  paidCategories={paidCategories}
                  onOpenPurchase={setPurchaseCategoryId}
                />
              </div>

              <div className="panel">
                <h2>Game setup</h2>
                <p className="panel-sub">Fine-tune how you want to play.</p>

                <GameModeSelector
                  length={length}
                  onLengthChange={setLength}
                  customLength={customLength}
                  onCustomLengthChange={setCustomLength}
                  maxAvailable={categoryCount || 1}
                />

                <DifficultySelector difficulty={difficulty} onChange={setDifficulty} />

                {FEATURE_FLAGS.multiplayer && <GameModeToggle mode={gameMode} onChange={setGameMode} />}

                <TimerToggle
                  enabled={timerEnabled}
                  onToggle={setTimerEnabled}
                  minutes={timerMinutes}
                  onMinutesChange={setTimerMinutes}
                />

                <div className="option-group" style={{ marginBottom: 0 }}>
                  <Button
                    variant="primary"
                    block
                    className="play-cta"
                    disabled={!categoryId || (selectedIsPaid && !canPlaySelectedPaid) || !categoryCount}
                    onClick={handlePlay}
                  >
                    {!categoryId
                      ? 'Select a category to play'
                      : selectedIsPaid && !canPlaySelectedPaid
                      ? 'Purchase this category to play'
                      : selectedIsPaid && !categoryCount
                      ? 'Loading category…'
                      : gameMode === 'multiplayer'
                      ? 'Setup Teams'
                      : `Play ${labelForCategory(categoryId)} — ${effectiveCount} flag${effectiveCount === 1 ? '' : 's'}`}
                  </Button>
                  {categoryId && categoryCount > 0 && (
                    <p className="selection-summary">
                      {labelForCategory(categoryId)} · {effectiveCount} flags · {difficulty} ·{' '}
                      {timerEnabled ? `${timerMinutes} min timer` : 'free run'}
                      {gameMode === 'multiplayer' ? ' · multiplayer' : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="how-it-works">
          <div className="container">
            <div className="hiw-grid">
              <div className="hiw-card">
                <span className="step-num">01</span>
                <h3>Pick your ground</h3>
                <p>Continents, regions like the Caribbean or Southeast Asia, or the full World atlas.</p>
              </div>
              <div className="hiw-card">
                <span className="step-num">02</span>
                <h3>Answer your way</h3>
                <p>Multiple choice on Easy, a forgiving autocomplete on Normal, or blank text entry on Hard.</p>
              </div>
              <div className="hiw-card">
                <span className="step-num">03</span>
                <h3>Track your progress</h3>
                <p>Guest stats live in this browser. Sign in with Google or Discord to keep them anywhere.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {purchaseCategory && (
        <PurchaseModal category={purchaseCategory} user={user} onClose={() => setPurchaseCategoryId(null)} />
      )}
    </>
  );
}
