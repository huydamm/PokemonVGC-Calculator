import { useMemo } from 'react';
import { createPokemon, createMove, runCalc, buildField, withCrit } from '../services/calc';
import { setToPokemonOptions, type RosterMon } from '../services/team';
import type { Conditions, Mods } from '../services/conditions';

// EV steps swept along each axis (HP across, defensive stat down).
const STEPS = [0, 60, 124, 188, 252];

/** Background colour for a damage %: green (safe) -> amber -> red (OHKO). */
function cellColor(pct: number): string {
  const t = Math.min(pct, 100) / 100; // 0..1
  const hue = (1 - t) * 140; // 140 green -> 0 red
  const sat = pct >= 100 ? 70 : 55;
  return `hsl(${hue} ${sat}% 30%)`;
}

/**
 * Heatmap of the featured move's max damage as the DEFENDER varies HP (columns)
 * and its relevant defense EVs (rows) — answers "how much bulk survives this hit?".
 * Other EVs/nature/item come from the current set.
 */
export function Heatmap({
  attacker,
  defender,
  moveName,
  gameType,
  teraEnabled,
  conditions,
  attackerMods,
  defenderMods,
}: {
  attacker: RosterMon;
  defender: RosterMon;
  moveName: string;
  gameType: 'Singles' | 'Doubles';
  teraEnabled: boolean;
  conditions: Conditions;
  attackerMods: Mods;
  defenderMods: Mods;
}) {
  const grid = useMemo(() => {
    const move = createMove(moveName);
    if (move.category === 'Status') return null;
    const defKey: 'def' | 'spd' = move.category === 'Physical' ? 'def' : 'spd';

    const atk = createPokemon(attacker.set.species, {
      ...setToPokemonOptions(attacker.set),
      teraType: teraEnabled && attackerMods.tera ? attacker.set.teraType : undefined,
      boosts: attackerMods.boosts,
      status: attackerMods.status || undefined,
    });
    const field = buildField(gameType, conditions);
    const baseDef = setToPokemonOptions(defender.set);

    // rows = defensive EV (top→bottom: 252→0 so bulkier is at the bottom-left visual? keep 0→252 top→down)
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
          return runCalc(atk, def, withCrit(createMove(moveName), conditions.crit), field).percent[1];
        } catch {
          return 0;
        }
      }),
    );
    return { rows, defKey };
  }, [attacker, defender, moveName, gameType, teraEnabled, conditions, attackerMods, defenderMods]);

  if (!grid) return <p className="muted">No damage to map for this move.</p>;

  return (
    <div className="heatmap">
      <p className="heatmap-note">
        Max % of HP from <strong>{moveName}</strong> as the defender invests HP (→) and{' '}
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
                <td key={STEPS[j]} style={{ background: cellColor(pct) }} title={`${pct}%`}>
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
