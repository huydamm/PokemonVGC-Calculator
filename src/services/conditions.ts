/** Battle conditions state that drives the calc Field + per-Pokémon modifiers. */
import type { StatsTable } from '@pkmn/data';

export type Weather = 'Sun' | 'Rain' | 'Sand' | 'Snow';
export type Terrain = 'Electric' | 'Grassy' | 'Misty' | 'Psychic';
export type Status = '' | 'brn' | 'psn' | 'tox' | 'par' | 'slp' | 'frz';

export interface SideConditions {
  lightScreen: boolean;
  reflect: boolean;
  auroraVeil: boolean;
  tailwind: boolean;
  helpingHand: boolean;
  friendGuard: boolean;
}

export interface Conditions {
  weather?: Weather;
  terrain?: Terrain;
  gravity: boolean;
  beadsOfRuin: boolean; // -25% SpD (Chi-Yu)
  swordOfRuin: boolean; // -25% Def (Chien-Pao)
  tabletsOfRuin: boolean; // -25% Atk (Wo-Chien? -> actually Ting-Lu is Vessel) see calc
  vesselOfRuin: boolean; // -25% SpA
  crit: boolean;
  attackerSide: SideConditions;
  defenderSide: SideConditions;
}

/** Per-Pokémon modifiers (stat stages, status, Tera) layered onto the parsed set. */
export interface Mods {
  boosts: Partial<StatsTable>;
  status: Status;
  /** Whether this Pokémon is Terastallized (applies its set's Tera type). */
  tera: boolean;
}

export const STAT_STAGE_KEYS: (keyof StatsTable)[] = ['atk', 'def', 'spa', 'spd', 'spe'];

export const STATUS_LABELS: { value: Status; label: string }[] = [
  { value: '', label: 'Healthy' },
  { value: 'brn', label: 'Burned' },
  { value: 'par', label: 'Paralyzed' },
  { value: 'psn', label: 'Poisoned' },
  { value: 'tox', label: 'Badly Poisoned' },
  { value: 'slp', label: 'Asleep' },
  { value: 'frz', label: 'Frozen' },
];

const emptySide = (): SideConditions => ({
  lightScreen: false,
  reflect: false,
  auroraVeil: false,
  tailwind: false,
  helpingHand: false,
  friendGuard: false,
});

export const DEFAULT_CONDITIONS: Conditions = {
  weather: undefined,
  terrain: undefined,
  gravity: false,
  beadsOfRuin: false,
  swordOfRuin: false,
  tabletsOfRuin: false,
  vesselOfRuin: false,
  crit: false,
  attackerSide: emptySide(),
  defenderSide: emptySide(),
};

export const DEFAULT_MODS: Mods = { boosts: {}, status: '', tera: false };
