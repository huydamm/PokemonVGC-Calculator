import { useEffect, useState, type CSSProperties } from 'react';
import { createPokemon, createMove, runCalc, buildField, withCrit } from '../services/calc';
import { setToPokemonOptions, type RosterMon } from '../services/team';
import type { Conditions, Mods } from '../services/conditions';
import { heatBand } from '../services/heat';
import { Skeleton } from './Skeleton';

// EV steps swept along each axis (HP across, defensive stat down).
const STEPS = [0, 60, 124, 188, 252];

type Grid = { move: string; rows: number[][]; defKey: 'def' | 'spd' } | 'status' | 'error';

/**
 * Heatmap of the featured move's max damage as the DEFENDER varies HP (columns)
 * and its relevant defense EVs (rows): answers "how much bulk survives this hit?".
 * Other EVs/nature/item come from the current set. The 25 calcs run after a paint,
 * so the tab responds at once: a skeleton on first load, then the previous grid
 * stays up (aria-busy) while inputs change, so edits don't flash.
 */
export function Heatmap({
  attacker,
  defender,
  moveName,
  gameType,
  formatId,
  teraEnabled,
  conditions,
  attackerMods,
  defenderMods,
}: {
  attacker: RosterMon;
  defender: RosterMon;
  moveName: string;
  gameType: 'Singles' | 'Doubles';
  formatId: string;
  teraEnabled: boolean;
  conditions: Conditions;
  attackerMods: Mods;
  defenderMods: Mods;
}) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [busy, setBusy] = useState(true);

  // ponytail: the Calc panel stays mounted, so an open heatmap also recomputes while Field is
  // showing; pass an `active` flag from Tabs and skip the calcs if Field toggles ever feel slow
  useEffect(() => {
    setBusy(true);
    const compute = () => {
      try {
        const move = createMove(moveName, formatId);
        if (move.category === 'Status') return setGrid('status');
        const defKey: 'def' | 'spd' = move.category === 'Physical' ? 'def' : 'spd';
        const atk = createPokemon(attacker.set.species, {
          ...setToPokemonOptions(attacker.set),
          teraType: teraEnabled && attackerMods.tera ? attacker.set.teraType : undefined,
          boosts: attackerMods.boosts,
          status: attackerMods.status || undefined,
        });
        const field = buildField(gameType, conditions);
        const baseDef = setToPokemonOptions(defender.set);
        const rows = STEPS.map((defEv) =>
          STEPS.map((hp) => {
            const def = createPokemon(defender.set.species, {
              ...baseDef,
              teraType: teraEnabled && defenderMods.tera ? defender.set.teraType : undefined,
              boosts: defenderMods.boosts,
              status: defenderMods.status || undefined,
              evs: { ...defender.set.evs, hp, [defKey]: defEv },
            });
            try {
              const move = withCrit(createMove(moveName, formatId, conditions.singleTarget), conditions.crit);
              return runCalc(atk, def, move, field, formatId).percent[1];
            } catch {
              return 0; // the engine throws on 0-damage results
            }
          }),
        );
        setGrid({ move: moveName, rows, defKey });
      } catch {
        setGrid('error');
      } finally {
        setBusy(false);
      }
    };
    // Two frames: the first paints the skeleton/busy state, the second runs the calcs.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(compute);
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [attacker, defender, moveName, gameType, formatId, teraEnabled, conditions, attackerMods, defenderMods]);

  if (grid === 'status') return <p className="muted">No damage to map for this move.</p>;
  if (grid === 'error') return <p className="muted">Couldn't calculate a heatmap for this move.</p>;

  if (!grid) {
    return (
      <div className="heatmap" aria-busy="true">
        <span className="sr-only">Calculating heatmap…</span>
        <Skeleton className="heatmap-note-skel" w="70%" h="0.9rem" />
        <div className="heatmap-skel">
          {Array.from({ length: 36 }, (_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="heatmap" aria-busy={busy ? true : undefined}>
      <p className="heatmap-note">
        Max % of HP from <strong>{grid.move}</strong> as the defender invests HP (→) and{' '}
        {grid.defKey === 'def' ? 'Defense' : 'Sp. Def'} (↓). Green survives, red is an OHKO. Other EVs from the set.
      </p>
      <table className="heatmap-table">
        <thead>
          <tr>
            <th>{grid.defKey === 'def' ? 'Def' : 'SpD'} \ HP</th>
            {STEPS.map((hp) => (
              <th key={hp}>{hp}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row, i) => (
            <tr key={STEPS[i]}>
              <th>{STEPS[i]}</th>
              {row.map((pct, j) => (
                <td
                  key={STEPS[j]}
                  className={`heat heat-${heatBand(pct)}`}
                  style={{ '--i': i * STEPS.length + j } as CSSProperties}
                  title={`${pct}%`}
                >
                  {pct}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
