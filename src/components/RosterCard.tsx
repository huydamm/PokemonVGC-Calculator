import { SUBSTITUTE_SPRITE, typeColor } from '../services/sprites';
import type { RosterMon } from '../services/team';
import type { StatsTable } from '@pkmn/data';

const STAT_LABELS: [keyof StatsTable, string][] = [
  ['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe'],
];

export function evSummary(evs?: Partial<StatsTable>): string {
  if (!evs) return '';
  return STAT_LABELS.filter(([k]) => (evs[k] ?? 0) > 0)
    .map(([k, label]) => `${evs[k]} ${label}`)
    .join(' / ');
}

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="chip"
      style={color ? { background: color, color: '#fff', borderColor: color } : undefined}
    >
      {label}
    </span>
  );
}

export interface RosterCardProps {
  mon: RosterMon;
  compact?: boolean;
  onAssign?: (slot: 'attacker' | 'defender') => void;
}

/** Presentational team card: sprite, name, forme, item, tera, ability, spread. */
export function RosterCard({ mon, compact, onAssign }: RosterCardProps) {
  const accent = typeColor(mon.types[0]);
  const evs = evSummary(mon.set.evs);
  return (
    <div className="card" style={{ borderLeft: `4px solid ${accent}` }}>
      <img
        className="card-sprite"
        src={mon.spriteUrl}
        alt={mon.speciesName}
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = SUBSTITUTE_SPRITE;
        }}
      />
      <div className="card-body">
        <div className="card-title">
          <strong>{mon.displayName}</strong>
          {mon.forme && <Chip label={mon.forme} color={accent} />}
        </div>
        <div className="card-types">
          {mon.types.map((t) => (
            <Chip key={t} label={t} color={typeColor(t)} />
          ))}
          {mon.teraType && <Chip label={`Tera ${mon.teraType}`} color={typeColor(mon.teraType)} />}
        </div>
        {!compact && (
          <div className="card-meta">
            {mon.set.item && <span>@ {mon.set.item}</span>}
            {mon.set.ability && <span>· {mon.set.ability}</span>}
            {mon.set.nature && <span>· {mon.set.nature}</span>}
            {evs && <span className="card-evs">· {evs}</span>}
          </div>
        )}
      </div>
      {onAssign && (
        <div className="card-assign">
          <button type="button" onClick={() => onAssign('attacker')} title="Use as attacker">
            ⚔
          </button>
          <button type="button" onClick={() => onAssign('defender')} title="Use as defender">
            🛡
          </button>
        </div>
      )}
    </div>
  );
}
