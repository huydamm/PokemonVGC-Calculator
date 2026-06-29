# Damage Calculator (Gen 9 OU / Pokémon Champions)

A fast Pokémon damage calculator built around a *paste → drag → calc* workflow:
paste your team, drag a Pokémon into the attacker or defender slot, and fill the
other side either from your team or by searching any Pokémon — whose **most
common competitive set auto-loads** from usage stats. Pick the **version** up
top: **Gen 9 OU** (Singles, Lv 100, full live data) or **Pokémon Champions**
(Doubles, Lv 50, **Mega Evolution** enabled). VGC 2026 is also available.

## Run

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # typecheck + production build (minified, tree-shaken)
npm test         # unit/integration suite (vitest)
npm run prove    # engine proof: adaptable calc vs the bundled Showdown engine
npm run smoke    # headless Chrome smoke test of the full UI flow (dev server must be running)
```

## Stack decision

**Vite + React + TypeScript.** Vite gives fast HMR and a Rollup production build
that minifies (esbuild) and tree-shakes `@smogon/calc` — important because the
engine ships large data tables. We avoid that weight by importing the engine's
`@smogon/calc/dist/adaptable` entry, which reads its data from our shared
`@pkmn/dex` generation instead of the bundled tables (so dex data is never
shipped twice). React fits the drag-driven, many-small-panels UI; `@dnd-kit`
provides drag-to-assign with a keyboard/click fallback.

## Where each core library is used

| Concern | Library | Location |
| --- | --- | --- |
| Damage engine | `@smogon/calc/dist/adaptable` | `src/services/calc.ts` |
| Dex / forme data (single source) | `@pkmn/dex` + `@pkmn/data` | `src/services/data.ts` |
| Team-paste parsing | `@pkmn/sets` | `src/services/team.ts` |
| Opponent sets + usage stats | `@pkmn/smogon` | `src/services/sets.ts` |
| Format discovery (data.pkmn.cc) | native `fetch` | `src/services/formats.ts` |

The service layer (`calc`, `data`, `team`, `sets`, `formats`, `conditions`) is
UI-independent and individually testable; the calc and UI share **one**
`Generation` built in `data.ts`.

## Features

- **Team paste → roster cards** (`@pkmn/sets`): sprite, forme, types, item,
  ability, nature, EV spread; malformed input gives inline errors, never crashes.
- **Drag-to-assign** into Attacker/Defender (`@dnd-kit`), with ⚔/🛡 click-assign
  fallback, re-drag-to-swap, and a ⇄ swap button.
- **Opponent search + auto common-set**: debounced fuzzy search; on pick, loads
  the most common ability/item/tera/spread/moves from usage stats, with
  usage-% dropdowns to swap each. Full fallback chain (active stats → prior reg →
  Smogon curated → base/neutral), surfacing which tier was used.
- **Format selector** with runtime data discovery: probes data.pkmn.cc and shows
  a ⚠ when a format's data is unavailable and a fallback source is used.
- **Mega forme dropdown** (Champions): switch base ↔ Mega; Mega forces its
  ability and post-Mega stats. Non-blocking one-Mega-per-team warning.
- **Battle conditions panel → Field**: weather, terrain, gravity, the four Ruin
  abilities, per-side Light Screen / Reflect / Aurora Veil / Tailwind / Helping
  Hand / Friend Guard, per-Pokémon stat stages (−6..+6) and status, and a crit
  toggle. Doubles applies the spread-move 0.75× automatically.
- **Results**: featured move (click any to feature) with roll range, % of
  defender HP, the Showdown description string, and the KO summary.

## Mega Evolution & the Champions data caveat

`@pkmn/data`'s Gen 9 layer correctly hides Megas (they don't exist in S/V), so
`data.ts` re-admits Mega/Primal formes (flagged `isNonstandard: 'Past'` or
`'Future'`) so a single data source can power both formats.

**Verified against live data (the brief's assumptions were partly out of date):**
- The "new" Champions Megas are now in `@pkmn/dex` (flagged `Future`) with real
  stats and new abilities — e.g. Pyroar-Mega (Fire Mane), Glimmora, Baxcalibur,
  Floette, Dragalge, Eelektross, Scovillain — and **do** calculate.
- Two are still genuinely absent — **Tatsugiri-Mega** and **Annihilape-Mega** —
  so the UI doesn't offer them and resolution degrades to the base forme.
- The "omitted" classic Megas (Sceptile, Blaziken, Swampert, Mawile, Salamence,
  Metagross) are present in the data layer (they are format-banned, not absent).

## Known limitations

- **Champions usage data isn't published on data.pkmn.cc yet** — opponent
  auto-fill for Champions falls back to the newest VGC usage (`gen9vgc2026`
  stats / `gen9vgc2025` sets), with a surfaced note. Gen 9 OU has full data.
- **Item icons** are shown as text chips, not images: `@pkmn/dex` items carry no
  `spritenum` and Showdown's individual item PNGs are inconsistent, so faithful
  icons would require an extra sprite dependency. Pokémon sprites are images.
- Mega availability is detected from the data layer at runtime, so as
  data.pkmn.cc / `@pkmn/dex` add Champions content, more Megas light up
  automatically.

## Testing

`npm test` covers: the set-suggestion fallback chain (mocked fetch reaches each
tier and never throws), Mega forme resolution (present incl. live `Future`
Megas, and graceful degrade for absent ones), known damage calcs verified
against the bundled Showdown engine (including a Charizard-Mega-Y example),
team-paste parsing of a realistic export with a Mega, and conditions → Field
wiring. `npm run smoke` drives the real UI in headless Chrome and asserts zero
console errors.
