# VGC Damage Calculator

A fast Pokémon VGC (doubles) damage calculator built around a *paste → drag →
calc* workflow: paste your team, drag a Pokémon into the attacker or defender
slot, and the opposing side auto-fills with the most common competitive set.
Supports both Scarlet/Violet VGC and **Pokémon Champions VGC** (Mega Evolution).

## Run

```bash
npm install
npm run dev      # start the dev server
npm run build    # typecheck + production build (minified, tree-shaken)
npm test         # run the test suite (vitest)
npm run prove    # milestone-1 engine proof (adaptable vs bundled engine)
```

## Stack decision

**Vite + React + TypeScript.** Vite gives fast HMR and a Rollup production build
that minifies (esbuild) and tree-shakes `@smogon/calc` — which matters because
the engine ships large data tables. We sidestep most of that weight by importing
the engine's `@smogon/calc/dist/adaptable` entry, which takes its data from our
shared `@pkmn/dex` generation instead of the bundled tables. React is the most
direct fit for the drag-driven, many-small-stateful-panels UI; `@dnd-kit` covers
drag-to-assign with a keyboard/click fallback.

## Where each core library is used

| Concern | Library | Location |
| --- | --- | --- |
| Damage engine | `@smogon/calc/dist/adaptable` | `src/services/calc.ts` |
| Dex / forme data (single source) | `@pkmn/dex` + `@pkmn/data` | `src/services/data.ts` |
| Team-paste parsing | `@pkmn/sets` | _(milestone 3)_ |
| Opponent sets + usage stats | `@pkmn/smogon` | _(milestone 5)_ |

The calc and the UI share **one** `Generation` (built in `data.ts`) so dex data
is never shipped twice.

## Mega Evolution & the Champions data caveat

Megas are an alternate forme: selecting one feeds the Mega species to the calc,
which applies post-Mega stats and force-overwrites the ability automatically.

`@pkmn/data`'s Gen 9 layer correctly hides Megas (they don't exist in S/V), so
`data.ts` re-admits the classic Mega/Primal formes (flagged `isNonstandard:
'Past'`) for Champions support. **Known limitation:** Champions adds ~9 Megas
that never shipped on cartridge (Mega Pyroar, Glimmora, Baxcalibur, Tatsugiri,
Annihilape, Floette, Dragalge, Eelektross, Scovillain) — these are **not** in
`@pkmn/dex` and cannot be calculated; the UI hides them and falls back to the
base forme. Conversely ~6 classic Megas omitted from Champions at launch
(Sceptile, Blaziken, Swampert, Mawile, Salamence, Metagross) remain selectable
in the data layer.

## Status

Milestone 1 complete: engine wired and proven correct against the real Showdown
engine (incl. a Mega forme, weather, and screens). See the build order in the
project brief for remaining milestones.
