/**
 * MAIN-world content script. Runs in the Showdown page's own JS context (an
 * isolated content script can't see `window.app`), reads the live battle each
 * tick, maps it with the shared mapper, and posts the snapshot to the panel
 * (the isolated content script) over window.postMessage.
 *
 * Also forwards `battle.myPokemon` — the `|request|` data for your own team,
 * which carries your EXACT stats/moves/item/ability (the public battle object
 * hides those until revealed). live.ts uses it to calc onto/from your side.
 */
import { mapBattle, type SdBattle, type BattleSnapshot } from '../src/services/battle';
import type { MyPokemon } from '../src/services/live';

const TAG = 'vgc-calc';
let last = '';

/** Pull only the plain, structured-cloneable fields we need out of the rich
 * client `myPokemon` objects (which aren't safe to JSON.stringify / postMessage). */
function plainMy(list: unknown[] | undefined): MyPokemon[] {
  return (list ?? []).map((raw) => {
    const p = raw as Record<string, unknown>;
    // condition is "cur/max" (e.g. "393/393") or "0 fnt"; pull the max.
    const max = parseInt(String(p.condition ?? '').split('/')[1] ?? '', 10);
    return {
      details: String(p.details ?? ''),
      stats: p.stats as MyPokemon['stats'],
      maxHP: Number.isFinite(max) ? max : undefined,
      moves: (p.moves as string[]) ?? [],
      item: (p.item as string) || undefined,
      ability: (p.ability as string) || (p.baseAbility as string) || undefined,
      teraType: (p.teraType as string) || undefined,
    };
  });
}

// ponytail: 500ms poll instead of battle.subscribe() — robust to client
// internals and plenty fast for a turn-based game. Switch to subscribe if a
// poll ever shows lag.
function tick(): void {
  try {
    const battle = (window as unknown as { app?: { curRoom?: { battle?: SdBattle } } }).app?.curRoom
      ?.battle as (SdBattle & { myPokemon?: unknown[] }) | undefined;
    if (!battle || battle.gameType == null) return;
    const snapshot: BattleSnapshot = mapBattle(battle);
    const sig = JSON.stringify(snapshot); // board changes drive updates
    if (sig === last) return;
    window.postMessage({ source: TAG, snapshot, myPokemon: plainMy(battle.myPokemon) }, '*');
    last = sig; // only mark sent after a successful post, so failures retry
  } catch {
    /* transient client-state error mid-animation; next tick retries */
  }
}

setInterval(tick, 500);
tick();
