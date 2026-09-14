import { useState, type CSSProperties } from 'react';
import type { RosterMon } from '../services/team';
import type { Conditions, Mods } from '../services/conditions';
import { koText, type MoveResult } from '../services/results';
import { Heatmap } from './Heatmap';
import { Tabs } from './Tabs';

/**
 * Details under the slots: every move's roll (Moves) and the bulk grid (Heatmap).
 * Rows and the selected move come from App, shared with the move menu and HP bar.
 */
export function Results({
  rows,
  featuredName,
  onFeature,
  attacker,
  defender,
  gameType,
  formatId,
  teraEnabled,
  conditions,
  attackerMods,
  defenderMods,
}: {
  rows: MoveResult[];
  featuredName?: string;
  onFeature: (name: string) => void;
  attacker: RosterMon;
  defender: RosterMon;
  gameType: 'Singles' | 'Doubles';
  formatId: string;
  teraEnabled: boolean;
  conditions: Conditions;
  attackerMods: Mods;
  defenderMods: Mods;
}) {
  const [view, setView] = useState<'moves' | 'heatmap'>('moves');

  if (rows.length === 0) return <p className="muted">Attacker has no moves selected.</p>;

  return (
    <div className="results">
      <Tabs
        idPrefix="results"
        ariaLabel="Results view"
        size="sm"
        active={view}
        onChange={setView}
        tabs={[
          { id: 'moves', label: 'Moves' },
          { id: 'heatmap', label: 'Heatmap' },
        ]}
      >
        {(id) =>
          id === 'moves' ? (
            <div className="moves-scroll">
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
                  {rows.map(({ name, r, category }, i) => (
                    <tr
                      key={name}
                      className={name === featuredName ? 'featured-row' : ''}
                      onClick={() => onFeature(name)}
                      style={{ cursor: 'pointer', '--i': Math.min(i, 12) } as CSSProperties}
                    >
                      <td>{name}</td>
                      <td className="num">{r ? `${r.range[0]}–${r.range[1]}` : '-'}</td>
                      <td className="num">{r ? `${r.percent[0]}–${r.percent[1]}%` : '-'}</td>
                      <td className="ko">{r ? koText(r) : category === 'Status' ? 'status' : 'no effect (0%)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Heatmap
              attacker={attacker}
              defender={defender}
              moveName={featuredName ?? ''}
              gameType={gameType}
              formatId={formatId}
              teraEnabled={teraEnabled}
              conditions={conditions}
              attackerMods={attackerMods}
              defenderMods={defenderMods}
            />
          )
        }
      </Tabs>
    </div>
  );
}
