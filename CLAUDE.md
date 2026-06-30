# CLAUDE.md

Guidance for working in this repo. See `README.md` for the full feature/architecture tour.

## What this is

A Pokémon damage calculator web app (Vite + React + TS) on the official Showdown
engine (`@smogon/calc`). The differentiator: paste your team, drag a mon into a
slot, and the opponent auto-fills with the set people actually run (usage stats).

Core logic is a UI-independent **service layer** in `src/services/` that React
consumes. Each service is testable on its own (Vitest). When adding logic, put it
in a service with a `*.test.ts`, not in a component.

| Service | Role |
| --- | --- |
| `data.ts` | the single shared Gen 9 `Generation` (Megas re-admitted) |
| `calc.ts` | `@smogon/calc/adaptable` wrapper: `createPokemon`/`createMove`/`runCalc`/`buildField` |
| `sets.ts` | opponent common-set inference + usage-stat fallback chain (`getCommonSet`) |
| `formats.ts` | format registry + runtime data-source discovery (`resolveFormat`) |
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
