/**
 * Single source of truth for dex data.
 *
 * Builds the Gen 9 `Generation` from @pkmn/dex and shares it with the
 * @smogon/calc *adaptable* engine (see calc.ts) so data is never shipped twice.
 *
 * VGC nuance: both SV-VGC and Champions-VGC run on the Gen 9 engine. SV has no
 * Mega Evolution, so @pkmn/data's default `exists` filter (which drops anything
 * flagged `isNonstandard`) correctly hides Megas. Champions RE-ENABLES Megas,
 * which are just `isNonstandard: 'Past'` formes already present in @pkmn/dex.
 * We admit those Mega/Primal formes back into the Gen 9 data layer so a single
 * data source can drive both formats; brand-new Champions-only Megas that never
 * shipped on cartridge simply aren't in the data and fall back gracefully.
 */
import { Dex } from '@pkmn/dex';
import { Generations, type Generation, type Data } from '@pkmn/data';
import legalSpecies from './legal-species.json';

const MEGA_FORMES = new Set(['Mega', 'Mega-X', 'Mega-Y', 'Primal']);

// Pokémon Champions has its own dex: it includes species that left the Gen 9
// games (flagged `Past` here) and are otherwise dropped. Re-admit that roster so
// the data layer can represent them (see gen-legal.ts). Per-format pickers still
// gate on the same list, so Champions mons don't leak into OU/Doubles.
const CHAMPIONS_IDS = new Set((legalSpecies as Record<string, string[]>).gen9champions ?? []);

/** True for the Mega/Primal species formes we want re-admitted into Gen 9. */
function isMegaForme(d: Data): boolean {
  return (
    'forme' in d &&
    typeof (d as { forme?: unknown }).forme === 'string' &&
    MEGA_FORMES.has((d as { forme: string }).forme)
  );
}

/** DEFAULT_EXISTS, plus: keep Mega/Primal formes and the Champions roster. */
function existsWithMegas(d: Data): boolean {
  if (!d.exists) return false;
  if ('isNonstandard' in d && d.isNonstandard) {
    // Re-admit Mega/Primal formes and Champions-roster species (all `Past` in
    // Gen 9); reject everything else.
    return isMegaForme(d) || (d.kind === 'Species' && CHAMPIONS_IDS.has(d.id));
  }
  if (d.kind === 'Ability' && d.id === 'noability') return false;
  return !('tier' in d && ['Illegal', 'Unreleased'].includes((d as { tier: string }).tier));
}

const gens = new Generations(Dex, existsWithMegas);

/** The shared Gen 9 generation, with classic Megas available as formes. */
export const gen: Generation = gens.get(9);

// Full dex option lists (memoized) — for manual overrides when usage data is
// missing, so any legal item/move/type/ability can still be chosen.
let itemsCache: string[] | null = null;
let movesCache: string[] | null = null;
let typesCache: string[] | null = null;

export function allItems(): string[] {
  if (!itemsCache) itemsCache = Array.from(gen.items, (i) => i.name).sort();
  return itemsCache;
}

// Mega Stones / Primal Orbs, derived from the formes that require them. Surfaced
// first in the item picker for Mega formats (Champions), where they matter and
// there's no usage data to rank by.
let megaStoneCache: string[] | null = null;
export function megaStones(): string[] {
  if (megaStoneCache) return megaStoneCache;
  const s = new Set<string>();
  for (const sp of gen.species) {
    if ((sp.isMega || sp.isPrimal) && sp.requiredItem) s.add(sp.requiredItem);
  }
  megaStoneCache = [...s].sort();
  return megaStoneCache;
}
export function allMoves(): string[] {
  if (!movesCache) movesCache = Array.from(gen.moves, (m) => m.name).sort();
  return movesCache;
}
export function allTypes(): string[] {
  if (!typesCache) typesCache = Array.from(gen.types, (t) => t.name).filter((n) => n !== '???').sort();
  return typesCache;
}
/** The species' possible abilities (slots 0/1/Hidden). */
export function abilitiesFor(species: string): string[] {
  const sp = gen.species.get(species);
  return sp ? (Object.values(sp.abilities).filter(Boolean) as string[]) : [];
}

/** The Mega Stone / Orb a forme requires to exist, if any (else undefined). */
export function requiredItemFor(species: string): string | undefined {
  const sp = gen.species.get(species);
  return sp && (sp.isMega || sp.isPrimal) ? sp.requiredItem : undefined;
}

// Per-format legal held items (by name). A format absent here is unrestricted
// (whole item dex); only Champions limits items. See gen-legal.ts.
import legalItemsJson from './legal-items.json';
const LEGAL_ITEMS = legalItemsJson as Record<string, string[]>;
export function legalItems(formatId?: string): string[] | null {
  return (formatId && LEGAL_ITEMS[formatId]) || null;
}
