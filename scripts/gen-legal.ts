/**
 * Precompute per-format legal species + items and the Champions data patches as
 * static JSON the app ships, so @pkmn/sim stays a dev-only dependency.
 *
 * - gen9ou / gen9doublesou: exact Showdown rules via @pkmn/sim.
 * - gen9champions: Showdown's own `data/mods/champions` (formats-data + items),
 *   fetched at a pinned commit, because @pkmn/sim ships no champions mod. Bump
 *   SD_SHA when Showdown adds a new regulation.
 * - champions-dex-patch.json: abilities/stats/types where Showdown's Champions
 *   species differ from @pkmn/dex, which lags regulations (Reg M-C Z Megas).
 *   Becomes `{}` on its own once @pkmn/dex catches up.
 * - champions-moves.json: damage-relevant Champions move changes (`patch`) and
 *   moves Champions re-enables (`admit`), applied by champions-mechanics.ts.
 *
 * Showdown's TS data is transpiled and evaluated (sd-data.ts), not regex-parsed.
 * Megas are reached via the forme toggle, so the species pool is non-Mega only.
 *
 * Run: npm run gen:legal
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Dex, TeamValidator } from '@pkmn/sim';
import { Dex as AppDex } from '@pkmn/dex';
import { isMegaSpecies } from '../src/services/mega';
import { loadSdExport, diffChampionsMoves, type DexMoveLike } from './sd-data';

// smogon/pokemon-showdown master, 2026-09-12 (Champions Regulation M-C).
const SD_SHA = 'aa17ca0fac8bc5605df673bd8774c2d0e91efa43';

// app format id -> Showdown sim format id (for the sim-derived pools)
const SIM_FORMAT: Record<string, { id: string; level: number }> = {
  gen9ou: { id: 'gen9ou', level: 100 },
  gen9doublesou: { id: 'gen9doublesou', level: 100 },
};

// Problems that mean the species itself is illegal for the format (as opposed
// to set-construction noise about EVs/IVs/moves we deliberately leave invalid).
const BANNED = /banned|unreleased|does not exist|cannot be used|is not obtainable|not available/i;

function simLegalIds(simFormat: string, level: number): string[] {
  const tv = new TeamValidator(simFormat);
  const ids: string[] = [];
  for (const sp of tv.dex.species.all()) {
    if (!sp.exists || sp.isNonstandard === 'Future' || sp.isNonstandard === 'CAP') continue;
    // Legal if ANY ability passes: testing only the first one read a banned ability
    // as a banned species (Garchomp's Sand Veil in OU dropped Garchomp).
    const abilities = Object.values(sp.abilities).filter(Boolean) as string[];
    const legal = (abilities.length ? abilities : ['']).some((ability) => {
      const set = {
        name: sp.name,
        species: sp.name,
        level,
        gender: '',
        ability,
        item: '',
        moves: ['Tackle'],
        evs: { hp: 4 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        nature: 'Hardy',
        shiny: false,
      };
      const problems = tv.validateSet(set as never, {});
      return !problems || !problems.some((m) => BANNED.test(m));
    });
    if (legal) ids.push(sp.id);
  }
  return ids.sort();
}

async function sdFile(path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/smogon/pokemon-showdown/${SD_SHA}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

type Entry = { isNonstandard?: string | null; tier?: string };

/** Champions-legal species from Showdown's champions formats-data. */
function championsSpecies(formatsData: Record<string, Entry>) {
  const dex = Dex.forGen(9);
  const ids: string[] = []; // pickable (non-Mega, non-battle-only)
  const all: string[] = []; // every legal species name, Megas included (for the patch)
  const unknown: string[] = [];
  for (const [id, entry] of Object.entries(formatsData)) {
    if (entry.isNonstandard || entry.tier === 'Illegal') continue;
    const sp = dex.species.get(id);
    if (!sp.exists) {
      unknown.push(id);
      continue;
    }
    all.push(sp.name);
    if (!isMegaSpecies(sp) && !sp.battleOnly) ids.push(sp.id);
  }
  // Formes with no entry of their own inherit their base's legality in Showdown
  // (Meowstic-F, Maushold-Four); cosmetic and battle-only formes stay out.
  const legalBases = new Set(ids);
  for (const sp of dex.species.all()) {
    if (!sp.exists || sp.id in formatsData || sp.battleOnly || isMegaSpecies(sp)) continue;
    const base = dex.species.get(sp.baseSpecies);
    if (legalBases.has(base.id) && !(base.cosmeticFormes ?? []).includes(sp.name)) {
      ids.push(sp.id);
      all.push(sp.name);
    }
  }
  if (unknown.length) console.warn(`  Champions: ${unknown.length} ids not in dex (skipped): ${unknown.join(', ')}`);
  return { ids: [...new Set(ids)].sort(), all };
}

/** Champions-legal items: champions items.ts overrides on top of the Gen 9 item pool. */
function championsItems(items: Record<string, Entry>): string[] {
  const names: string[] = [];
  for (const it of Dex.forGen(9).items.all()) {
    const entry = items[it.id];
    const inherits = !entry || !('isNonstandard' in entry);
    const legal = inherits ? it.exists && !it.isNonstandard : entry.isNonstandard === null;
    if (legal) names.push(it.name);
  }
  return [...new Set(names)].sort();
}

type SpeciesFields = { abilities?: Record<string, string>; baseStats?: Record<string, number>; types?: string[] };

/** Fields where Showdown's pokedex differs from @pkmn/dex, for the given species. */
function championsPatch(pokedex: Record<string, SpeciesFields>, names: string[]): Record<string, SpeciesFields> {
  const dex = AppDex.forGen(9);
  const patch: Record<string, SpeciesFields> = {};
  for (const name of names) {
    const sp = dex.species.get(name);
    const sd = sp?.exists ? pokedex[sp.id] : undefined;
    if (!sp || !sd) continue;
    const diff: SpeciesFields = {};
    for (const key of ['abilities', 'baseStats', 'types'] as const) {
      const v = sd[key];
      if (v && Object.keys(v).length && JSON.stringify(v) !== JSON.stringify(sp[key])) {
        (diff as Record<string, unknown>)[key] = v;
      }
    }
    if (Object.keys(diff).length) patch[sp.id] = diff;
  }
  return patch;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'services');
const prev = (file: string): Record<string, unknown> =>
  existsSync(join(dir, file)) ? JSON.parse(readFileSync(join(dir, file), 'utf8')) : {};

// A parse that silently yields far fewer entries means Showdown's layout moved.
function guard(label: string, next: unknown[], old: unknown): void {
  if (Array.isArray(old) && next.length < old.length * 0.8) {
    throw new Error(`${label}: ${next.length} entries, previous ${old.length}. Showdown layout changed? Not writing.`);
  }
}

const [formatsSrc, itemsSrc, pokedexSrc, movesSrc] = await Promise.all([
  sdFile('data/mods/champions/formats-data.ts'),
  sdFile('data/mods/champions/items.ts'),
  sdFile('data/pokedex.ts'),
  sdFile('data/mods/champions/moves.ts'),
]);

const species: Record<string, string[]> = {};
for (const [appId, { id, level }] of Object.entries(SIM_FORMAT)) {
  species[appId] = simLegalIds(id, level);
  console.log(`${appId} (${id}): ${species[appId].length} legal species`);
}
const champ = championsSpecies(loadSdExport(formatsSrc, 'FormatsData'));
species.gen9champions = champ.ids;
const items: Record<string, string[]> = { gen9champions: championsItems(loadSdExport(itemsSrc, 'Items')) };
const patch = championsPatch(loadSdExport(pokedexSrc, 'Pokedex'), champ.all);
const appDex = AppDex.forGen(9);
const { ignored, ...moves } = diffChampionsMoves(
  loadSdExport(movesSrc, 'Moves'),
  (id) => appDex.moves.get(id) as unknown as DexMoveLike,
);

guard('gen9champions species', species.gen9champions, (prev('legal-species.json') as Record<string, unknown>).gen9champions);
guard('gen9champions items', items.gen9champions, (prev('legal-items.json') as Record<string, unknown>).gen9champions);
guard('champions move patch', Object.keys(moves.patch), Object.keys((prev('champions-moves.json').patch as object) ?? {}));
guard('champions admitted moves', moves.admit, prev('champions-moves.json').admit);
const ignoredIds = Object.keys(ignored);
if (ignoredIds.length) {
  console.warn(`  champions moves: other changed keys, not patched (check for damage effects):`);
  for (const id of ignoredIds) console.warn(`    ${id}: ${ignored[id].join(', ')}`);
}

console.log(`gen9champions (Showdown ${SD_SHA.slice(0, 7)}): ${species.gen9champions.length} species, ${items.gen9champions.length} items`);
console.log(`champions dex patch: ${Object.keys(patch).length} species (${Object.keys(patch).join(', ') || 'none'})`);
console.log(`champions moves: ${Object.keys(moves.patch).length} patched, ${moves.admit.length} admitted (${moves.admit.join(', ')})`);
writeFileSync(join(dir, 'legal-species.json'), JSON.stringify(species) + '\n');
writeFileSync(join(dir, 'legal-items.json'), JSON.stringify(items) + '\n');
writeFileSync(join(dir, 'champions-dex-patch.json'), JSON.stringify(patch, null, 1) + '\n');
writeFileSync(join(dir, 'champions-moves.json'), JSON.stringify(moves, null, 1) + '\n');
console.log('wrote legal-species.json, legal-items.json, champions-dex-patch.json, champions-moves.json');
