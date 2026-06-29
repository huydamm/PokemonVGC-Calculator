import type { StatsTable } from '@pkmn/data';
import {
  type Conditions,
  type SideConditions,
  type Mods,
  type Weather,
  type Terrain,
  STAT_STAGE_KEYS,
  STATUS_LABELS,
} from '../services/conditions';

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: { value: T | undefined; label: string }[];
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div className="seg">
      <span className="seg-label">{label}</span>
      <div className="seg-btns">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            className={value === o.value ? 'on' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const SIDE_FLAGS: { key: keyof SideConditions; label: string }[] = [
  { key: 'lightScreen', label: 'Light Screen' },
  { key: 'reflect', label: 'Reflect' },
  { key: 'auroraVeil', label: 'Aurora Veil' },
  { key: 'tailwind', label: 'Tailwind' },
  { key: 'helpingHand', label: 'Helping Hand' },
  { key: 'friendGuard', label: 'Friend Guard' },
];

const STAT_LABEL: Record<string, string> = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

function clamp(n: number): number {
  return Math.max(-6, Math.min(6, n));
}

function PokemonMods({ title, mods, onChange }: { title: string; mods: Mods; onChange: (m: Mods) => void }) {
  const setBoost = (k: keyof StatsTable, v: number) =>
    onChange({ ...mods, boosts: { ...mods.boosts, [k]: clamp(v) } });
  return (
    <div className="cond-card">
      <h4>{title}</h4>
      <div className="stages">
        {STAT_STAGE_KEYS.map((k) => {
          const v = mods.boosts[k] ?? 0;
          return (
            <div className="stage" key={k}>
              <span>{STAT_LABEL[k]}</span>
              <button type="button" onClick={() => setBoost(k, v - 1)} aria-label={`lower ${k}`}>
                −
              </button>
              <b className={v > 0 ? 'pos' : v < 0 ? 'neg' : ''}>{v > 0 ? `+${v}` : v}</b>
              <button type="button" onClick={() => setBoost(k, v + 1)} aria-label={`raise ${k}`}>
                +
              </button>
            </div>
          );
        })}
      </div>
      <label className="editor-field">
        <span>Status</span>
        <select value={mods.status} onChange={(e) => onChange({ ...mods, status: e.target.value as Mods['status'] })}>
          {STATUS_LABELS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ConditionsPanel({
  conditions,
  setConditions,
  attackerMods,
  defenderMods,
  setAttackerMods,
  setDefenderMods,
  onReset,
}: {
  conditions: Conditions;
  setConditions: (c: Conditions) => void;
  attackerMods: Mods;
  defenderMods: Mods;
  setAttackerMods: (m: Mods) => void;
  setDefenderMods: (m: Mods) => void;
  onReset: () => void;
}) {
  const c = conditions;
  const set = (patch: Partial<Conditions>) => setConditions({ ...c, ...patch });
  const setSide = (which: 'attackerSide' | 'defenderSide', key: keyof SideConditions, v: boolean) =>
    set({ [which]: { ...c[which], [key]: v } } as Partial<Conditions>);

  return (
    <section className="conditions">
      <div className="cond-header">
        <h3>Battle conditions</h3>
        <button type="button" className="link" onClick={onReset}>
          reset
        </button>
      </div>
      <div className="cond-top">
        <Segmented<Weather>
          label="Weather"
          value={c.weather}
          onChange={(v) => set({ weather: v })}
          options={[
            { value: undefined, label: 'None' },
            { value: 'Sun', label: 'Sun' },
            { value: 'Rain', label: 'Rain' },
            { value: 'Sand', label: 'Sand' },
            { value: 'Snow', label: 'Snow' },
          ]}
        />
        <Segmented<Terrain>
          label="Terrain"
          value={c.terrain}
          onChange={(v) => set({ terrain: v })}
          options={[
            { value: undefined, label: 'None' },
            { value: 'Electric', label: 'Electric' },
            { value: 'Grassy', label: 'Grassy' },
            { value: 'Misty', label: 'Misty' },
            { value: 'Psychic', label: 'Psychic' },
          ]}
        />
      </div>

      <div className="cond-flags">
        <Check label="Critical hit" checked={c.crit} onChange={(v) => set({ crit: v })} />
        <Check label="Gravity" checked={c.gravity} onChange={(v) => set({ gravity: v })} />
        <Check label="Sword of Ruin (−Def)" checked={c.swordOfRuin} onChange={(v) => set({ swordOfRuin: v })} />
        <Check label="Beads of Ruin (−SpD)" checked={c.beadsOfRuin} onChange={(v) => set({ beadsOfRuin: v })} />
        <Check label="Tablets of Ruin (−Atk)" checked={c.tabletsOfRuin} onChange={(v) => set({ tabletsOfRuin: v })} />
        <Check label="Vessel of Ruin (−SpA)" checked={c.vesselOfRuin} onChange={(v) => set({ vesselOfRuin: v })} />
      </div>

      <div className="cond-sides">
        <div className="cond-card">
          <h4>Attacker side</h4>
          {SIDE_FLAGS.map((f) => (
            <Check
              key={f.key}
              label={f.label}
              checked={c.attackerSide[f.key]}
              onChange={(v) => setSide('attackerSide', f.key, v)}
            />
          ))}
        </div>
        <div className="cond-card">
          <h4>Defender side</h4>
          {SIDE_FLAGS.map((f) => (
            <Check
              key={f.key}
              label={f.label}
              checked={c.defenderSide[f.key]}
              onChange={(v) => setSide('defenderSide', f.key, v)}
            />
          ))}
        </div>
      </div>

      <div className="cond-sides">
        <PokemonMods title="Attacker stages" mods={attackerMods} onChange={setAttackerMods} />
        <PokemonMods title="Defender stages" mods={defenderMods} onChange={setDefenderMods} />
      </div>
    </section>
  );
}
