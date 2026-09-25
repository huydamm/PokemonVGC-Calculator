import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CSP } from './csp';

const dir = join(__dirname, '../src/services');

describe('CSP', () => {
  it('allows every host the services reach', () => {
    const hosts = new Set<string>();
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/https:\/\/[a-z0-9.-]+/g)) hosts.add(m[0]);
    }
    expect(hosts.size).toBeGreaterThan(0);
    for (const h of hosts) expect(CSP, h).toContain(h);
    // Redirect target of data.pkmn.cc (not in the source, but fetches land there).
    expect(CSP).toContain('https://pkmn.github.io');
  });

  it('keeps scripts same-origin', () => {
    expect(CSP).toMatch(/script-src 'self'(;|$)/);
    expect(CSP).toContain("object-src 'none'");
  });
});
