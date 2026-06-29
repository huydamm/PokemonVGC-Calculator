/**
 * Opponent auto-fill: build the most common competitive set for a species from
 * @pkmn/smogon usage statistics, with the brief's full fallback chain:
 *   1. active-format usage stats  (resolved by formats.ts)
 *   2. most-recent prior reg's stats  (also handled by the resolved chain)
 *   3. Smogon curated analysis set
 *   4. base stats + neutral spread
 * Every tier degrades without throwing and reports which tier was used.
 */
import { Smogon } from '@pkmn/smogon';
import type { StatsTable } from '@pkmn/data';
import type { PokemonSet } from '@pkmn/sets';
import { gen } from './data';
import { makeSet } from './team';
import type { FormatDef, ResolvedFormat } from './formats';

export interface UsageOption {
  name: string;
  /** Usage as a percentage (e.g. 32.2), or null when from a curated/base set. */
  pct: number | null;
}
export interface SpreadOption {
  label: string;
  nature: string;
  evs: Partial<StatsTable>;
  pct: number | null;
}

export interface SuggestedSet {
  species: string;
  level: number;
  ability?: string;
  item?: string;
  teraType?: string;
  nature?: string;
  evs: Partial<StatsTable>;
  moves: string[];
  abilities: UsageOption[];
  items: UsageOption[];
  teraTypes: UsageOption[];
  spreads: SpreadOption[];
  moveOptions: UsageOption[];
  source: 'usage' | 'curated' | 'base';
  note?: string;
}

type SmogonFetch = ConstructorParameters<typeof Smogon>[0];

function sortEntries(obj?: Record<string, number>): UsageOption[] {
  if (!obj) return [];
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([name, frac]) => ({ name, pct: Math.round(frac * 1000) / 10 }));
}

function parseSpread(key: string, frac: number): SpreadOption {
  const [nature, evStr] = key.split(':');
  const parts = (evStr ?? '').split('/').map((n) => parseInt(n, 10) || 0);
  const [hp, atk, def, spa, spd, spe] = parts;
  return {
    label: key,
    nature,
    evs: { hp, atk, def, spa, spd, spe },
    pct: Math.round(frac * 1000) / 10,
  };
}

type LegacyUsage = {
  abilities?: Record<string, number>;
  items?: Record<string, number>;
  teraTypes?: Record<string, number>;
  moves?: Record<string, number>;
  spreads?: Record<string, number>;
};

function fromUsage(species: string, level: number, u: LegacyUsage, note?: string): SuggestedSet {
  const abilities = sortEntries(u.abilities);
  const items = sortEntries(u.items);
  const teraTypes = sortEntries(u.teraTypes);
  const moveOptions = sortEntries(u.moves);
  const spreads = Object.entries(u.spreads ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => parseSpread(k, v));
  const top = spreads[0];
  return {
    species,
    level,
    ability: abilities[0]?.name,
    item: items[0]?.name,
    teraType: teraTypes[0]?.name,
    nature: top?.nature,
    evs: top?.evs ?? {},
    moves: moveOptions.slice(0, 4).map((m) => m.name),
    abilities,
    items,
    teraTypes,
    spreads,
    moveOptions,
    source: 'usage',
    note,
  };
}

function baseSet(speciesName: string, level: number, note: string): SuggestedSet {
  const sp = gen.species.get(speciesName);
  const ability = sp?.abilities[0];
  return {
    species: sp?.name ?? speciesName,
    level,
    ability,
    item: undefined,
    teraType: sp?.types[0],
    nature: 'Serious',
    evs: {},
    moves: [],
    abilities: ability ? [{ name: ability, pct: null }] : [],
    items: [],
    teraTypes: (sp ? [...sp.types] : []).map((t) => ({ name: t, pct: null })),
    spreads: [],
    moveOptions: [],
    source: 'base',
    note,
  };
}

async function build(
  smogon: Smogon,
  speciesName: string,
  format: FormatDef,
  statsId: string | null,
  statsNote?: string,
): Promise<SuggestedSet> {
  // Tier 1/2: usage stats from the resolved (possibly fallen-back) format.
  if (statsId) {
    try {
      const u = (await smogon.stats(gen, speciesName, statsId as never)) as LegacyUsage | undefined;
      if (u && (u.spreads || u.moves || u.abilities)) {
        return fromUsage(gen.species.get(speciesName)?.name ?? speciesName, format.level, u, statsNote);
      }
    } catch {
      /* fall through */
    }
  }
  // Tier 3: Smogon curated analysis set.
  try {
    const sets = await smogon.sets(gen, speciesName, statsId ? (statsId as never) : undefined);
    const s = sets?.[0] as Record<string, unknown> | undefined;
    if (s) {
      const first = (v: unknown): string | undefined =>
        Array.isArray(v) ? (v[0] as string | undefined) : (v as string | undefined);
      const moves = (Array.isArray(s.moves) ? s.moves : []).map(first).filter((x): x is string => !!x);
      const ability = first(s.ability);
      const item = first(s.item);
      const teraType = first(s.teraType);
      const level =
        (typeof s.level === 'number' ? s.level : Array.isArray(s.level) ? (s.level[0] as number) : undefined) ??
        format.level;
      return {
        species: gen.species.get(speciesName)?.name ?? speciesName,
        level,
        ability,
        item,
        teraType,
        nature: first(s.nature),
        evs: ((Array.isArray(s.evs) ? s.evs[0] : s.evs) as Partial<StatsTable>) ?? {},
        moves,
        abilities: ability ? [{ name: ability, pct: null }] : [],
        items: item ? [{ name: item, pct: null }] : [],
        teraTypes: teraType ? [{ name: teraType, pct: null }] : [],
        spreads: [],
        moveOptions: moves.map((m) => ({ name: m, pct: null })),
        source: 'curated',
        note: 'No usage data — showing a Smogon curated set',
      };
    }
  } catch {
    /* fall through */
  }
  // Tier 4: base stats, neutral spread.
  return baseSet(speciesName, format.level, 'No set data available — using base stats / neutral spread');
}

export interface SetService {
  /** Most common set for a species in the resolved format (cached, never throws). */
  getCommonSet(speciesName: string, resolved: ResolvedFormat): Promise<SuggestedSet>;
}

/** Build a set service over an injectable fetch (swappable/testable). */
export function createSetService(fetchFn: SmogonFetch = (url) => fetch(url)): SetService {
  const smogon = new Smogon(fetchFn);
  const cache = new Map<string, Promise<SuggestedSet>>();
  return {
    getCommonSet(speciesName, resolved) {
      const statsId = resolved.stats.id;
      const key = `${statsId ?? 'none'}|${speciesName}`;
      let p = cache.get(key);
      if (!p) {
        p = build(smogon, speciesName, resolved.def, statsId, resolved.stats.note).catch(() =>
          baseSet(speciesName, resolved.def.level, 'Lookup failed — using base stats'),
        );
        cache.set(key, p);
      }
      return p;
    },
  };
}

/** Turn a suggested set into a full PokemonSet for the calc/roster. */
export function suggestedToSet(s: SuggestedSet): PokemonSet {
  return makeSet({
    species: s.species,
    level: s.level,
    ability: s.ability,
    item: s.item,
    nature: s.nature,
    teraType: s.teraType,
    evs: s.evs,
    moves: s.moves,
  });
}

/** Default service backed by the real data.pkmn.cc endpoint. */
export const setService = createSetService();
export const getCommonSet = setService.getCommonSet.bind(setService);
