import { useEffect, useMemo, useRef, useState } from 'react';
import { searchSpecies } from '../services/team';
import { spriteUrl, SUBSTITUTE_SPRITE, typeColor } from '../services/sprites';

export function OpponentPicker({ onPick }: { onPick: (species: string) => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo(() => searchSpecies(debounced, 30), [debounced]);
  useEffect(() => setActive(0), [debounced]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      onPick(results[active].name);
    }
  }

  return (
    <div className="picker">
      <input
        type="text"
        value={query}
        autoFocus
        placeholder="Search a Pokémon…"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Search opponent Pokémon"
      />
      <div className="picker-list" ref={listRef}>
        {results.map((e, i) => (
          <button
            type="button"
            key={e.name}
            className={`picker-row${i === active ? ' active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(e.name)}
            style={{ borderLeft: `3px solid ${typeColor(e.types[0])}` }}
          >
            <img
              src={spriteUrl(e.baseSpecies, e.baseSpecies !== e.name ? e.forme : undefined)}
              alt=""
              loading="lazy"
              onError={(ev) => {
                (ev.currentTarget as HTMLImageElement).src = SUBSTITUTE_SPRITE;
              }}
            />
            <span>{e.name}</span>
          </button>
        ))}
        {results.length === 0 && <p className="muted">No matches.</p>}
      </div>
    </div>
  );
}
