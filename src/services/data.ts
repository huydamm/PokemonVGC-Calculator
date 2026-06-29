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

const MEGA_FORMES = new Set(['Mega', 'Mega-X', 'Mega-Y', 'Primal']);

/** True for the Mega/Primal species formes we want re-admitted into Gen 9. */
function isMegaForme(d: Data): boolean {
  return (
    'forme' in d &&
    typeof (d as { forme?: unknown }).forme === 'string' &&
    MEGA_FORMES.has((d as { forme: string }).forme)
  );
}

/** DEFAULT_EXISTS, plus: keep Mega/Primal formes that default would drop. */
function existsWithMegas(d: Data): boolean {
  if (!d.exists) return false;
  if ('isNonstandard' in d && d.isNonstandard) {
    // Re-admit Mega/Primal formes (flagged `Past` in Gen 9); reject everything else.
    return isMegaForme(d);
  }
  if (d.kind === 'Ability' && d.id === 'noability') return false;
  return !('tier' in d && ['Illegal', 'Unreleased'].includes((d as { tier: string }).tier));
}

const gens = new Generations(Dex, existsWithMegas);

/** The shared Gen 9 generation, with classic Megas available as formes. */
export const gen: Generation = gens.get(9);
