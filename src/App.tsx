import { useEffect, useMemo, useState } from 'react';
import { createPokemon, createMove, runCalc, makeField } from './services/calc';
import {
  FORMATS,
  DEFAULT_FORMAT_ID,
  getFormat,
  discoverFormats,
  type ResolvedFormat,
} from './services/formats';

// Demo calc that respects the selected format's rules (game type / level / Megas).
// Replaced by the real attacker/defender slots in later milestones.
function demoCalcs(formatId: string) {
  const f = getFormat(formatId);
  const lvl = f.level;
  const field = (extra = {}) => makeField(f.gameType, extra);
  const garchomp = () => createPokemon('Garchomp', { level: lvl, evs: { hp: 4 } });

  const normal = runCalc(
    createPokemon('Charizard', { level: lvl, evs: { spa: 252 }, nature: 'Modest', item: 'Choice Specs' }),
    garchomp(),
    createMove('Flamethrower'),
    field({ weather: 'Sun', defenderSide: { isLightScreen: true } }),
  );

  const mega = f.megasEnabled
    ? runCalc(
        createPokemon('Charizard-Mega-Y', { level: lvl, evs: { spa: 252 }, nature: 'Modest' }),
        garchomp(),
        createMove('Flamethrower'),
        field({ weather: 'Sun' }),
      )
    : null;

  return { normal, mega };
}

function koText(r: { ko: { text: string }; desc: string }) {
  return r.ko.text || r.desc.split('--')[1]?.trim() || '';
}

export default function App() {
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID);
  const [resolved, setResolved] = useState<ResolvedFormat[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    discoverFormats()
      .then((r) => live && setResolved(r))
      .catch((e) => live && setDiscoverError(String(e)));
    return () => {
      live = false;
    };
  }, []);

  const { normal, mega } = useMemo(() => demoCalcs(formatId), [formatId]);
  const format = getFormat(formatId);
  const info = resolved?.find((r) => r.def.id === formatId);

  const groups = useMemo(() => {
    const m = new Map<string, typeof FORMATS>();
    for (const f of FORMATS) {
      if (!m.has(f.group)) m.set(f.group, []);
      m.get(f.group)!.push(f);
    }
    return [...m.entries()];
  }, []);

  return (
    <main style={{ maxWidth: 760, margin: '2rem auto', padding: '0 1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 0 }}>Damage Calculator</h1>
      <p style={{ color: '#666', marginTop: 4 }}>
        Milestones 1–2 — engine wired, format discovery + selector.
      </p>

      <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Format / version</label>
      <select
        value={formatId}
        onChange={(e) => setFormatId(e.target.value)}
        style={{ fontSize: '1rem', padding: '.4rem', minWidth: 280 }}
      >
        {groups.map(([group, fmts]) => (
          <optgroup key={group} label={group}>
            {fmts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <p style={{ color: '#555', fontSize: '.9rem' }}>
        {format.gameType} · Level {format.level} · Megas {format.megasEnabled ? 'enabled' : 'off'}
      </p>

      <section style={{ background: '#f6f6f6', borderRadius: 8, padding: '.75rem 1rem', fontSize: '.85rem' }}>
        <strong>Data sources (live):</strong>{' '}
        {discoverError && <span style={{ color: '#b00' }}>discovery failed: {discoverError}</span>}
        {!discoverError && !resolved && <span>probing data.pkmn.cc…</span>}
        {info && (
          <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem' }}>
            <li>
              usage stats: <code>{info.stats.id ?? 'none'}</code>
              {info.stats.note && <em style={{ color: '#a60' }}> — {info.stats.note}</em>}
            </li>
            <li>
              curated sets: <code>{info.sets.id ?? 'none'}</code>
              {info.sets.note && <em style={{ color: '#a60' }}> — {info.sets.note}</em>}
            </li>
          </ul>
        )}
      </section>

      {[
        { label: 'Choice Specs Charizard, Sun, through Light Screen', r: normal },
        ...(mega ? [{ label: 'Charizard-Mega-Y (post-Mega stats + forced Drought), Sun', r: mega }] : []),
      ].map(({ label, r }) => (
        <section key={label} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem', margin: '1rem 0' }}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 .5rem' }}>{label}</h2>
          <p style={{ margin: '.25rem 0' }}>
            <strong>
              {r.range[0]}–{r.range[1]}
            </strong>{' '}
            ({r.percent[0]}–{r.percent[1]}%) — {koText(r)}
          </p>
          <code style={{ display: 'block', fontSize: '.8rem', color: '#444' }}>{r.desc}</code>
        </section>
      ))}
    </main>
  );
}
