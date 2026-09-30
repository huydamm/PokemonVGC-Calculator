import { useMemo } from 'react';
import { parseTeam } from '../services/team';
import { getFormat } from '../services/formats';
import type { BoxTeam } from '../services/team-box';
import { SpriteImg } from './SpriteImg';

/** Saved teams, newest first. Picking one loads its paste; the paste box below edits it. */
export function TeamBox({
  teams,
  activeId,
  onLoad,
  onCopy,
  onDelete,
}: {
  teams: BoxTeam[];
  activeId: string | null;
  onLoad: (t: BoxTeam) => void;
  onCopy: (t: BoxTeam) => void;
  onDelete: (t: BoxTeam) => void;
}) {
  const mons = useMemo(() => new Map(teams.map((t) => [t.id, parseTeam(t.paste).roster.slice(0, 6)])), [teams]);
  if (teams.length === 0) return null;
  return (
    <div className="team-box" id="team-box" tabIndex={-1} aria-labelledby="team-box-title">
      <p className="section-title" id="team-box-title">
        Your box
      </p>
      <ul className="box-list">
        {teams.map((t) => (
          <li key={t.id} className={`box-card${t.id === activeId ? ' active' : ''}`}>
            <button
              type="button"
              className="box-load"
              onClick={() => onLoad(t)}
              aria-current={t.id === activeId ? true : undefined}
            >
              <span className="box-sprites" aria-hidden="true">
                {mons.get(t.id)?.map((m) => <SpriteImg key={m.id} src={m.spriteUrl} alt="" size={32} />)}
              </span>
              <span className="box-name">{t.name}</span>
              <span className="box-meta">
                {getFormat(t.formatId).label} · {new Date(t.updatedAt).toLocaleDateString()}
              </span>
            </button>
            <div className="box-actions">
              <button type="button" className="link" onClick={() => onCopy(t)} aria-label={`Copy ${t.name} as a Showdown paste`}>
                copy
              </button>
              <button type="button" className="link" onClick={() => onDelete(t)} aria-label={`Delete ${t.name}`}>
                delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
