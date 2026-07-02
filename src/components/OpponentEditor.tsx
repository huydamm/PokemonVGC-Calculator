import { useId } from 'react';
import type { PokemonSet } from '@pkmn/sets';
import type { SuggestedSet } from '../services/sets';
import { allItems, allMoves, allTypes, abilitiesFor } from '../services/data';
import { evSummary } from './RosterCard';

/**
 * Autocomplete input backed by a shared <datalist>. Suggestions come from the
 * dex (via listId), but any value can be typed — so an item/move/ability can be
 * chosen manually even when a Pokémon has no usage data.
 */
function Combo({
  label,
  value,
  listId,
  onChange,
}: {
  label: string;
  value: string;
  listId: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <input list={listId} value={value} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/**
 * Editor to swap an opponent's item / ability / tera / spread / moves. Usage
 * suggestions drive the auto-fill, but every field falls back to the full dex so
 * you can set anything by hand, including for Pokémon with no set data.
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

  // One datalist per option kind, shared across fields (kept out of the DOM per
  // field to avoid thousands of <option>s).
  const itemsId = useId();
  const movesId = useId();
  const typesId = useId();
  const abilitiesId = useId();

  // Prefer the species' real abilities; add any usage-listed one just in case.
  const abilityNames = Array.from(
    new Set([...abilitiesFor(set.species), ...suggestion.abilities.map((a) => a.name)]),
  );

  const spreadValue =
    suggestion.spreads.find((s) => s.nature === set.nature && evSummary(s.evs) === evSummary(set.evs))?.label ?? '';

  return (
    <div className="editor">
      <div className="editor-grid">
        <Combo label="Ability" value={set.ability} listId={abilitiesId} onChange={(v) => patch({ ability: v })} />
        <Combo label="Item" value={set.item} listId={itemsId} onChange={(v) => patch({ item: v })} />
        {teraEnabled && (
          <Combo label="Tera" value={set.teraType ?? ''} listId={typesId} onChange={(v) => patch({ teraType: v })} />
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
          <Combo
            key={i}
            label={`Move ${i + 1}`}
            value={set.moves[i] ?? ''}
            listId={movesId}
            onChange={(v) => {
              const moves = [...set.moves];
              moves[i] = v;
              patch({ moves: moves.filter((_, idx) => idx <= 3) });
            }}
          />
        ))}
      </div>

      {/* Shared option lists (rendered once). */}
      <datalist id={abilitiesId}>{abilityNames.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id={itemsId}>{allItems().map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id={typesId}>{allTypes().map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id={movesId}>{allMoves().map((n) => <option key={n} value={n} />)}</datalist>
    </div>
  );
}
