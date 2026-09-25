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

## Frontend

Pixel-art UI, all styles in `src/app.css`. Design rules: flat colours only (no
gradients), no blue/purple chrome (Pokémon type badge colours are data and stay),
square 2px ink outlines with bevel + hard shadow, fonts Press Start 2P (display) /
Pixelify Sans (UI) / VT323 (numbers). Motion is CSS `steps()` keyframes and must
stay off under `prefers-reduced-motion`.

Layout is tabs through one ARIA component (`components/Tabs.tsx`, keyboard logic in
`services/tabs.ts`): Calc / Team / Field at the top, Set / Spread per slot, Moves /
Heatmap in results. The main tabs use `keepMounted` (inactive panels are `hidden`),
so state inside Calc survives a trip to Field; sub-tabs mount on demand. Skeletons
(`Skeleton`, `SpriteImg`) are only for real waits: set fetch, format discovery,
sprite load, and the heatmap's first computation. Team drag uses a `DragOverlay`,
and touch drags need a press-and-hold so the strip still scrolls. `npm run smoke`
drives the tabs and fails if results don't render, state resets across tabs,
arrow-key tab focus breaks, or the page overflows (`WIDTH=400` for phone width).

Move results are computed once in `services/results.ts` (`computeMoveResults`), and
the selected move is `App` state shared by `MoveMenu` (top of the attacker slot),
`HpPanel` (top of the defender slot, or above both slots below 760px so it stays in
view on phones; colour bands and KO state from `services/hp.ts`), the Moves table and
the Heatmap. A pick is stored with its attacker (`resolveFeatured`), so a new attacker
or a swap falls back to the strongest move. The HP drain replays because the bar is
keyed on defender + move; the defender's hit shake is bumped from the pick handler and
alternates two identical keyframes so it restarts without remounting the card (a
remount would reload the sprite).

Phone and touch rules live at the end of `app.css` (source order matters: they share
specificity with the base rules). Touch sizing keys off `@media (pointer: coarse)`, not
width: 44px targets, 16px form controls (iOS Safari zooms below that), pixel labels
at least 10px. Layout keys off space: `max-width: 760px` (stacked slots, HP panel above
both, compact header, full-width tabs), `(orientation: landscape) and (max-height: 500px)`
(phones on their side: one-row header, sprite-only team strip), and `@container` queries on
`.slot` so editors adapt to the slot's own width on phones and tablets. Hover styles sit
under `@media (hover: hover)`. `npm run smoke` with `TOUCH=1` fails on any target under
44px, control under 16px, pixel label under 10px; run it at phone sizes (`WIDTH`/`HEIGHT`).

## Live-battle Chrome extension (`extension/`)

An MV3 overlay that reads a live `play.pokemonshowdown.com` battle and shows
both-direction damage calcs, reusing the services above. **Working and verified
against Showdown's own calc.**

- `inject.ts`: MAIN-world script (an isolated content script can't see
  `window.app`). Reads `app.curRoom.battle` + `battle.myPokemon` every 500ms,
  posts a plain snapshot plus `roomId` (the panel's "new battle" key: teams and
  formes change mid-battle) via `postMessage`. Must send only plain/cloneable data
  (raw client objects break `postMessage` and freeze updates).
- `content.ts`: isolated-world panel. Resolves the format from the live `tier`,
  runs `computeLive`, renders. Calc+fetch live here so `host_permissions` bypass
  the page CSP. While a new board computes, the last numbers stay up dimmed
  (`aria-busy`); a skeleton shows only before the first result.
- `panel.ts`: DOM builders for the board, a 400px panel with a Your moves /
  Their moves tab each showing one moves-by-targets grid. `computeLive` returns
  every move for every pair (`kind`: damage / status / none, plus a short
  `koShort` tag), so nothing is dropped. Page strings go in as text
  nodes only, never `innerHTML`. Your moves come from the request data, matched
  to the active forme by species with a prefix fallback (Tera/battle formes).
- `theme.ts` + `panel.css`: the web app's pixel look. Tokens come
  from `src/tokens.css` (shared with `app.css`, `:root, :host`), bundled as text
  (esbuild `--loader:.css=text`) into a constructable stylesheet adopted by the
  panel's shadow root, so Showdown's CSS and ours never meet. Fonts ship in
  `extension/fonts` (OFL) under `VGC `-prefixed family names and are declared on
  the document (Chrome ignores `@font-face` inside a shadow root).
- Free, no accounts, no background worker. The paid ExtensionPay build (commit
  `4360dd4`) was removed on 2026-09-23 after Smogon/pkmn pushback; the panel footer
  credits championsbattledata.com (its API rules require it), Smogon/pkmn and
  `@smogon/calc`. Keep it: the web app footer carries the same credits.
- `probe.js`: throwaway, paste into the Showdown console to dump the raw
  `battle` object shape.

`npm run smoke:ext` (after `build:ext`, needs network) loads the real unpacked
extension into headless Chrome via CDP `Extensions.loadUnpacked` over
`--remote-debugging-pipe` (Chrome 137+ ignores `--load-extension`), opens Showdown,
posts Doubles OU and Champions boards from the page, and fails on missing numbers,
the last battle's numbers under a new battle, unloaded fonts, blue/purple colours,
a moved Showdown layout, a broken collapse, animations under reduced motion, or
missing data credits. `content.ts` only accepts messages from its own window.
Live calcs count spread targets on the board
(`spreadHitsOne` in `live.ts`).

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
npm run smoke:ext  # preview the built overlay on real Showdown (SHOTS=<dir> for screenshots)
npm run pack:ext   # zip the built extension's runtime files (allowlist) into release/
```

CI (`.github/workflows/ci.yml`: typecheck, test, both builds, pack) gates every PR and
the Pages deploy. The store release is tag-driven: bump `extension/manifest.json`
`version`, tag `ext-vX.Y.Z`, push the tag; `release-ext.yml` checks the tag against the
manifest, attaches the tested zip to a GitHub Release, and after approval on the
`chrome-web-store` environment uploads and submits it (`scripts/cws-publish.mjs`, Web
Store API v2, service account). `npm run smoke:ext` stays a local pre-release check
(real Showdown + network). The privacy policy the listing links to is `public/privacy.html`.

Load the extension: `chrome://extensions` → Developer mode → Load unpacked →
`extension/`. After editing `inject.ts`/`content.ts`, `npm run build:ext` then
refresh the extension card.

## Conventions

- **No em dashes** in prose, comments, or docs.
- Commit as `huydamm <huydamm77@gmail.com>`; no author override, **no Claude
  trailer**. The user works directly on `main`.
- The built web app ships a CSP (`scripts/csp.ts`, injected by `vite.config.ts`, build only). A new
  fetch or image host goes there too; `npm run smoke` against `vite preview` fails on CSP violations.
  Fonts are self-hosted from `extension/fonts` (no Google Fonts).
- Match surrounding code's comment density and idiom. Non-trivial logic leaves
  one runnable check (a `*.test.ts`).
