import type { PokemonSet } from '@pkmn/sets';
import type { SuggestedSet, UsageOption } from '../services/sets';
import { evSummary } from './RosterCard';

function pct(o: UsageOption): string {
  return o.pct == null ? '' : ` (${o.pct}%)`;
}

function Select({
  label,
  value,
  options,
  onChange,
  allowBlank,
}: {
  label: string;
  value: string;
  options: UsageOption[];
  onChange: (v: string) => void;
  allowBlank?: boolean;
}) {
  // Ensure the current value is selectable even if not in the usage list.
  const names = options.map((o) => o.name);
  const extra = value && !names.includes(value) ? [{ name: value, pct: null }] : [];
  return (
    <label className="editor-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {allowBlank && <option value="">—</option>}
        {[...extra, ...options].map((o) => (
          <option key={o.name} value={o.name}>
            {o.name}
            {pct(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Usage-% dropdowns to swap an auto-filled opponent's item / ability / tera /
 * spread / moves. Edits produce a new PokemonSet via onChange.
 */
export function OpponentEditor({
  set,
  suggestion,
  teraEnabled,
  onChange,
}: {
  set: PokemonSet;
  suggestion: SuggestedSet;
  teraEnabled: boolean;
  onChange: (next: PokemonSet) => void;
}) {
  const patch = (p: Partial<PokemonSet>) => onChange({ ...set, ...p });

  const spreadValue =
    suggestion.spreads.find((s) => s.nature === set.nature && evSummary(s.evs) === evSummary(set.evs))?.label ?? '';

  return (
    <div className="editor">
      <div className="editor-grid">
        <Select label="Ability" value={set.ability} options={suggestion.abilities} onChange={(v) => patch({ ability: v })} />
        <Select label="Item" value={set.item} options={suggestion.items} onChange={(v) => patch({ item: v })} allowBlank />
        {teraEnabled && (
          <Select
            label="Tera"
            value={set.teraType ?? ''}
            options={suggestion.teraTypes}
            onChange={(v) => patch({ teraType: v })}
            allowBlank
          />
        )}
        {suggestion.spreads.length > 0 && (
          <label className="editor-field">
            <span>Spread</span>
            <select
              value={spreadValue}
              onChange={(e) => {
                const s = suggestion.spreads.find((x) => x.label === e.target.value);
                if (s) patch({ nature: s.nature, evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...s.evs } });
              }}
            >
              {!spreadValue && <option value="">custom</option>}
              {suggestion.spreads.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.nature} {evSummary(s.evs)}
                  {s.pct == null ? '' : ` (${s.pct}%)`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {suggestion.moveOptions.length > 0 && (
        <div className="editor-moves">
          {[0, 1, 2, 3].map((i) => (
            <Select
              key={i}
              label={`Move ${i + 1}`}
              value={set.moves[i] ?? ''}
              options={suggestion.moveOptions}
              allowBlank
              onChange={(v) => {
                const moves = [...set.moves];
                moves[i] = v;
                patch({ moves: moves.filter((_, idx) => idx <= 3) });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
