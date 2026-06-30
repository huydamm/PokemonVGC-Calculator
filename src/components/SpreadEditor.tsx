import type { PokemonSet } from '@pkmn/sets';
import type { StatsTable } from '@pkmn/data';
import type { FormatDef } from '../services/formats';
import { natures } from '../services/team';

const STATS: [keyof StatsTable, string][] = [
  ['hp', 'HP'],
  ['atk', 'Atk'],
  ['def', 'Def'],
  ['spa', 'SpA'],
  ['spd', 'SpD'],
  ['spe', 'Spe'],
];

const MAX_EV = 252; // engine cap per stat

/**
 * Manual spread entry. Shows EVs (0-252, /508) for EV formats and Stat Points
 * (0-32, /66) for Champions. SP is stored as EVs (1 SP = 8 EVs at Lv 50) so the
 * EV-based engine reflects "1 SP = +1 stat".
 */
export function SpreadEditor({
  set,
  format,
  onChange,
}: {
  set: PokemonSet;
  format: FormatDef;
  onChange: (next: PokemonSet) => void;
}) {
  const sys = format.statSystem;
  const display = (k: keyof StatsTable) => Math.round((set.evs?.[k] ?? 0) / sys.evPerUnit);
  const total = STATS.reduce((sum, [k]) => sum + display(k), 0);
  const over = total > sys.totalMax;

  function setStat(k: keyof StatsTable, raw: number) {
    const v = Math.max(0, Math.min(sys.perStatMax, Number.isFinite(raw) ? raw : 0));
    const ev = Math.min(MAX_EV, v * sys.evPerUnit);
    onChange({ ...set, evs: { ...set.evs, [k]: ev } });
  }

  return (
    <div className="spread-editor">
      <div className="spread-head">
        <label className="editor-field">
          <span>Nature</span>
          <select value={set.nature} onChange={(e) => onChange({ ...set, nature: e.target.value })}>
            {natures().map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className={`spread-total${over ? ' over' : ''}`} title={`${sys.unit} used`}>
          {total} / {sys.totalMax} {sys.unit}
        </span>
      </div>
      <div className="spread-grid">
        {STATS.map(([k, label]) => (
          <label key={k} className="spread-stat">
            <span>{label}</span>
            <input
              type="number"
              min={0}
              max={sys.perStatMax}
              step={1}
              value={display(k)}
              onChange={(e) => setStat(k, parseInt(e.target.value, 10))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
