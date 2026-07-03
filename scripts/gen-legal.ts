/**
 * Precompute the legal species pool per app format, and emit it as a static
 * JSON the app ships (so @pkmn/sim stays a dev-only dependency and never bloats
 * the browser bundle).
 *
 * Smogon singles/doubles pools come from @pkmn/sim's exact Showdown rules.
 * Pokémon Champions has no @pkmn/sim format and no data.pkmn.cc usage, so its
 * roster is a hand-maintained list transcribed from Bulbapedia (current
 * Regulation M-B: 208 species, no Legendaries/Mythicals). Update CHAMPIONS when
 * a new regulation ships. Megas are reached via the forme toggle, not the
 * species search, so the base-species pool is all the picker needs.
 *
 * Run: npx tsx scripts/gen-legal.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Dex, TeamValidator, toID } from '@pkmn/sim';

// app format id -> Showdown sim format id (for the sim-derived pools)
const SIM_FORMAT: Record<string, { id: string; level: number }> = {
  gen9ou: { id: 'gen9ou', level: 100 },
  gen9doublesou: { id: 'gen9doublesou', level: 100 },
};

// Problems that mean the species itself is illegal for the format (as opposed
// to set-construction noise about EVs/IVs/moves we deliberately leave invalid).
const BANNED = /banned|unreleased|does not exist|cannot be used|is not obtainable|not available/i;

function simLegalIds(simFormat: string, level: number): string[] {
  const tv = new TeamValidator(simFormat);
  const ids: string[] = [];
  for (const sp of tv.dex.species.all()) {
    if (!sp.exists || sp.isNonstandard === 'Future' || sp.isNonstandard === 'CAP') continue;
    const set = {
      name: sp.name,
      species: sp.name,
      level,
      gender: '',
      ability: Object.values(sp.abilities)[0] ?? '',
      item: '',
      moves: ['Tackle'],
      evs: { hp: 4 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      nature: 'Hardy',
      shiny: false,
    };
    const problems = tv.validateSet(set as never, {});
    if (!problems || !problems.some((m) => BANNED.test(m))) ids.push(sp.id);
  }
  return ids.sort();
}

// Pokémon Champions roster (Bulbapedia, Reg M-B). Base species only.
const CHAMPIONS = `
Venusaur, Charizard, Blastoise, Beedrill, Pidgeot, Arbok, Pikachu, Raichu, Clefable, Ninetales,
Vileplume, Arcanine, Alakazam, Machamp, Victreebel, Slowbro, Gengar, Kangaskhan, Starmie, Pinsir,
Tauros, Gyarados, Ditto, Vaporeon, Jolteon, Flareon, Aerodactyl, Snorlax, Dragonite, Meganium,
Typhlosion, Feraligatr, Ariados, Ampharos, Azumarill, Politoed, Espeon, Umbreon, Slowking, Forretress,
Steelix, Qwilfish, Scizor, Heracross, Skarmory, Houndoom, Tyranitar, Sceptile, Blaziken, Swampert,
Pelipper, Gardevoir, Sableye, Mawile, Aggron, Medicham, Manectric, Sharpedo, Camerupt, Torkoal,
Altaria, Milotic, Castform, Banette, Chimecho, Absol, Glalie, Metagross, Torterra, Infernape,
Empoleon, Staraptor, Luxray, Roserade, Rampardos, Bastiodon, Lopunny, Spiritomb, Garchomp, Lucario,
Hippowdon, Toxicroak, Abomasnow, Weavile, Rhyperior, Leafeon, Glaceon, Gliscor, Mamoswine, Gallade,
Froslass, Rotom, Serperior, Emboar, Samurott, Watchog, Liepard, Simisage, Simisear, Simipour,
Musharna, Excadrill, Audino, Conkeldurr, Scolipede, Whimsicott, Krookodile, Scrafty, Cofagrigus, Garbodor,
Zoroark, Reuniclus, Vanilluxe, Emolga, Eelektross, Chandelure, Beartic, Stunfisk, Golurk, Hydreigon,
Volcarona, Chesnaught, Delphox, Greninja, Diggersby, Talonflame, Vivillon, Pyroar, Floette, Florges,
Pangoro, Furfrou, Meowstic, Aegislash, Aromatisse, Slurpuff, Malamar, Barbaracle, Dragalge, Clawitzer,
Heliolisk, Tyrantrum, Aurorus, Sylveon, Hawlucha, Dedenne, Goodra, Klefki, Trevenant, Gourgeist,
Avalugg, Noivern, Decidueye, Incineroar, Primarina, Toucannon, Crabominable, Lycanroc, Toxapex, Mudsdale,
Araquanid, Salazzle, Tsareena, Oranguru, Passimian, Mimikyu, Drampa, Kommo-o, Corviknight, Flapple,
Appletun, Sandaconda, Polteageist, Hatterene, Grimmsnarl, Mr. Rime, Runerigus, Alcremie, Falinks, Morpeko,
Dragapult, Wyrdeer, Kleavor, Basculegion, Sneasler, Overqwil, Meowscarada, Skeledirge, Quaquaval
`;

function championsIds(): string[] {
  const dex = Dex.forGen(9);
  const ids: string[] = [];
  const missing: string[] = [];
  for (const raw of CHAMPIONS.split(',').map((s) => s.trim()).filter(Boolean)) {
    const sp = dex.species.get(raw);
    if (sp?.exists) ids.push(sp.id);
    else {
      const id = toID(raw);
      if (id) ids.push(id); // keep even if the gen9 dex flags it Past
      missing.push(raw);
    }
  }
  if (missing.length) console.warn(`  Champions: ${missing.length} not in gen9 dex (kept): ${missing.join(', ')}`);
  return [...new Set(ids)].sort();
}

const out: Record<string, string[]> = {};
for (const [appId, { id, level }] of Object.entries(SIM_FORMAT)) {
  out[appId] = simLegalIds(id, level);
  console.log(`${appId} (${id}): ${out[appId].length} legal species`);
}
out.gen9champions = championsIds();
console.log(`gen9champions (Bulbapedia Reg M-B): ${out.gen9champions.length} legal species`);

const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'services', 'legal-species.json');
writeFileSync(dest, JSON.stringify(out) + '\n');
console.log(`wrote ${dest}`);
