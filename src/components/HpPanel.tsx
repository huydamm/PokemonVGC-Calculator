import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { hpState } from '../services/hp';
import { koText, type MoveResult } from '../services/results';

/**
 * Defender HP after the selected move: a pixel HP bar (solid = HP left after the
 * max roll, darker = the rest of the roll range) plus the damage range, % and KO
 * text. The bar is keyed by defender + move, so a new pick remounts it and the
 * CSS drain replays; smaller input changes just transition the width.
 */
export function HpPanel({ defenderName, row }: { defenderName: string; row?: MoveResult }) {
  const r = row?.r ?? null;
  const hp = hpState(r ? r.percent : null);
  const ko = r && !hp.noDamage ? koText(r) : '';
  const pctText = r && !hp.noDamage
    ? `${r.percent[0]}–${r.percent[1]}%`
    : row?.category === 'Status'
      ? 'Status move'
      : 'No effect (0%)';

  // Announce only when the move or defender changes, not on every EV keystroke.
  const summary = row ? `${row.name} on ${defenderName}: ${pctText}${ko ? `, ${ko}` : ''}` : '';
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    setAnnouncement(summaryRef.current);
  }, [defenderName, row?.name]);

  if (!row) return null;
  return (
    <div className="hp-panel">
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <div className="hp-head">
        <span className="hp-move">{row.name}</span>
        <span className="hp-range-num">{r && !hp.noDamage ? `${r.range[0]}–${r.range[1]}` : '-'}</span>
      </div>
      <div
        key={`${defenderName}|${row.name}`}
        className={`hp-bar band-${hp.band}${hp.ko === 'guaranteed' ? ' ko' : ''}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hp.leftMax}
        aria-valuetext={`${hp.leftMax}% HP left${hp.ko === 'guaranteed' ? ', KO' : ''}`}
        aria-label={`${defenderName} HP after ${row.name}`}
        style={{ '--left-max': `${hp.leftMax}%`, '--left-min': `${hp.leftMin}%` } as CSSProperties}
      >
        <span className="hp-label" aria-hidden="true">
          {hp.ko === 'guaranteed' ? 'KO' : 'HP'}
        </span>
        <span className="hp-track" aria-hidden="true">
          <span className="hp-range" />
          <span className="hp-fill" />
        </span>
      </div>
      <div className="hp-result">
        <span className="hp-pct">{pctText}</span>
        {ko && <span className={`hp-ko${(r?.ko.chance ?? 0) >= 1 ? ' guaranteed' : ''}`}>{ko}</span>}
      </div>
      {r && !hp.noDamage && <code className="hp-desc">{r.desc}</code>}
    </div>
  );
}
