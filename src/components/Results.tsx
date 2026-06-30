import { useMemo, useState } from 'react';
import { createPokemon, createMove, runCalc, buildField, withCrit, type DamageResult } from '../services/calc';
import { setToPokemonOptions, type RosterMon } from '../services/team';
import type { Conditions, Mods } from '../services/conditions';
import { Heatmap } from './Heatmap';

interface MoveResult {
  name: string;
  r: DamageResult | null;
}

/** KO summary text: prefer the engine's, else the tail of the description. */
function koText(r: DamageResult): string {
  if (r.ko.text) return r.ko.text;
  const tail = r.desc.split('--')[1]?.trim();
  return tail || (r.range[1] === 0 ? 'no damage' : '');
}

export function Results({
  attacker,
  defender,
  gameType,
  teraEnabled,
  conditions,
  attackerMods,
  defenderMods,
}: {
  attacker: RosterMon;
  defender: RosterMon;
  gameType: 'Singles' | 'Doubles';
  teraEnabled: boolean;
  conditions: Conditions;
  attackerMods: Mods;
  defenderMods: Mods;
}) {
  const rows = useMemo<MoveResult[]>(() => {
    const atk = createPokemon(attacker.set.species, {
      ...setToPokemonOptions(attacker.set),
      teraType: teraEnabled && attackerMods.tera ? attacker.set.teraType : undefined,
      boosts: attackerMods.boosts,
      status: attackerMods.status || undefined,
    });
    const def = createPokemon(defender.set.species, {
      ...setToPokemonOptions(defender.set),
      teraType: teraEnabled && defenderMods.tera ? defender.set.teraType : undefined,
      boosts: defenderMods.boosts,
      status: defenderMods.status || undefined,
    });
    const field = buildField(gameType, conditions);
    const moves = (attacker.set.moves ?? []).filter(Boolean);
    return moves.map((name) => {
      try {
        return { name, r: runCalc(atk, def, withCrit(createMove(name), conditions.crit), field) };
      } catch {
        return { name, r: null };
      }
    });
  }, [attacker, defender, gameType, teraEnabled, conditions, attackerMods, defenderMods]);

  // Feature the highest-damage move by default; let the user pick another.
  const defaultFeature = useMemo(() => {
    let best = 0;
    let idx = 0;
    rows.forEach((row, i) => {
      const top = row.r?.range[1] ?? 0;
      if (top > best) {
        best = top;
        idx = i;
      }
    });
    return rows[idx]?.name;
  }, [rows]);

  const [featured, setFeatured] = useState<string | undefined>(undefined);
  const featuredName = featured && rows.some((r) => r.name === featured) ? featured : defaultFeature;
  const featuredRow = rows.find((r) => r.name === featuredName);

  if (rows.length === 0) return <p className="muted">Attacker has no moves selected.</p>;

  return (
    <div className="results">
      {featuredRow?.r && (
        <div className="featured">
          <div className="featured-head">
            <span className="featured-move">{featuredRow.name}</span>
            <span className="featured-range">
              {featuredRow.r.range[0]}–{featuredRow.r.range[1]} ({featuredRow.r.percent[0]}–{featuredRow.r.percent[1]}%)
            </span>
          </div>
          <div className={`featured-ko${(featuredRow.r.ko.chance ?? 0) >= 1 ? ' guaranteed' : ''}`}>
            {koText(featuredRow.r) || '—'}
          </div>
          <code className="featured-desc">{featuredRow.r.desc}</code>
          <details className="heatmap-details">
            <summary>Bulk heatmap — does the defender survive?</summary>
            <Heatmap
              attacker={attacker}
              defender={defender}
              moveName={featuredRow.name}
              gameType={gameType}
              teraEnabled={teraEnabled}
              conditions={conditions}
              attackerMods={attackerMods}
              defenderMods={defenderMods}
            />
          </details>
        </div>
      )}

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
            <tr
              key={name}
              className={name === featuredName ? 'featured-row' : ''}
              onClick={() => setFeatured(name)}
              style={{ cursor: 'pointer' }}
            >
              <td>{name}</td>
              <td>{r ? `${r.range[0]}–${r.range[1]}` : '—'}</td>
              <td>{r ? `${r.percent[0]}–${r.percent[1]}%` : '—'}</td>
              <td className="ko">{r ? koText(r) : 'status / no damage'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
