/** Sprite URLs + type colours. Pure helpers, no data dependency. */
import { Icons } from '@pkmn/img';
import type { CSSProperties } from 'react';

/** Inline style for an item's icon, drawn from the Showdown itemicons sheet. */
export function itemIconStyle(item: string | undefined): CSSProperties | null {
  if (!item) return null;
  try {
    return Icons.getItem(item).css as CSSProperties;
  } catch {
    return null;
  }
}

export function toID(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Pokémon Showdown gen5 sprite URL. Formes are `baseid-formeid`
 * (e.g. Charizard + Mega-Y -> `charizard-megay`); plain species use their id.
 * Falls back to a substitute sprite via the consumer's onError handler.
 */
export function spriteUrl(baseSpecies: string, forme?: string): string {
  const id = forme ? `${toID(baseSpecies)}-${toID(forme)}` : toID(baseSpecies);
  return `https://play.pokemonshowdown.com/sprites/gen5/${id}.png`;
}

export const SUBSTITUTE_SPRITE = 'https://play.pokemonshowdown.com/sprites/gen5/substitute.png';

export const TYPE_COLORS: Record<string, string> = {
  Normal: '#9fa19f', Fire: '#e62829', Water: '#2980ef', Electric: '#fac000',
  Grass: '#3fa129', Ice: '#3dcef3', Fighting: '#ff8000', Poison: '#9141cb',
  Ground: '#915121', Flying: '#81b9ef', Psychic: '#ef4179', Bug: '#91a119',
  Rock: '#afa981', Ghost: '#704170', Dragon: '#5060e1', Dark: '#624d4e',
  Steel: '#60a1b8', Fairy: '#ef70ef', Stellar: '#40b5a5', '???': '#888',
};

export function typeColor(type?: string): string {
  return (type && TYPE_COLORS[type]) || '#888';
}
