/**
 * Precompute the legal species pool per app format, exact to Showdown's own
 * rules, and emit it as a static JSON the app ships (so @pkmn/sim stays a
 * dev-only dependency and never bloats the browser bundle).
 *
 * Each app format maps to the closest Showdown format id @pkmn/sim publishes.
 * Sim data lags the live ladder: as of @pkmn/sim 0.10.x the newest VGC is
 * Reg I (2025) and there is no "Pokémon Champions" format at all, so the two
 * Doubles formats both borrow Reg I's restricted-Doubles pool. Megas are
 * reached via the forme toggle, not the species search, so the base-species
 * pool is all the picker needs.
 *
 * Run: npx tsx scripts/gen-legal.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TeamValidator } from '@pkmn/sim';

// app format id -> Showdown sim format id (closest available)
const FORMAT_MAP: Record<string, string> = {
  gen9ou: 'gen9ou',
  gen9vgc2026: 'gen9vgc2025regi',
  gen9champions: 'gen9vgc2025regi',
};

// Problems that mean the species itself is illegal for the format (as opposed
// to set-construction noise about EVs/IVs/moves we deliberately leave invalid).
const BANNED = /banned|unreleased|does not exist|cannot be used|is not obtainable|not available/i;

function legalIds(simFormat: string, level: number): string[] {
  const tv = new TeamValidator(simFormat);
  const ids: string[] = [];
  for (const sp of tv.dex.species.all()) {
    if (!sp.exists || sp.isNonstandard === 'Future' || sp.isNonstandard === 'CAP') continue;
    const set = {
      name: sp.name,
      species: sp.name,
      level,
      gender: '',
      ability: Object.values(sp.abilities)[0] ?? '',
      item: '',
      moves: ['Tackle'],
      evs: { hp: 4 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      nature: 'Hardy',
      shiny: false,
    };
    const problems = tv.validateSet(set as never, {});
    if (!problems || !problems.some((m) => BANNED.test(m))) ids.push(sp.id);
  }
  return ids.sort();
}

const LEVEL: Record<string, number> = { gen9ou: 100, gen9vgc2026: 50, gen9champions: 50 };
const out: Record<string, string[]> = {};
for (const [appId, simId] of Object.entries(FORMAT_MAP)) {
  out[appId] = legalIds(simId, LEVEL[appId]);
  console.log(`${appId} (${simId}): ${out[appId].length} legal species`);
}

const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'services', 'legal-species.json');
writeFileSync(dest, JSON.stringify(out) + '\n');
console.log(`wrote ${dest}`);
