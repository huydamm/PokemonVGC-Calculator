/**
 * Mega (incl. Z Megas "Mega-Z" and gendered "M-Mega"/"F-Mega", which the dex
 * leaves `isMega` unset on) or Primal forme. Dependency-free so
 * scripts/gen-legal.ts can use it without loading data.ts (which patches the dex).
 */
export function isMegaSpecies(sp: { isMega?: boolean; isPrimal?: boolean; forme?: string }): boolean {
  return !!(sp.isMega || sp.isPrimal || /Mega|^Primal$/.test(sp.forme ?? ''));
}
