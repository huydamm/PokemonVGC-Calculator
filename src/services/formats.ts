/**
 * Format registry + runtime discovery.
 *
 * A "format" bundles the rules that change a calc (game type, level, whether
 * Mega Evolution is legal) with the data.pkmn.cc sources used for opponent
 * auto-fill. Sources are *probed at runtime* (the brief: don't trust hardcoded
 * ids) with an ordered fallback chain, because what data.pkmn.cc actually serves
 * drifts: it publishes year-bucketed stats (gen9vgc2026, gen9championsvgc2026,
 * no reg suffix) and full gen9ou data. Champions usage there is monthly and lags
 * a new regulation, so Champions prefers championsbattledata.com (sets.ts).
 */
export type GameType = 'Singles' | 'Doubles';

/**
 * How a format invests stats.
 * - EV: classic EVs (0-252/stat, 508 total); 1 display unit = 1 EV.
 * - SP: Pokémon Champions Stat Points (0-32/stat, 66 total); 1 SP = +1 stat.
 *   Champions runs at Lv 50 where 8 EVs = +1 stat, so we store 1 SP as 8 EVs
 *   for the (EV-based) engine; `evPerUnit` is that conversion factor.
 */
export interface StatSystem {
  unit: 'EV' | 'SP';
  perStatMax: number;
  totalMax: number;
  evPerUnit: number;
}

export const EV_SYSTEM: StatSystem = { unit: 'EV', perStatMax: 252, totalMax: 508, evPerUnit: 1 };
export const SP_SYSTEM: StatSystem = { unit: 'SP', perStatMax: 32, totalMax: 66, evPerUnit: 8 };

export interface FormatDef {
  id: string;
  label: string;
  group: string;
  gameType: GameType;
  level: number;
  megasEnabled: boolean;
  /** Terastallization legal? (Champions uses Mega Evolution instead of Tera.) */
  teraEnabled: boolean;
  statSystem: StatSystem;
  /** data.pkmn.cc stats ids to try, newest/most-specific first. */
  statsCandidates: string[];
  /** data.pkmn.cc sets ids to try, newest/most-specific first. */
  setsCandidates: string[];
}

/** Static registry. Availability of each data source is resolved at runtime. */
export const FORMATS: FormatDef[] = [
  {
    id: 'gen9ou',
    label: 'Singles',
    group: 'Gen 9 OU',
    gameType: 'Singles',
    level: 100,
    megasEnabled: false,
    teraEnabled: true,
    statSystem: EV_SYSTEM,
    statsCandidates: ['gen9ou'],
    setsCandidates: ['gen9ou'],
  },
  {
    id: 'gen9doublesou',
    label: 'Doubles',
    group: 'Gen 9 OU',
    gameType: 'Doubles',
    level: 100,
    megasEnabled: false,
    teraEnabled: true,
    statSystem: EV_SYSTEM,
    statsCandidates: ['gen9doublesou'],
    setsCandidates: ['gen9doublesou'],
  },
  {
    id: 'gen9champions',
    label: 'Pokémon Champions (Megas)',
    group: 'Pokémon Champions',
    gameType: 'Doubles',
    level: 50,
    megasEnabled: true,
    teraEnabled: false,
    statSystem: SP_SYSTEM,
    // Fallback only: sets.ts tries championsbattledata.com first. data.pkmn.cc
    // Champions stats are monthly (lag a new reg), then SV VGC as a last resort.
    statsCandidates: ['gen9championsvgc2026', 'gen9vgc2026'],
    setsCandidates: ['gen9championsvgc2026', 'gen9vgc2026'],
  },
];

export const DEFAULT_FORMAT_ID = 'gen9ou';

export function getFormat(id: string): FormatDef {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0];
}

/**
 * FormatDef for a live Showdown tier string (extension). Any Champions tier
 * ("[Gen 9 Champions] VGC 2026 Reg M-C", BSS, Bo3) maps to the Champions format
 * so it gets CBD usage, Megas and Stat Points; other tiers get a synthesized def
 * that probes the tier's own data.pkmn.cc id first.
 */
export function liveFormatDef(tier: string, gameType: GameType, level: number): FormatDef {
  const base = tier.toLowerCase().replace(/[^a-z0-9]/g, ''); // '[Gen 9] Doubles OU' -> 'gen9doublesou'
  if (base.startsWith('gen9champions')) return { ...getFormat('gen9champions'), gameType };
  const candidates = [...new Set([base, base.replace(/reg[a-z]+$/, ''), 'gen9vgc2026', 'gen9vgc2025', 'gen9ou'])];
  return {
    id: base, label: tier, group: 'live', gameType, level,
    megasEnabled: false, teraEnabled: true, statSystem: EV_SYSTEM,
    statsCandidates: candidates, setsCandidates: candidates,
  };
}

const DATA_BASE = 'https://data.pkmn.cc';
type FetchLike = (url: string, init?: { method?: string }) => Promise<{ ok: boolean }>;

export interface ResolvedSource {
  /** The id that actually has data, or null if nothing in the chain exists. */
  id: string | null;
  /** Set when we fell back off the format's primary (preferred) source. */
  note?: string;
}

export interface ResolvedFormat {
  def: FormatDef;
  stats: ResolvedSource;
  sets: ResolvedSource;
}

async function probe(fetchFn: FetchLike, kind: 'stats' | 'sets', id: string): Promise<boolean> {
  try {
    // HEAD is cheap; data.pkmn.cc 301-redirects to GitHub Pages, which fetch follows.
    const res = await fetchFn(`${DATA_BASE}/${kind}/${id}.json`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveChain(
  fetchFn: FetchLike,
  kind: 'stats' | 'sets',
  candidates: string[],
): Promise<ResolvedSource> {
  for (let i = 0; i < candidates.length; i++) {
    if (await probe(fetchFn, kind, candidates[i])) {
      const id = candidates[i];
      return i === 0 ? { id } : { id, note: `${candidates[0]} ${kind} unavailable — using ${id}` };
    }
  }
  return { id: null, note: `No ${kind} data available — using base stats` };
}

/** Resolve the usable data sources for one format via its fallback chain. */
export async function resolveFormat(def: FormatDef, fetchFn: FetchLike = fetch): Promise<ResolvedFormat> {
  const [stats, sets] = await Promise.all([
    resolveChain(fetchFn, 'stats', def.statsCandidates),
    resolveChain(fetchFn, 'sets', def.setsCandidates),
  ]);
  return { def, stats, sets };
}

/** Resolve every registered format (used to annotate the selector at startup). */
export async function discoverFormats(fetchFn: FetchLike = fetch): Promise<ResolvedFormat[]> {
  return Promise.all(FORMATS.map((f) => resolveFormat(f, fetchFn)));
}
