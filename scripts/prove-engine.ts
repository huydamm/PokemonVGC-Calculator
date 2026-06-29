/**
 * Milestone 1 proof: wire @smogon/calc/adaptable to @pkmn/data + @pkmn/dex and
 * produce a correct damage range + description, including a Mega forme.
 *
 * Strategy: the bundled `@smogon/calc` entry IS the engine behind the real
 * Showdown calculator, so we run the SAME matchup through both the bundled
 * entry and the adaptable entry (fed by @pkmn/data). Equal output proves the
 * adaptable wiring is correct.
 */
import * as Adaptable from '@smogon/calc/dist/adaptable';
import * as Bundled from '@smogon/calc';
import { gen } from '../src/services/data';

type Case = {
  name: string;
  attacker: string;
  defender: string;
  move: string;
  field?: any;
  atkOpts?: any;
  defOpts?: any;
};

const cases: Case[] = [
  {
    name: 'Sun-boosted Fire move under Light Screen',
    attacker: 'Charizard',
    defender: 'Garchomp',
    move: 'Flamethrower',
    atkOpts: { evs: { spa: 252 }, nature: 'Modest', item: 'Choice Specs' },
    defOpts: { evs: { hp: 4 } },
    field: { weather: 'Sun', defenderSide: { isLightScreen: true } },
  },
  {
    name: 'Mega forme resolves (Charizard-Mega-Y, Drought, SpA 159)',
    attacker: 'Charizard-Mega-Y',
    defender: 'Garchomp',
    move: 'Flamethrower',
    atkOpts: { evs: { spa: 252 }, nature: 'Modest' },
    defOpts: { evs: { hp: 4 } },
    field: { weather: 'Sun' },
  },
];

function run(lib: any, genArg: any, c: Case) {
  const atk = new lib.Pokemon(genArg, c.attacker, { level: 50, ...c.atkOpts });
  const def = new lib.Pokemon(genArg, c.defender, { level: 50, ...c.defOpts });
  const move = new lib.Move(genArg, c.move);
  const field = new lib.Field({ gameType: 'Doubles', ...(c.field ?? {}) });
  const res = lib.calculate(genArg, atk, def, move, field);
  const dmg = res.damage as number | number[];
  const range = Array.isArray(dmg) ? [dmg[0], dmg[dmg.length - 1]] : [dmg, dmg];
  return { desc: res.desc(), range, atkSpA: atk.stats.spa, atkSpe: atk.stats.spe, ability: atk.ability };
}

let ok = true;
for (const c of cases) {
  const bundled = run(Bundled, 9, c);
  const adaptable = run(Adaptable, gen, c);
  const match =
    bundled.desc === adaptable.desc &&
    bundled.range[0] === adaptable.range[0] &&
    bundled.range[1] === adaptable.range[1];
  ok &&= match;
  console.log(`\n=== ${c.name} ===`);
  console.log(`  attacker SpA=${adaptable.atkSpA} Spe=${adaptable.atkSpe} ability=${adaptable.ability}`);
  console.log(`  bundled : [${bundled.range}] ${bundled.desc}`);
  console.log(`  adaptable: [${adaptable.range}] ${adaptable.desc}`);
  console.log(`  match: ${match ? 'YES' : 'NO <-- MISMATCH'}`);
}

console.log(`\n${ok ? 'ALL CASES MATCH — engine wiring proven.' : 'MISMATCH DETECTED'}`);
process.exit(ok ? 0 : 1);
