# CLAUDE.md

Guidance for working in this repo. See `README.md` for the full feature/architecture tour.

## What this is

A Pokémon damage calculator web app (Vite + React + TS) on the official Showdown
engine (`@smogon/calc`). The differentiator: paste your team, drag a mon into a
slot, and the opponent auto-fills with the set people actually run (usage stats).

Core logic is a UI-independent **service layer** in `src/services/` that React
consumes. Each service is testable on its own (Vitest). When adding logic, put it
in a service with a `*.test.ts`, not in a component.

## Formats and legality

Three formats, two groups: **Gen 9 OU** (`gen9ou` Singles, `gen9doublesou`
Doubles, both Lv100, Tera on, no Megas) and **Pokémon Champions**
(`gen9champions`, Doubles Lv50, Megas on, no Tera). Champions has no
data.pkmn.cc usage, so opponent auto-fill pulls real Champions usage from
championsbattledata.com (`champions-sets.ts`), falling back to data.pkmn.cc
`gen9championsvgc2026` (monthly, lags a new reg), then `gen9vgc2026`, then base stats.

Per-format legal **species** and **items** are precomputed by
`scripts/gen-legal.ts` into `src/services/legal-species.json` and
`legal-items.json`. OU/Doubles pools come from `@pkmn/sim`'s
exact Showdown rules (dev-only dep, never bundled). `@pkmn/sim` has no champions
mod, so the Champions roster and item pool are parsed from Showdown's own
`data/mods/champions` (formats-data + items) at a pinned commit (`SD_SHA`, current
Reg M-C). The same script writes `champions-dex-patch.json`: abilities/stats/types
where Showdown's Champions species differ from `@pkmn/dex`, which lags new regs
(Reg M-C Z Megas); `data.ts` applies it before building the `Generation`, and it
empties itself once `@pkmn/dex` catches up. `data.ts` re-admits the Champions
roster because many of its mons are flagged `Past` in the SV dex. On a new
regulation: bump `SD_SHA`, run `npm run gen:legal` (it refuses to write if a pool
shrinks by more than 20%).

**Megas:** the forme toggle mega-evolves by species (`applyForme`), which also
forces the Mega's one ability and its required stone item, and drops the stale
stone when reverting to base. Z and gendered Megas (formes `Mega-Z`, `M-Mega`)
have no `isMega` flag in the dex, so always detect Megas with `isMegaSpecies`
(`mega.ts`, re-exported by `data.ts`), never `sp.isMega`, and pair a Mega with
its base via `changesFrom` (Floette-Mega comes from Floette-Eternal). Anything
the dex doesn't know never reaches the calc: `itemForCalc` drops unknown items
(every stone, Leek) and the UI flags unknown abilities (`isModeledAbility`,
e.g. Piercing Drill). Champions mechanics are per-format: pass the format id to
`createMove(name, formatId)` and `runCalc(..., field, formatId)`. In
`gen9champions`, moves get Showdown's damage-relevant Champions changes
(`champions-moves.json`: base power, type, flags, removed secondaries; plus
re-enabled moves like Meteor Assault admitted into `gen`), and
`champions-mechanics.ts` swaps Z-A abilities for engine stand-ins for one calc
(Fire Mane -> Flash Fire, Aura Guard -> Fluffy/Heatproof, Eelevate -> Levitate,
Dragonize -> Dragon type at 1.2x bp via `move.overrides` since `calculate()`
clones inputs, Mega Sol -> Sun only for moves Sun affects), undone in a `finally`
and renamed back in `desc`. Not modeled: Protect interactions, secondary
chances. The stone is display-only: `setToPokemonOptions`
strips it before the calc, because a held stone crashes the adaptable engine
(no mega-item data). The opponent editor locks a Mega's item and hides usage %
on single-option fields.

| Service | Role |
| --- | --- |
| `data.ts` | the single shared Gen 9 `Generation` (Megas + Champions roster re-admitted, Champions dex patch applied); `isMegaSpecies`, `legalItems`, `megaStones`, `requiredItemFor` |
| `calc.ts` | `@smogon/calc/adaptable` wrapper: `createPokemon`/`createMove`/`runCalc`/`buildField` |
| `sets.ts` | opponent common-set inference + usage-stat fallback chain (`getCommonSet`); `suggestedToSet` clamps the item to the format's legal pool |
| `champions-sets.ts` | Champions-only usage from championsbattledata.com (`/api/index` + `/api/battle/Doubles/:battleName`); Stat Points -> EVs (x8); looks up by the index's `showdownId` (then normalized name); returns null (falls through) for mons CBD lacks |
| `champions-mechanics.ts` | Champions move overrides + Z-A ability stand-ins, applied by `createMove`/`runCalc` when given `gen9champions` |
| `formats.ts` | format registry + runtime data-source discovery (`resolveFormat`); `liveFormatDef` maps a live Showdown tier to a format (any Champions tier -> `gen9champions`) |
| `team.ts` | Showdown paste parsing, species/forme helpers |
| `conditions.ts` | battle-conditions + per-Pokémon modifier model |
| `battle.ts` | **(extension)** live Showdown board → snapshot (`mapBattle`) |
| `live.ts` | **(extension)** snapshot → both-direction damage (`computeLive`) |

## Live-battle Chrome extension (`extension/`)

An MV3 overlay that reads a live `play.pokemonshowdown.com` battle and shows
both-direction damage calcs, reusing the services above. **Working and verified
against Showdown's own calc.** Goal is eventually a voice/LLM "Jarvis" agent.

- `inject.ts` — MAIN-world script (an isolated content script can't see
  `window.app`). Reads `app.curRoom.battle` + `battle.myPokemon` every 500ms,
  posts a plain snapshot via `postMessage`. Must send only plain/cloneable data
  (raw client objects break `postMessage` and freeze updates).
- `content.ts` — isolated-world panel. Resolves the format from the live `tier`,
  runs `computeLive`, renders. Calc+fetch live here so `host_permissions` bypass
  the page CSP.
- `probe.js` — throwaway: paste into the Showdown console to dump the raw
  `battle` object shape.

Key facts: opponent HP is **percent-only** and item/ability/moves/tera are hidden
until revealed (your side is exact, from `myPokemon`). Always build mons at the
live `mon.level`, never the inferred set's level (it's often 50). The bundle is
~5MB (esbuild inlines `@pkmn/dex`).

## Commands

```bash
npm run dev        # app dev server (localhost:5173)
npm test           # Vitest suite
npm run typecheck  # tsc -p tsconfig.json
npm run gen:legal  # regenerate legal-species/legal-items/champions-dex-patch/champions-moves JSON (needs network)
npm run build:ext  # bundle the extension to extension/dist (gitignored)
```

Load the extension: `chrome://extensions` → Developer mode → Load unpacked →
`extension/`. After editing `inject.ts`/`content.ts`, `npm run build:ext` then
refresh the extension card.

## Conventions

- **No em dashes** in prose, comments, or docs.
- Commit as `huydamm <huydamm77@gmail.com>`; no author override, **no Claude
  trailer**. The user works directly on `main`.
- Match surrounding code's comment density and idiom. Non-trivial logic leaves
  one runnable check (a `*.test.ts`).
