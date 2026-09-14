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
  /** Doubles: spread moves hit only one target (no 0.75x), e.g. the other foe fainted or protected. */
  singleTarget: boolean;
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
  singleTarget: false,
  attackerSide: emptySide(),
  defenderSide: emptySide(),
};

export const DEFAULT_MODS: Mods = { boosts: {}, status: '', tera: false };

const SIDE_LABELS: Record<keyof SideConditions, string> = {
  lightScreen: 'Light Screen',
  reflect: 'Reflect',
  auroraVeil: 'Aurora Veil',
  tailwind: 'Tailwind',
  helpingHand: 'Helping Hand',
  friendGuard: 'Friend Guard',
};
const RUIN_LABELS: [keyof Conditions, string][] = [
  ['beadsOfRuin', 'Beads of Ruin'],
  ['swordOfRuin', 'Sword of Ruin'],
  ['tabletsOfRuin', 'Tablets of Ruin'],
  ['vesselOfRuin', 'Vessel of Ruin'],
];
const STAGE_LABELS: Record<string, string> = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

/**
 * Short labels for every non-default battle condition and modifier. Shown on the
 * Calc tab (so settings moved to the Field tab are never invisible) and counted
 * in the Field tab badge. Tera is left out: its toggle lives on the slot. The
 * one-target spread toggle only counts in Doubles, where it does anything.
 */
export function activeConditionSummary(c: Conditions, attacker: Mods, defender: Mods, doubles = true): string[] {
  const out: string[] = [];
  if (c.weather) out.push(c.weather);
  if (c.terrain) out.push(`${c.terrain} Terrain`);
  if (c.gravity) out.push('Gravity');
  if (c.crit) out.push('Critical hit');
  if (doubles && c.singleTarget) out.push('Spread hits 1 target');
  for (const [key, label] of RUIN_LABELS) if (c[key]) out.push(label);
  for (const [side, who] of [['attackerSide', 'attacker'], ['defenderSide', 'defender']] as const) {
    for (const key of Object.keys(SIDE_LABELS) as (keyof SideConditions)[]) {
      if (c[side][key]) out.push(`${SIDE_LABELS[key]} (${who})`);
    }
  }
  for (const [mods, who] of [[attacker, 'attacker'], [defender, 'defender']] as const) {
    for (const key of STAT_STAGE_KEYS) {
      const v = mods.boosts[key] ?? 0;
      if (v) out.push(`${STAGE_LABELS[key]} ${v > 0 ? '+' : ''}${v} (${who})`);
    }
    if (mods.status) out.push(`${STATUS_LABELS.find((s) => s.value === mods.status)?.label} (${who})`);
  }
  return out;
}
