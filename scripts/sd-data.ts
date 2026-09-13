/**
 * Pure helpers for reading Showdown's data tables (dev-only, used by
 * gen-legal.ts). No network, so they're unit-testable.
 *
 * Showdown ships its data as TypeScript with methods inside entries, so a regex
 * can't parse it. Transpile to CommonJS and evaluate instead. The source is a
 * pinned commit of smogon/pokemon-showdown and this never reaches the bundle.
 */
import ts from 'typescript';

/** Evaluate a Showdown data file and return one of its exports. */
export function loadSdExport<T>(tsSource: string, exportName: string): T {
  const js = ts.transpileModule(tsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  // Data tables are self-contained; a runtime import means the file changed shape.
  const noRequire = (id: string) => {
    throw new Error(`Showdown data file imports "${id}"; loader only supports self-contained tables`);
  };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, noRequire);
  const value = mod.exports[exportName];
  if (!value) throw new Error(`Showdown data has no export "${exportName}"`);
  return value as T;
}

type Json = Record<string, unknown>;

/** The dex fields the diff reads (a @pkmn/dex Move satisfies this). */
export interface DexMoveLike {
  exists: boolean;
  isNonstandard?: string | null;
  basePower?: number;
  type?: string;
  category?: string;
  multihit?: unknown;
  flags?: Json;
  secondaries?: unknown[] | null;
  [key: string]: unknown;
}

export type MovePatch = Partial<Pick<DexMoveLike, 'basePower' | 'type' | 'category' | 'multihit' | 'flags'>> & {
  secondaries?: unknown[] | false;
};

// Fields that change a damage number and are patched.
const DAMAGE_FIELDS = ['basePower', 'type', 'category', 'multihit'] as const;
// Fields handled above or known not to affect damage; anything else that changes
// is reported so a future regulation can't slip a damage change past the patch.
const HANDLED = new Set([...DAMAGE_FIELDS, 'flags', 'secondary', 'isNonstandard', 'inherit', 'pp', 'accuracy', 'noPPBoosts']);

/**
 * Diff Showdown's champions move overrides against the dex:
 * - patch: damage-relevant fields that differ. `flags` is the full object with
 *   removed flags written as 0 (the engine deep-merges and checks truthiness); a
 *   removed secondary becomes `secondaries: false` so Sheer Force stops boosting.
 * - admit: moves the dex marks nonstandard that Champions re-enables.
 * - ignored: other changed keys per move (callbacks as `name()`), for a warning.
 */
export function diffChampionsMoves(
  sdMoves: Record<string, Json>,
  getMove: (id: string) => DexMoveLike | undefined,
): { patch: Record<string, MovePatch>; admit: string[]; ignored: Record<string, string[]> } {
  const patch: Record<string, MovePatch> = {};
  const admit: string[] = [];
  const ignored: Record<string, string[]> = {};
  for (const [id, ov] of Object.entries(sdMoves)) {
    const base = getMove(id);
    if (!base?.exists) continue;
    const diff: MovePatch = {};
    for (const key of DAMAGE_FIELDS) {
      if (key in ov && JSON.stringify(ov[key]) !== JSON.stringify(base[key])) {
        (diff as Json)[key] = ov[key];
      }
    }
    if ('flags' in ov && JSON.stringify(ov.flags) !== JSON.stringify(base.flags)) {
      const flags: Json = { ...(ov.flags as Json) };
      for (const k of Object.keys(base.flags ?? {})) if (!(k in flags)) flags[k] = 0;
      diff.flags = flags;
    }
    if ('secondary' in ov) {
      const had = !!base.secondaries?.length;
      if (!ov.secondary && had) diff.secondaries = false;
      else if (ov.secondary && !had) diff.secondaries = [ov.secondary];
    }
    if (Object.keys(diff).length) patch[id] = diff;
    if (ov.isNonstandard === null && base.isNonstandard) admit.push(id);

    const other = Object.keys(ov).filter(
      (k) => !HANDLED.has(k) && (typeof ov[k] === 'function' || JSON.stringify(ov[k]) !== JSON.stringify(base[k])),
    );
    if (other.length) ignored[id] = other.map((k) => (typeof ov[k] === 'function' ? `${k}()` : k));
  }
  return { patch, admit: admit.sort(), ignored };
}
