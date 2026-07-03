import type { CSSProperties } from 'react';
import type { PokemonSet } from '@pkmn/sets';
import type { SuggestedSet, UsageOption } from '../services/sets';
import { allItems, allMoves, allTypes, abilitiesFor, megaStones, requiredItemFor } from '../services/data';
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
  const all = [...extra, ...options];
  // % only means something when there's a choice; a single-option field (e.g. a
  // Mega's forced ability) shows just the name.
  const showPct = all.length > 1;
  return (
    <label className="editor-field">
      <span>{label}</span>
      <div className="editor-input-row">
        {icon && <span className="item-icon" style={icon} />}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {allowBlank && <option value="">—</option>}
          {all.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
              {showPct && pct(o)}
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
  megasEnabled,
  onChange,
}: {
  set: PokemonSet;
  suggestion: SuggestedSet;
  teraEnabled: boolean;
  megasEnabled: boolean;
  onChange: (next: PokemonSet) => void;
}) {
  const patch = (p: Partial<PokemonSet>) => onChange({ ...set, ...p });

  // Only abilities the current forme can legally have: drops base-usage
  // abilities that don't apply to a Mega (which is locked to one ability), and
  // vice-versa. A single legal ability then renders with no % (no real choice).
  const legalAbilities = abilitiesFor(set.species);
  const legalSet = new Set(legalAbilities);
  const abilityOpts = withAll(
    suggestion.abilities.filter((o) => legalSet.has(o.name)),
    legalAbilities,
  );
  // A Mega/Primal forme must hold its stone to exist, so its item is forced to
  // that stone (single option, no %). Otherwise, in Mega formats surface the
  // Mega Stones / Orbs first; elsewhere the usual usage-then-dex list.
  const forcedStone = requiredItemFor(set.species);
  const stones = megasEnabled ? megaStones() : [];
  const stoneSet = new Set(stones);
  const items = [...stones, ...allItems().filter((n) => !stoneSet.has(n))];
  const itemOpts = forcedStone ? [{ name: forcedStone, pct: null }] : withAll(suggestion.items, items);
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
          allowBlank={!forcedStone}
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
