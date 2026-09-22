/**
 * Zips the runtime files of extension/ into release/vgc-live-calc-<version>.zip for the
 * Chrome Web Store. Allowlist, not denylist, so sources (*.ts, *.css) and probe.js never ship.
 * Run after `npm run build:ext`. Uses `zip` (CI is Linux) or Windows' bundled bsdtar.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const FILES = ['manifest.json', 'options.html', 'dist/inject.js', 'dist/content.js', 'dist/background.js', 'dist/options.js', 'fonts', 'icons'];

const ext = resolve('extension');
const missing = FILES.filter((f) => !existsSync(resolve(ext, f)));
if (missing.length) {
  console.error(`pack:ext: missing ${missing.join(', ')} (run npm run build:ext first)`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(resolve(ext, 'manifest.json'), 'utf8'));
mkdirSync('release', { recursive: true });
const out = resolve('release', `vgc-live-calc-${version}.zip`);
rmSync(out, { force: true });

// Full path on Windows: Git Bash puts GNU tar (no zip support) first on PATH.
if (process.platform === 'win32') execFileSync(`${process.env.SystemRoot}\\System32\\tar.exe`, ['-a', '-cf', out, ...FILES], { cwd: ext, stdio: 'inherit' });
else execFileSync('zip', ['-qr', out, ...FILES], { cwd: ext, stdio: 'inherit' });

console.log(`pack:ext: ${out} (${(statSync(out).size / 1024).toFixed(0)} KB, v${version})`);
