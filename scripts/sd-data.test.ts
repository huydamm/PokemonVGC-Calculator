import { describe, it, expect } from 'vitest';
import { loadSdExport, diffChampionsMoves, type DexMoveLike } from './sd-data';

// Trimmed shape of Showdown's typed data files: annotated export, methods inside entries.
const FIXTURE = `
export const Moves: import('../../../sim/dex-moves').ModdedMoveDataTable = {
	psyshieldbash: { inherit: true, basePower: 90 },
	fakeout: {
		inherit: true,
		onDisableMove(pokemon: Pokemon) {
			if (pokemon.activeMoveActions > 1) pokemon.disableMove('fakeout');
		},
	},
};
`;

describe('loadSdExport', () => {
  it('evaluates a typed Showdown table, methods and all', () => {
    const moves = loadSdExport<Record<string, Record<string, unknown>>>(FIXTURE, 'Moves');
    expect(moves.psyshieldbash.basePower).toBe(90);
    expect(typeof moves.fakeout.onDisableMove).toBe('function');
  });

  it('throws on a missing export rather than returning nothing', () => {
    expect(() => loadSdExport(FIXTURE, 'Items')).toThrow(/Items/);
  });
});

describe('diffChampionsMoves', () => {
  const dex: Record<string, DexMoveLike> = {
    psyshieldbash: { exists: true, basePower: 70, type: 'Fighting', flags: { contact: 1 } },
    protect: { exists: true, basePower: 0, type: 'Normal' },
    dragonclaw: { exists: true, basePower: 80, flags: { contact: 1, protect: 1 } },
    freezedry: { exists: true, basePower: 70, secondaries: [{ chance: 10, status: 'frz' }] },
    meteorassault: { exists: true, basePower: 150, isNonstandard: 'Past' },
  };
  const { patch, admit, ignored } = diffChampionsMoves(
    {
      psyshieldbash: { inherit: true, basePower: 90 },
      protect: { inherit: true, pp: 5, self: { boosts: { spa: -2 } }, onTry() {} },
      dragonclaw: { inherit: true, flags: { contact: 1, slicing: 1 } },
      freezedry: { inherit: true, secondary: null },
      meteorassault: { inherit: true, basePower: 170, isNonstandard: null },
      notinthedex: { inherit: true, basePower: 1 },
    },
    (id) => dex[id],
  );

  it('keeps damage fields, drops the rest', () => {
    expect(patch.psyshieldbash).toEqual({ basePower: 90 });
    expect(patch.protect).toBeUndefined(); // pp only
    expect(patch.notinthedex).toBeUndefined();
  });

  it('carries the whole flags object (removed flags as 0) and a removed secondary', () => {
    expect(patch.dragonclaw).toEqual({ flags: { contact: 1, slicing: 1, protect: 0 } });
    expect(patch.freezedry).toEqual({ secondaries: false });
  });

  it('reports other changed keys instead of dropping them silently', () => {
    expect(ignored.protect).toEqual(['self', 'onTry()']);
    expect(ignored.psyshieldbash).toBeUndefined();
  });

  it('refuses a data file that imports other modules', () => {
    expect(() => loadSdExport(`import { x } from './base';\nexport const Moves = { a: x };`, 'Moves')).toThrow(/imports/);
  });

  it('admits moves Champions re-enables', () => {
    expect(patch.meteorassault).toEqual({ basePower: 170 });
    expect(admit).toEqual(['meteorassault']);
  });
});
