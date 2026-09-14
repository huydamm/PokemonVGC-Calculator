import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { MoveResult } from '../services/results';
import { typeColor } from '../services/sprites';
import { nextTabIndex } from '../services/tabs';

/**
 * The attacker's moves as a 2x2 battle menu; picking one drives the defender's
 * HP bar. Pick-exactly-one, so it's a radio group: arrow keys move and select.
 */
export function MoveMenu({
  rows,
  selected,
  onSelect,
}: {
  rows: MoveResult[];
  selected?: string;
  onSelect: (name: string) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const moves = rows.slice(0, 4);
  if (moves.length === 0) return null;
  const current = Math.max(0, moves.findIndex((m) => m.name === selected));

  function onKeyDown(e: KeyboardEvent) {
    const key = e.key === 'ArrowDown' ? 'ArrowRight' : e.key === 'ArrowUp' ? 'ArrowLeft' : e.key;
    const next = nextTabIndex(key, current, moves.length);
    if (next == null) return;
    e.preventDefault();
    onSelect(moves[next].name);
    refs.current[next]?.focus();
  }

  return (
    <div className="move-menu" role="radiogroup" aria-label="Attacker move" onKeyDown={onKeyDown}>
      {moves.map(({ name, type, category, spread, r }, i) => {
        const max = r?.percent[1] ?? 0;
        const checked = i === current;
        return (
          <button
            key={name}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="move-btn"
            style={{ '--move-type': typeColor(type) } as CSSProperties}
            onClick={() => onSelect(name)}
          >
            <span className="move-btn-name">{name}</span>
            <span className="move-btn-pct">
              {max > 0 ? `${max}%` : category === 'Status' ? 'status' : '0%'}
              {spread && <span title="Spread move: 0.75x damage in Doubles"> · spread</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
