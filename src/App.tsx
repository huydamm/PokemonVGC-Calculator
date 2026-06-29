import { useMemo } from 'react';
import { createPokemon, createMove, runCalc, vgcField } from './services/calc';

// Milestone 1: prove the engine renders a CORRECT damage range + description in
// the actual app, including a Mega forme. UI is replaced by the real calculator
// in later milestones.
function milestoneCalcs() {
  const garchomp = () => createPokemon('Garchomp', { evs: { hp: 4 } });

  const normal = runCalc(
    createPokemon('Charizard', { evs: { spa: 252 }, nature: 'Modest', item: 'Choice Specs' }),
    garchomp(),
    createMove('Flamethrower'),
    vgcField({ weather: 'Sun', defenderSide: { isLightScreen: true } }),
  );

  const mega = runCalc(
    createPokemon('Charizard-Mega-Y', { evs: { spa: 252 }, nature: 'Modest' }),
    garchomp(),
    createMove('Flamethrower'),
    vgcField({ weather: 'Sun' }),
  );

  return { normal, mega };
}

export default function App() {
  const { normal, mega } = useMemo(milestoneCalcs, []);

  return (
    <main style={{ maxWidth: 760, margin: '2rem auto', padding: '0 1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>VGC Damage Calculator</h1>
      <p style={{ color: '#666' }}>
        Milestone 1 — engine wired (@smogon/calc/adaptable ← @pkmn/dex), Level 50 doubles.
      </p>
      {[
        { label: 'Choice Specs Charizard, Sun, through Light Screen', r: normal },
        { label: 'Charizard-Mega-Y (post-Mega SpA + forced Drought), Sun', r: mega },
      ].map(({ label, r }) => (
        <section key={label} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem', margin: '1rem 0' }}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 .5rem' }}>{label}</h2>
          <p style={{ margin: '.25rem 0' }}>
            <strong>{r.range[0]}–{r.range[1]}</strong> ({r.percent[0]}–{r.percent[1]}%) — {r.ko.text || r.desc.split('--')[1]?.trim()}
          </p>
          <code style={{ display: 'block', fontSize: '.8rem', color: '#444' }}>{r.desc}</code>
        </section>
      ))}
    </main>
  );
}
