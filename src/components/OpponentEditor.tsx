import type { CSSProperties } from 'react';
import type { PokemonSet } from '@pkmn/sets';
import type { SuggestedSet, UsageOption } from '../services/sets';
import { allItems, allMoves, allTypes, abilitiesFor } from '../services/data';
import { itemIconStyle } from '../services/sprites';
import { evSummary } from './RosterCard';

function pct(o: UsageOption): string {
  return o.pct == null ? ' (--%)' : ` (${o.pct}%)`;
}

/** Usage options (ranked, with %) followed by the rest of the dex (shown --%). */
function withAll(usage: UsageOption[], all: string[]): UsageOption[] {
  const seen = new Set(usage.map((o) => o.name));
  return [...usage, ...all.filter((n) => !seen.has(n)).map((n) => ({ name: n, pct: null }))];
}

function Select({
  label,
  value,
  options,
  onChange,
  allowBlank,
  icon,
}: {
  label: string;
  value: string;
  options: UsageOption[];
  onChange: (v: string) => void;
  allowBlank?: boolean;
  icon?: CSSProperties | null;
}) {
  // Ensure the current value is selectable even if not in the list.
  const names = options.map((o) => o.name);
  const extra = value && !names.includes(value) ? [{ name: value, pct: null }] : [];
  return (
    <label className="editor-field">
      <span>{label}</span>
      <div className="editor-input-row">
        {icon && <span className="item-icon" style={icon} />}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {allowBlank && <option value="">—</option>}
          {[...extra, ...options].map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
              {pct(o)}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

/**
 * Usage-% dropdowns to swap an auto-filled opponent's item / ability / tera /
 * spread / moves. Each dropdown lists the usage picks first (with their %) then
 * the rest of the legal dex (shown as --%), so anything can be chosen by hand —
 * type to jump to it — even for Pokémon with no set data. Edits produce a new
 * PokemonSet via onChange.
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

  const abilityOpts = withAll(suggestion.abilities, abilitiesFor(set.species));
  const itemOpts = withAll(suggestion.items, allItems());
  const teraOpts = withAll(suggestion.teraTypes, allTypes());
  const moveOpts = withAll(suggestion.moveOptions, allMoves());

  const spreadValue =
    suggestion.spreads.find((s) => s.nature === set.nature && evSummary(s.evs) === evSummary(set.evs))?.label ?? '';

  return (
    <div className="editor">
      <div className="editor-grid">
        <Select label="Ability" value={set.ability} options={abilityOpts} onChange={(v) => patch({ ability: v })} />
        <Select
          label="Item"
          value={set.item}
          options={itemOpts}
          onChange={(v) => patch({ item: v })}
          allowBlank
          icon={itemIconStyle(set.item)}
        />
        {teraEnabled && (
          <Select
            label="Tera"
            value={set.teraType ?? ''}
            options={teraOpts}
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

      <div className="editor-moves">
        {[0, 1, 2, 3].map((i) => (
          <Select
            key={i}
            label={`Move ${i + 1}`}
            value={set.moves[i] ?? ''}
            options={moveOpts}
            allowBlank
            onChange={(v) => {
              const moves = [...set.moves];
              moves[i] = v;
              patch({ moves: moves.filter((_, idx) => idx <= 3) });
            }}
          />
        ))}
      </div>
    </div>
  );
}
