/**
 * Pokémon Champions opponent auto-fill from championsbattledata.com (CBD).
 *
 * data.pkmn.cc publishes no Champions usage, so the base fallback chain lands
 * most Champions mons on plain base stats. CBD is a fan API that serves real
 * Champions usage: moves, held items, abilities, natures, and Stat-Point
 * spreads. We hit it only for `gen9champions`; OU/Doubles stay on data.pkmn.cc.
 *
 * Shape: `/api/index` lists every mon with a `battleName` (the id the battle
 * endpoint wants); `/api/battle/:gameType/:battleName?season=Current` returns
 * ranked rows tagged by `category` (move | held_item | ability | stat_alignment
 * | stat_points | teammate). Spreads arrive as Stat Points (0-32/stat), which is
 * exactly the app's SP_SYSTEM; the calc engine wants EVs, so multiply by 8.
 *
 * Forme note: the index names formes its own way ("Alolan Ninetales",
 * "Aegislash Shield Forme") but tags most entries with a Showdown `showdownId`,
 * so we look up by species id first and fall back to the normalized name.
 * Cosmetic rows ("Maushold Form 1") carry a null showdownId and are skipped.
 */
import type { StatsTable } from '@pkmn/data';
import { gen } from './data';
import { SP_SYSTEM, type GameType } from './formats';
import type { SuggestedSet, UsageOption, SpreadOption } from './sets';

const CBD_BASE = 'https://championsbattledata.com';

type Json = { ok: boolean; json(): Promise<unknown> };
export type CbdFetch = (url: string) => Promise<Json>;

interface CbdRow {
  category: string;
  rank: number;
  name?: string;
  percentage_value?: number;
  percentage?: string;
  stat_up?: string;
  stat_down?: string;
  hp_points?: number | string;
  attack_points?: number | string;
  defense_points?: number | string;
  sp_atk_points?: number | string;
  sp_def_points?: number | string;
  speed_points?: number | string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function pctOf(r: CbdRow): number | null {
  if (typeof r.percentage_value === 'number') return r.percentage_value;
  const m = /([\d.]+)/.exec(r.percentage ?? '');
  return m ? Number(m[1]) : null;
}

function optsOf(rows: CbdRow[], category: string): UsageOption[] {
  return rows
    .filter((r) => r.category === category && r.name)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({ name: r.name as string, pct: pctOf(r) }));
}

function spreadEvs(r: CbdRow): Partial<StatsTable> {
  const p = (v: unknown) => (Number(v) || 0) * SP_SYSTEM.evPerUnit;
  return {
    hp: p(r.hp_points),
    atk: p(r.attack_points),
    def: p(r.defense_points),
    spa: p(r.sp_atk_points),
    spd: p(r.sp_def_points),
    spe: p(r.speed_points),
  };
}

function toSuggested(species: string, level: number, rows: CbdRow[]): SuggestedSet {
  const name = gen.species.get(species)?.name ?? species;
  const abilities = optsOf(rows, 'ability');
  const items = optsOf(rows, 'held_item');
  const moveOptions = optsOf(rows, 'move');
  const natures = optsOf(rows, 'stat_alignment');
  const nature = natures[0]?.name;
  // CBD lists natures and Stat-Point spreads as separate axes; pair each spread
  // with the most common nature (the calc only needs the top spread's nature).
  const spreads: SpreadOption[] = rows
    .filter((r) => r.category === 'stat_points')
    .sort((a, b) => a.rank - b.rank)
    .map((r) => {
      const evs = spreadEvs(r);
      return {
        label: `${nature ?? ''} ${[r.hp_points, r.attack_points, r.defense_points, r.sp_atk_points, r.sp_def_points, r.speed_points]
          .map((v) => Number(v) || 0)
          .join('/')} (SP)`.trim(),
        nature: nature ?? 'Serious',
        evs,
        pct: pctOf(r),
      };
    });
  return {
    species: name,
    level,
    ability: abilities[0]?.name,
    item: items[0]?.name,
    teraType: undefined, // Champions has no Terastallization
    nature,
    evs: spreads[0]?.evs ?? {},
    moves: moveOptions.slice(0, 4).map((m) => m.name),
    abilities,
    items,
    teraTypes: [],
    spreads,
    moveOptions,
    source: 'usage',
    note: 'Champions usage — championsbattledata.com',
  };
}

export interface ChampionsSets {
  /** CBD set for a species (Doubles by default), or null if CBD has no data for it. */
  get(species: string, level: number, gameType?: GameType): Promise<SuggestedSet | null>;
}

/** Build a CBD-backed Champions set service over an injectable fetch. */
export function createChampionsSets(fetchFn: CbdFetch = (u) => fetch(u)): ChampionsSets {
  let indexP: Promise<Map<string, string>> | null = null; // showdownId | norm(name) -> battleName
  const cache = new Map<string, Promise<SuggestedSet | null>>();

  async function loadIndex(): Promise<Map<string, string>> {
    const res = await fetchFn(`${CBD_BASE}/api/index`);
    if (!res.ok) return new Map();
    const data = (await res.json()) as { pokemon?: { name: string; battleName?: string; showdownId?: string | null }[] };
    const m = new Map<string, string>();
    for (const p of data.pokemon ?? []) {
      const bn = p.battleName ?? p.name;
      // First row wins for a shared id (Toxtricity before "Toxtricity Low Key Form").
      if (p.showdownId && !m.has(p.showdownId)) m.set(p.showdownId, bn);
      m.set(norm(p.name), bn);
      m.set(norm(bn), bn);
    }
    return m;
  }

  async function fetchSet(species: string, level: number, gameType: GameType): Promise<SuggestedSet | null> {
    let idx: Map<string, string>;
    try {
      indexP ??= loadIndex();
      idx = await indexP;
    } catch {
      indexP = null; // let a later pick retry the index
      return null;
    }
    // Species id, then CBD's own naming, then the base species row
    // (Floette-Eternal -> "Floette").
    const sp = gen.species.get(species);
    const battleName = (sp && idx.get(sp.id)) || idx.get(norm(species)) || (sp && idx.get(norm(sp.baseSpecies)));
    if (!battleName) return null;
    const url = `${CBD_BASE}/api/battle/${gameType}/${encodeURIComponent(battleName)}?season=Current`;
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { rows?: CbdRow[] };
    const rows = data.rows ?? [];
    return rows.length ? toSuggested(species, level, rows) : null;
  }

  return {
    get(species, level, gameType = 'Doubles') {
      const key = `${gameType}|${species}`;
      let p = cache.get(key);
      if (!p) {
        p = fetchSet(species, level, gameType).catch(() => null);
        cache.set(key, p);
      }
      return p;
    },
  };
}
