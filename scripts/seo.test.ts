import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const SITE = 'https://vgccalc.app/';

describe('SEO files', () => {
  const index = read('index.html');

  it('index.html has title, description, canonical, one h1 and valid JSON-LD', () => {
    expect(index).toMatch(/<title>[^<]+<\/title>/);
    expect(index).toMatch(/<meta\s+name="description"\s+content="[^"]{50,160}"/);
    expect(index).toContain(`<link rel="canonical" href="${SITE}" />`);
    expect(index.match(/<h1[\s>]/g)).toHaveLength(1);
    const ld = index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(JSON.parse(ld ?? '')).toMatchObject({ '@type': 'WebApplication', url: SITE });
  });

  it('robots.txt points at the sitemap, and the sitemap lists only our URLs', () => {
    expect(read('public/robots.txt')).toContain(`Sitemap: ${SITE}sitemap.xml`);
    const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const l of locs) expect(l.startsWith(SITE)).toBe(true);
  });

  it('nothing is noindexed', () => {
    for (const p of ['index.html', 'public/privacy.html']) expect(read(p)).not.toMatch(/noindex/i);
  });
});
