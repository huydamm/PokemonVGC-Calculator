import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { PokemonSet } from '@pkmn/sets';
import { DEFAULT_CONDITIONS, DEFAULT_MODS, type Conditions, type Mods } from './services/conditions';
import { ConditionsPanel } from './components/ConditionsPanel';
import { Results } from './components/Results';
import {
  parseTeam,
  rosterMonFromSet,
  formeOptions,
  applyForme,
  isMegaForme,
  type RosterMon,
} from './services/team';
import {
  FORMATS,
  DEFAULT_FORMAT_ID,
  getFormat,
  discoverFormats,
  resolveFormat,
  type ResolvedFormat,
  type FormatDef,
} from './services/formats';
import { getCommonSet, suggestedToSet, type SuggestedSet } from './services/sets';
import { RosterCard } from './components/RosterCard';
import { OpponentPicker } from './components/OpponentPicker';
import { OpponentEditor } from './components/OpponentEditor';
import { SpreadEditor } from './components/SpreadEditor';
import './app.css';

type SlotId = 'attacker' | 'defender';
interface Assigned {
  mon: RosterMon;
  source: 'team' | 'opponent';
  suggestion?: SuggestedSet;
}

const SAMPLE = `Incineroar @ Safety Goggles
Ability: Intimidate
Level: 50
Tera Type: Grass
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Fake Out
- Knock Off
- Flare Blitz
- Parting Shot

Charizard-Mega-Y @ Charizardite Y
Ability: Drought
Level: 50
Tera Type: Fire
EVs: 4 HP / 252 SpA / 252 Spe
Modest Nature
- Heat Wave
- Air Slash
- Solar Beam
- Protect`;

function DraggableCard({ mon, onAssign }: { mon: RosterMon; onAssign: (s: SlotId) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: mon.id });
  return (
    <div ref={setNodeRef} className={`drag-wrap${isDragging ? ' dragging' : ''}`} {...attributes} {...listeners}>
      <RosterCard mon={mon} onAssign={onAssign} />
    </div>
  );
}

function Slot({
  id,
  label,
  assigned,
  loading,
  format,
  tera,
  onClear,
  onPick,
  onEdit,
  onForme,
  onToggleTera,
}: {
  id: SlotId;
  label: string;
  assigned?: Assigned;
  loading: boolean;
  format: FormatDef;
  tera: boolean;
  onClear: () => void;
  onPick: (species: string) => void;
  onEdit: (set: PokemonSet) => void;
  onForme: (set: PokemonSet) => void;
  onToggleTera: (v: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const formes = format.megasEnabled && assigned ? formeOptions(assigned.mon.speciesName) : [];
  return (
    <div ref={setNodeRef} className={`slot${isOver ? ' over' : ''}${assigned ? ' filled' : ''}`}>
      <div className="slot-head">
        <span>{label}</span>
        {assigned && (
          <button type="button" className="link" onClick={onClear}>
            clear
          </button>
        )}
      </div>

      {loading && <div className="slot-empty">Loading common set…</div>}

      {!loading && assigned && (
        <>
          <RosterCard mon={assigned.mon} compact />
          {assigned.mon.teraType && (
            <label className={`tera-toggle${tera ? ' on' : ''}`}>
              <input type="checkbox" checked={tera} onChange={(e) => onToggleTera(e.target.checked)} />
              <span>Terastallize → {assigned.mon.teraType}</span>
            </label>
          )}
          {formes.length > 1 && (
            <label className="editor-field forme-pick">
              <span>Forme</span>
              <select
                value={assigned.mon.speciesName}
                onChange={(e) => onForme(applyForme(assigned.mon.set, e.target.value))}
              >
                {formes.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {assigned.source === 'opponent' && assigned.suggestion && (
            <>
              {assigned.suggestion.note && <p className="src-note">⚠ {assigned.suggestion.note}</p>}
              {assigned.suggestion.source === 'usage' && (
                <p className="src-note muted">Auto-filled from {assigned.suggestion.species} usage stats</p>
              )}
              <OpponentEditor set={assigned.mon.set} suggestion={assigned.suggestion} onChange={onEdit} />
            </>
          )}
          <details className="spread-details">
            <summary>Edit spread manually ({format.statSystem.unit})</summary>
            <SpreadEditor set={assigned.mon.set} format={format} onChange={onEdit} />
          </details>
        </>
      )}

      {!loading && !assigned && (
        <>
          <div className="slot-empty">Drag a team Pokémon here, or search:</div>
          <OpponentPicker onPick={onPick} />
        </>
      )}
    </div>
  );
}

export default function App() {
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID);
  const [resolved, setResolved] = useState<ResolvedFormat[] | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [roster, setRoster] = useState<RosterMon[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [attacker, setAttacker] = useState<Assigned | null>(null);
  const [defender, setDefender] = useState<Assigned | null>(null);
  const [loading, setLoading] = useState<SlotId | null>(null);
  const [conditions, setConditions] = useState<Conditions>(DEFAULT_CONDITIONS);
  const [attackerMods, setAttackerMods] = useState<Mods>(DEFAULT_MODS);
  const [defenderMods, setDefenderMods] = useState<Mods>(DEFAULT_MODS);
  const [discoverError, setDiscoverError] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    let live = true;
    discoverFormats()
      .then((r) => live && setResolved(r))
      .catch(() => live && setDiscoverError(true));
    return () => {
      live = false;
    };
  }, []);

  function resetConditions() {
    setConditions(DEFAULT_CONDITIONS);
    setAttackerMods(DEFAULT_MODS);
    setDefenderMods(DEFAULT_MODS);
  }

  const format = getFormat(formatId);
  const info = resolved?.find((r) => r.def.id === formatId);
  const setSlot = (slot: SlotId, a: Assigned | null) => (slot === 'attacker' ? setAttacker(a) : setDefender(a));

  function loadPaste(text: string) {
    setPasteText(text);
    const { roster: r, errors: e } = parseTeam(text);
    setRoster(r);
    setErrors(e);
    setAttacker(null);
    setDefender(null);
  }

  function assignFromRoster(slot: SlotId, mon: RosterMon) {
    const next: Assigned = { mon, source: 'team' };
    if (slot === 'attacker') {
      setAttacker(next);
      if (defender?.source === 'team' && defender.mon.id === mon.id) setDefender(null);
    } else {
      setDefender(next);
      if (attacker?.source === 'team' && attacker.mon.id === mon.id) setAttacker(null);
    }
  }

  async function pickOpponent(slot: SlotId, species: string) {
    setLoading(slot);
    try {
      const rf = info ?? (await resolveFormat(format));
      const suggestion = await getCommonSet(species, rf);
      const mon = rosterMonFromSet(suggestedToSet(suggestion), `opp-${slot}`);
      if (mon) setSlot(slot, { mon, source: 'opponent', suggestion });
    } finally {
      setLoading(null);
    }
  }

  function changeSet(slot: SlotId, current: Assigned, nextSet: PokemonSet) {
    const mon = rosterMonFromSet(nextSet, `${current.source}-${slot}`) ?? current.mon;
    setSlot(slot, { ...current, mon });
  }

  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id;
    if (over !== 'attacker' && over !== 'defender') return;
    const mon = roster.find((m) => m.id === String(e.active.id));
    if (mon) assignFromRoster(over, mon);
  }

  function swap() {
    setAttacker(defender);
    setDefender(attacker);
    setAttackerMods(defenderMods);
    setDefenderMods(attackerMods);
    setConditions({ ...conditions, attackerSide: conditions.defenderSide, defenderSide: conditions.attackerSide });
  }

  const groups = useMemo(() => {
    const m = new Map<string, typeof FORMATS>();
    for (const f of FORMATS) {
      if (!m.has(f.group)) m.set(f.group, []);
      m.get(f.group)!.push(f);
    }
    return [...m.entries()];
  }, []);

  // One-Mega-per-team rule (non-blocking): count Megas across the pasted roster.
  const megaRosterCount = useMemo(
    () => (format.megasEnabled ? roster.filter((m) => isMegaForme(m.speciesName)).length : 0),
    [roster, format.megasEnabled],
  );

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <main className="app">
        <header className="app-head">
          <h1>Damage Calculator</h1>
          <div className="format-pick">
            <select value={formatId} onChange={(e) => setFormatId(e.target.value)} aria-label="Format">
              {groups.map(([group, fmts]) => (
                <optgroup key={group} label={group}>
                  {fmts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="format-meta">
              {format.gameType} · Lv {format.level} · Megas {format.megasEnabled ? 'on' : 'off'}
              {info?.stats.note && <em title={info.stats.note}> · ⚠ fallback data</em>}
            </span>
          </div>
        </header>

        {discoverError && (
          <p className="warn">
            ⚠ Couldn't reach data.pkmn.cc — opponent auto-fill will use base stats until it's reachable. Calcs still work.
          </p>
        )}

        <div className="columns">
          <section className="paste-col">
            <label htmlFor="paste">Paste your team (Showdown export)</label>
            <textarea
              id="paste"
              value={pasteText}
              onChange={(e) => loadPaste(e.target.value)}
              placeholder="Paste a Showdown team export…"
              spellCheck={false}
            />
            <button type="button" className="link" onClick={() => loadPaste(SAMPLE)}>
              load sample team
            </button>
            {errors.length > 0 && (
              <ul className="errors">
                {errors.map((er) => (
                  <li key={er}>{er}</li>
                ))}
              </ul>
            )}
            {megaRosterCount > 1 && (
              <p className="warn">
                ⚠ {megaRosterCount} Mega Pokémon on this team — only one Mega Evolution is legal per team.
              </p>
            )}
            <div className="roster">
              {roster.map((mon) => (
                <DraggableCard key={mon.id} mon={mon} onAssign={(s) => assignFromRoster(s, mon)} />
              ))}
              {roster.length === 0 && <p className="muted">No Pokémon yet — paste a team or load the sample.</p>}
            </div>
          </section>

          <section className="calc-col">
            <div className="slots">
              <Slot
                id="attacker"
                label="Attacker"
                assigned={attacker ?? undefined}
                loading={loading === 'attacker'}
                format={format}
                tera={attackerMods.tera}
                onClear={() => setAttacker(null)}
                onPick={(s) => pickOpponent('attacker', s)}
                onEdit={(set) => attacker && changeSet('attacker', attacker, set)}
                onForme={(set) => attacker && changeSet('attacker', attacker, set)}
                onToggleTera={(v) => setAttackerMods({ ...attackerMods, tera: v })}
              />
              <button
                type="button"
                className="swap"
                onClick={swap}
                title="Swap attacker/defender"
                disabled={!attacker && !defender}
              >
                ⇄
              </button>
              <Slot
                id="defender"
                label="Defender"
                assigned={defender ?? undefined}
                loading={loading === 'defender'}
                format={format}
                tera={defenderMods.tera}
                onClear={() => setDefender(null)}
                onPick={(s) => pickOpponent('defender', s)}
                onEdit={(set) => defender && changeSet('defender', defender, set)}
                onForme={(set) => defender && changeSet('defender', defender, set)}
                onToggleTera={(v) => setDefenderMods({ ...defenderMods, tera: v })}
              />
            </div>

            {attacker && defender ? (
              <Results
                attacker={attacker.mon}
                defender={defender.mon}
                gameType={format.gameType}
                conditions={conditions}
                attackerMods={attackerMods}
                defenderMods={defenderMods}
              />
            ) : (
              <p className="muted">Fill both slots — drag a team card in, or search a Pokémon to auto-fill its common set.</p>
            )}

            <ConditionsPanel
              conditions={conditions}
              setConditions={setConditions}
              attackerMods={attackerMods}
              defenderMods={defenderMods}
              setAttackerMods={setAttackerMods}
              setDefenderMods={setDefenderMods}
              onReset={resetConditions}
            />
          </section>
        </div>
      </main>
    </DndContext>
  );
}
