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
import { createPokemon, createMove, runCalc, makeField, type DamageResult } from './services/calc';
import { parseTeam, setToPokemonOptions, type RosterMon } from './services/team';
import {
  FORMATS,
  DEFAULT_FORMAT_ID,
  getFormat,
  discoverFormats,
  type ResolvedFormat,
} from './services/formats';
import { RosterCard } from './components/RosterCard';
import './app.css';

type SlotId = 'attacker' | 'defender';

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

function Slot({ id, label, mon, onClear }: { id: SlotId; label: string; mon?: RosterMon; onClear: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`slot${isOver ? ' over' : ''}${mon ? ' filled' : ''}`}>
      <div className="slot-head">
        <span>{label}</span>
        {mon && (
          <button type="button" className="link" onClick={onClear}>
            clear
          </button>
        )}
      </div>
      {mon ? <RosterCard mon={mon} compact /> : <div className="slot-empty">Drag a Pokémon here</div>}
    </div>
  );
}

function MoveRows({ attacker, defender, gameType }: { attacker: RosterMon; defender: RosterMon; gameType: 'Singles' | 'Doubles' }) {
  const rows = useMemo(() => {
    const atk = createPokemon(attacker.set.species, setToPokemonOptions(attacker.set));
    const def = createPokemon(defender.set.species, setToPokemonOptions(defender.set));
    const field = makeField(gameType);
    const moves = (attacker.set.moves ?? []).filter(Boolean);
    return moves.map((name): { name: string; r: DamageResult | null } => {
      try {
        return { name, r: runCalc(atk, def, createMove(name), field) };
      } catch {
        return { name, r: null };
      }
    });
  }, [attacker, defender, gameType]);

  return (
    <table className="moves">
      <thead>
        <tr>
          <th>Move</th>
          <th>Damage</th>
          <th>%</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ name, r }) => (
          <tr key={name}>
            <td>{name}</td>
            <td>{r ? `${r.range[0]}–${r.range[1]}` : '—'}</td>
            <td>{r ? `${r.percent[0]}–${r.percent[1]}%` : '—'}</td>
            <td className="ko">{r ? r.ko.text || r.desc.split('--')[1]?.trim() : 'status / no damage'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function App() {
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID);
  const [resolved, setResolved] = useState<ResolvedFormat[] | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [roster, setRoster] = useState<RosterMon[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [attackerId, setAttackerId] = useState<string | null>(null);
  const [defenderId, setDefenderId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  useEffect(() => {
    let live = true;
    discoverFormats().then((r) => live && setResolved(r)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const format = getFormat(formatId);
  const info = resolved?.find((r) => r.def.id === formatId);
  const byId = (id: string | null) => roster.find((m) => m.id === id);
  const attacker = byId(attackerId);
  const defender = byId(defenderId);

  function loadPaste(text: string) {
    setPasteText(text);
    const { roster: r, errors: e } = parseTeam(text);
    setRoster(r);
    setErrors(e);
    setAttackerId(null);
    setDefenderId(null);
  }

  function assign(slot: SlotId, id: string) {
    if (slot === 'attacker') {
      setAttackerId(id);
      if (defenderId === id) setDefenderId(null);
    } else {
      setDefenderId(id);
      if (attackerId === id) setAttackerId(null);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id;
    if (over === 'attacker' || over === 'defender') assign(over, String(e.active.id));
  }

  function swap() {
    setAttackerId(defenderId);
    setDefenderId(attackerId);
  }

  const groups = useMemo(() => {
    const m = new Map<string, typeof FORMATS>();
    for (const f of FORMATS) {
      if (!m.has(f.group)) m.set(f.group, []);
      m.get(f.group)!.push(f);
    }
    return [...m.entries()];
  }, []);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <main className="app">
        <header className="app-head">
          <h1>Damage Calculator</h1>
          <div className="format-pick">
            <select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
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
            <div className="roster">
              {roster.map((mon) => (
                <DraggableCard key={mon.id} mon={mon} onAssign={(s) => assign(s, mon.id)} />
              ))}
              {roster.length === 0 && <p className="muted">No Pokémon yet — paste a team or load the sample.</p>}
            </div>
          </section>

          <section className="calc-col">
            <div className="slots">
              <Slot id="attacker" label="Attacker" mon={attacker} onClear={() => setAttackerId(null)} />
              <button type="button" className="swap" onClick={swap} title="Swap attacker/defender" disabled={!attacker && !defender}>
                ⇄
              </button>
              <Slot id="defender" label="Defender" mon={defender} onClear={() => setDefenderId(null)} />
            </div>

            {attacker && defender ? (
              <MoveRows attacker={attacker} defender={defender} gameType={format.gameType} />
            ) : (
              <p className="muted">
                Fill both slots — drag a card in, or use the ⚔ / 🛡 buttons on each card.
              </p>
            )}
          </section>
        </div>
      </main>
    </DndContext>
  );
}
