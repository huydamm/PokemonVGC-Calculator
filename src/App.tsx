import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { PokemonSet } from '@pkmn/sets';
import {
  DEFAULT_CONDITIONS,
  DEFAULT_MODS,
  activeConditionSummary,
  type Conditions,
  type Mods,
} from './services/conditions';
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
import { legalItems, isModeledAbility } from './services/data';
import { RosterCard } from './components/RosterCard';
import { OpponentPicker } from './components/OpponentPicker';
import { OpponentEditor } from './components/OpponentEditor';
import { SpreadEditor } from './components/SpreadEditor';
import { Tabs } from './components/Tabs';
import { Skeleton } from './components/Skeleton';
import { SpriteImg } from './components/SpriteImg';
import { MoveMenu } from './components/MoveMenu';
import { HpPanel } from './components/HpPanel';
import { computeMoveResults, resolveFeatured, type MovePick } from './services/results';
import './app.css';

type SlotId = 'attacker' | 'defender';
type MainTab = 'calc' | 'team' | 'field';
interface Assigned {
  mon: RosterMon;
  source: 'team' | 'opponent';
  suggestion?: SuggestedSet;
}

/** A team sprite in the Calc tab's strip: drag it onto the Attacker or Defender slot. */
function StripChip({ mon }: { mon: RosterMon }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: mon.id });
  return (
    <div
      ref={setNodeRef}
      className={`strip-chip${isDragging ? ' dragging' : ''}`}
      title={`Drag ${mon.displayName} onto a slot`}
      {...attributes}
      {...listeners}
    >
      <SpriteImg src={mon.spriteUrl} alt="" size={48} />
      <span>{mon.displayName}</span>
    </div>
  );
}

/** Stands in for a slot while its common set is being fetched. */
function SlotSkeleton() {
  return (
    <div className="slot-skeleton">
      <div className="skel-card">
        <Skeleton w="64px" h="64px" />
        <div className="skel-lines">
          <Skeleton w="60%" h="14px" />
          <Skeleton w="40%" h="12px" />
        </div>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} w="100%" h="32px" />
      ))}
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
  top,
  cardClass,
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
  /** Rendered above the Pokémon card: the move menu (attacker) or HP panel (defender). */
  top?: ReactNode;
  cardClass?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [view, setView] = useState<'set' | 'spread'>('set');
  const formes = format.megasEnabled && assigned ? formeOptions(assigned.mon.speciesName) : [];
  return (
    <>
      {/* Outside the aria-busy slot: some screen readers hold updates from a busy region. */}
      <span className="sr-only" aria-live="polite">
        {loading ? `Loading ${label.toLowerCase()} set` : assigned ? `${label}: ${assigned.mon.displayName}` : ''}
      </span>
      <div
        ref={setNodeRef}
        className={`slot${isOver ? ' over' : ''}${assigned ? ' filled' : ''}`}
        aria-busy={loading ? true : undefined}
      >
      <div className="slot-head">
        <span>{label}</span>
        {assigned && (
          <button type="button" className="link" onClick={onClear}>
            clear
          </button>
        )}
      </div>

      {loading && <SlotSkeleton />}

      {!loading && assigned && (
        <>
          {top}
          <div className={`slot-card${cardClass ? ` ${cardClass}` : ''}`} key={assigned.mon.speciesName}>
            <RosterCard mon={assigned.mon} compact showTera={format.teraEnabled} />
          </div>
          <Tabs
            idPrefix={`${id}-slot`}
            ariaLabel={`${label} editor`}
            size="sm"
            active={view}
            onChange={setView}
            tabs={[
              { id: 'set', label: 'Set' },
              { id: 'spread', label: `Spread (${format.statSystem.unit})` },
            ]}
          >
            {(v) =>
              v === 'set' ? (
                <>
                  {format.teraEnabled && assigned.mon.teraType && (
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
                        onChange={(e) => {
                          const next = applyForme(assigned.mon.set, e.target.value);
                          // Reverting to base leaves no item; fill the most common one
                          // that's legal in this format (usage can rank an illegal item).
                          const legal = legalItems(format.id);
                          const common = assigned.suggestion?.items?.find((o) => !legal || legal.includes(o.name))?.name;
                          onForme(!next.item && common ? { ...next, item: common } : next);
                        }}
                      >
                        {formes.map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {!isModeledAbility(assigned.mon.set.ability, format.id) && (
                    <p className="src-note muted">{assigned.mon.set.ability} is not modeled by the calc yet</p>
                  )}
                  {assigned.source === 'opponent' && assigned.suggestion && (
                    <>
                      {assigned.suggestion.note && <p className="src-note">⚠ {assigned.suggestion.note}</p>}
                      {assigned.suggestion.source === 'usage' && (
                        <p className="src-note muted">Auto-filled from {assigned.suggestion.species} usage stats</p>
                      )}
                      <OpponentEditor
                        set={assigned.mon.set}
                        suggestion={assigned.suggestion}
                        teraEnabled={format.teraEnabled}
                        megasEnabled={format.megasEnabled}
                        formatId={format.id}
                        onChange={onEdit}
                      />
                    </>
                  )}
                  {assigned.source === 'team' && !(format.teraEnabled && assigned.mon.teraType) && (
                    <p className="src-note muted">Set from your pasted team. Edit the spread in the Spread tab.</p>
                  )}
                </>
              ) : (
                <SpreadEditor set={assigned.mon.set} format={format} onChange={onEdit} />
              )
            }
          </Tabs>
        </>
      )}

      {!loading && !assigned && (
        <>
          <div className="slot-empty">Drag a team sprite here, or search:</div>
          <OpponentPicker onPick={onPick} formatId={format.id} />
        </>
      )}
      </div>
    </>
  );
}

/** dnd-kit's drop animation runs in JS, so the CSS reduced-motion rule can't stop it. */
const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const [tab, setTab] = useState<MainTab>('calc');
  const [dragId, setDragId] = useState<string | null>(null);
  // Bumped whenever a slot gets a different Pokémon (not on edits), so a move pick
  // and the hit shake stay tied to the matchup they were made on.
  const [epochs, setEpochs] = useState({ attacker: 0, defender: 0 });
  const bump = (...slots: SlotId[]) =>
    setEpochs((e) => {
      const next = { ...e };
      for (const s of slots) next[s] += 1;
      return next;
    });

  // Touch needs a press-and-hold so a swipe still scrolls the team strip.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  /** Switch tabs from a control inside a panel, then move focus somewhere sensible. */
  function goTab(next: MainTab, focusId: string) {
    setTab(next);
    requestAnimationFrame(() => document.getElementById(focusId)?.focus());
  }

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
  const discovering = resolved === null && !discoverError;
  const setSlot = (slot: SlotId, a: Assigned | null) => (slot === 'attacker' ? setAttacker(a) : setDefender(a));

  // Re-derive auto-filled opponents when the format changes, so their set/stats
  // reflect the new format's usage data instead of staying stale. Refs let the
  // effect read the current slots without re-running when they change.
  const attackerRef = useRef(attacker);
  const defenderRef = useRef(defender);
  attackerRef.current = attacker;
  defenderRef.current = defender;
  useEffect(() => {
    let live = true;
    const slots = [
      ['attacker', attackerRef.current] as const,
      ['defender', defenderRef.current] as const,
    ];
    if (!slots.some(([, a]) => a?.source === 'opponent')) return;
    (async () => {
      const rf = info ?? (await resolveFormat(getFormat(formatId)));
      for (const [slot, cur] of slots) {
        if (!cur || cur.source !== 'opponent') continue;
        const species = cur.suggestion?.species ?? cur.mon.speciesName;
        const suggestion = await getCommonSet(species, rf);
        const mon = rosterMonFromSet(suggestedToSet(suggestion, formatId), `opp-${slot}`);
        if (live && mon) setSlot(slot, { mon, source: 'opponent', suggestion });
      }
    })();
    return () => {
      live = false;
    };
    // Only re-run on format change (slots are read via refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatId]);

  // A paste is read against the format (level, and Stat Points in Champions), so re-read it
  // on a format switch and refresh team mons already in a slot. Roster ids are stable per paste.
  useEffect(() => {
    if (!pasteText) return;
    const r = parseTeam(pasteText, format).roster;
    setRoster(r);
    for (const [slot, cur] of [['attacker', attackerRef.current], ['defender', defenderRef.current]] as const) {
      const mon = cur?.source === 'team' && r.find((m) => m.id === cur.mon.id);
      if (mon) setSlot(slot, { ...cur, mon });
    }
    // Only re-run on format change (paste and slots are read at that moment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatId]);

  function loadPaste(text: string) {
    setPasteText(text);
    const { roster: r, errors: e } = parseTeam(text, format);
    setRoster(r);
    setErrors(e);
    setAttacker(null);
    setDefender(null);
    bump('attacker', 'defender');
  }

  function assignFromRoster(slot: SlotId, mon: RosterMon) {
    const next: Assigned = { mon, source: 'team' };
    if (slot === 'attacker') {
      setAttacker(next);
      bump('attacker');
      if (defender?.source === 'team' && defender.mon.id === mon.id) {
        setDefender(null);
        bump('defender');
      }
    } else {
      setDefender(next);
      bump('defender');
      if (attacker?.source === 'team' && attacker.mon.id === mon.id) {
        setAttacker(null);
        bump('attacker');
      }
    }
  }

  async function pickOpponent(slot: SlotId, species: string) {
    setLoading(slot);
    bump(slot);
    try {
      const rf = info ?? (await resolveFormat(format));
      const suggestion = await getCommonSet(species, rf);
      const mon = rosterMonFromSet(suggestedToSet(suggestion, format.id), `opp-${slot}`);
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
    setDragId(null);
    const over = e.over?.id;
    if (over !== 'attacker' && over !== 'defender') return;
    const mon = roster.find((m) => m.id === String(e.active.id));
    if (mon) assignFromRoster(over, mon);
  }

  function swap() {
    setPick(undefined);
    bump('attacker', 'defender');
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

  const fieldSummary = useMemo(
    () => activeConditionSummary(conditions, attackerMods, defenderMods, format.gameType === 'Doubles'),
    [conditions, attackerMods, defenderMods, format.gameType],
  );

  // Move results are computed once here and shared by the move menu, HP bar,
  // Moves table and Heatmap; the selected move falls back to the strongest one.
  const rows = useMemo(
    () =>
      attacker && defender
        ? computeMoveResults({
            attacker: attacker.mon.set,
            defender: defender.mon.set,
            attackerMods,
            defenderMods,
            conditions,
            gameType: format.gameType,
            formatId: format.id,
            teraEnabled: format.teraEnabled,
          })
        : [],
    [attacker, defender, attackerMods, defenderMods, conditions, format],
  );
  // A pick belongs to the attacker it was made on; a new attacker (or a swap)
  // falls back to its strongest move.
  const [pick, setPick] = useState<MovePick | undefined>(undefined);
  const attackerKey = attacker ? `attacker-${epochs.attacker}` : undefined;
  const featuredName = resolveFeatured(rows, pick, attackerKey);
  const featuredRow = rows.find((r) => r.name === featuredName);

  // Each new pick shakes the defender sprite. Alternating two identical
  // keyframes restarts the animation without remounting the card.
  const [hit, setHit] = useState<{ n: number; defender: number } | null>(null);
  function pickMove(name: string) {
    if (!attackerKey) return;
    if (name !== featuredName) setHit((h) => ({ n: (h?.n ?? 0) + 1, defender: epochs.defender }));
    setPick({ attackerKey, move: name });
  }
  // Only for the defender the pick was made against: a new defender just gets its mount pop.
  const hitClass =
    hit && hit.defender === epochs.defender && featuredRow?.r && featuredRow.r.range[1] > 0
      ? hit.n % 2
        ? 'hit-a'
        : 'hit-b'
      : undefined;
  const showResult = !!(attacker && defender);

  const calcView = (
    <div className="calc-view">
      <div className="roster-strip" aria-label="Your team">
        {roster.length > 0 ? (
          roster.map((mon) => <StripChip key={mon.id} mon={mon} />)
        ) : (
          <button type="button" className="strip-empty" onClick={() => goTab('team', 'paste')}>
            + Paste a team in the Team tab
          </button>
        )}
      </div>

      {/* Phones stack the slots, so the HP panel moves above both to stay in view (CSS toggles which copy shows). */}
      {showResult && defender && (
        <div className="hp-mobile">
          <HpPanel defenderName={defender.mon.displayName} row={featuredRow} />
        </div>
      )}

      <div className="slots">
        <Slot
          id="attacker"
          label="Attacker"
          assigned={attacker ?? undefined}
          loading={loading === 'attacker'}
          format={format}
          tera={attackerMods.tera}
          onClear={() => {
            setAttacker(null);
            bump('attacker');
          }}
          onPick={(s) => pickOpponent('attacker', s)}
          onEdit={(set) => attacker && changeSet('attacker', attacker, set)}
          onForme={(set) => attacker && changeSet('attacker', attacker, set)}
          onToggleTera={(v) => setAttackerMods({ ...attackerMods, tera: v })}
          top={showResult ? <MoveMenu rows={rows} selected={featuredName} onSelect={pickMove} /> : undefined}
        />
        <button
          type="button"
          className="swap"
          onClick={swap}
          title="Swap attacker/defender"
          aria-label="Swap attacker and defender"
          disabled={!attacker && !defender}
        >
          <span className="swap-icon" aria-hidden="true">
            ⇄
          </span>
        </button>
        <Slot
          id="defender"
          label="Defender"
          assigned={defender ?? undefined}
          loading={loading === 'defender'}
          format={format}
          tera={defenderMods.tera}
          onClear={() => {
            setDefender(null);
            bump('defender');
          }}
          onPick={(s) => pickOpponent('defender', s)}
          onEdit={(set) => defender && changeSet('defender', defender, set)}
          onForme={(set) => defender && changeSet('defender', defender, set)}
          onToggleTera={(v) => setDefenderMods({ ...defenderMods, tera: v })}
          top={showResult && defender ? <HpPanel defenderName={defender.mon.displayName} row={featuredRow} /> : undefined}
          cardClass={showResult ? hitClass : undefined}
        />
      </div>

      <div className="field-summary">
        <span className="field-summary-label">Field</span>
        {fieldSummary.length > 0 ? (
          fieldSummary.map((s) => (
            <button key={s} type="button" className="summary-chip" onClick={() => goTab('field', 'main-tab-field')}>
              {s}
            </button>
          ))
        ) : (
          <button type="button" className="summary-chip idle" onClick={() => goTab('field', 'main-tab-field')}>
            No field effects
          </button>
        )}
      </div>

      {attacker && defender ? (
        <Results
          rows={rows}
          featuredName={featuredName}
          onFeature={pickMove}
          attacker={attacker.mon}
          defender={defender.mon}
          gameType={format.gameType}
          formatId={format.id}
          teraEnabled={format.teraEnabled}
          conditions={conditions}
          attackerMods={attackerMods}
          defenderMods={defenderMods}
        />
      ) : (
        <p className="muted empty-results">
          Fill both slots: drag a team sprite in, or search a Pokémon to auto-fill its common set.
        </p>
      )}
    </div>
  );

  const teamView = (
    <div className="team-view">
      <section className="paste-col">
        <label htmlFor="paste" className="section-title">
          Paste your team (Showdown export)
        </label>
        <textarea
          id="paste"
          value={pasteText}
          onChange={(e) => loadPaste(e.target.value)}
          placeholder="Paste a Showdown team export…"
          spellCheck={false}
        />
        {errors.length > 0 && (
          <ul className="errors">
            {errors.map((er) => (
              <li key={er}>{er}</li>
            ))}
          </ul>
        )}
        {megaRosterCount > 1 && (
          <p className="warn">
            ⚠ {megaRosterCount} Mega Pokémon on this team. Only one Mega Evolution is legal per team.
          </p>
        )}
      </section>
      <section className="roster" aria-label="Team cards">
        {roster.map((mon) => (
          <RosterCard
            key={mon.id}
            mon={mon}
            showTera={format.teraEnabled}
            onAssign={(s) => {
              assignFromRoster(s, mon);
              goTab('calc', 'main-tab-calc');
            }}
          />
        ))}
        {roster.length === 0 && <p className="muted">No Pokémon yet. Paste a Showdown team export.</p>}
      </section>
    </div>
  );

  const fieldView = (
    <ConditionsPanel
      conditions={conditions}
      setConditions={setConditions}
      attackerMods={attackerMods}
      defenderMods={defenderMods}
      setAttackerMods={setAttackerMods}
      setDefenderMods={setDefenderMods}
      onReset={resetConditions}
      doubles={format.gameType === 'Doubles'}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragId(null)}
    >
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
            <span className="format-meta" aria-busy={discovering ? true : undefined}>
              {format.gameType} · Lv {format.level} · Megas {format.megasEnabled ? 'on' : 'off'}
              {discovering ? (
                <Skeleton className="meta-skel" w="6rem" h="0.75rem" />
              ) : (
                info?.stats.note && <em title={info.stats.note}> · ⚠ fallback data</em>
              )}
            </span>
          </div>
        </header>

        {discoverError && (
          <p className="warn">
            ⚠ Couldn't reach data.pkmn.cc, so opponent auto-fill uses base stats until it's reachable. Calcs still work.
          </p>
        )}

        <Tabs
          idPrefix="main"
          ariaLabel="Calculator sections"
          keepMounted
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'calc', label: 'Calc' },
            { id: 'team', label: 'Team', badge: roster.length },
            { id: 'field', label: 'Field', badge: fieldSummary.length },
          ]}
        >
          {(t) => (t === 'calc' ? calcView : t === 'team' ? teamView : fieldView)}
        </Tabs>
        <footer className="credits muted">
          Battle data by <a href="https://championsbattledata.com/">Pokémon Champions Battle Data</a>, usage stats by{' '}
          <a href="https://www.smogon.com/stats/">Smogon</a> via <a href="https://data.pkmn.cc/">pkmn</a>, calc by{' '}
          <a href="https://github.com/smogon/damage-calc">@smogon/calc</a>, sprites from Pokémon Showdown. Unofficial
          fan project, not affiliated with Nintendo, Game Freak, or The Pokémon Company.
        </footer>
      </main>
      {/* The sprite that follows the pointer (or keyboard) while dragging a team member. */}
      <DragOverlay dropAnimation={prefersReducedMotion() ? null : undefined}>
        {dragId &&
          (() => {
            const mon = roster.find((m) => m.id === dragId);
            return mon ? (
              <div className="strip-chip drag-overlay">
                <SpriteImg src={mon.spriteUrl} alt="" size={48} />
                <span>{mon.displayName}</span>
              </div>
            ) : null;
          })()}
      </DragOverlay>
    </DndContext>
  );
}
