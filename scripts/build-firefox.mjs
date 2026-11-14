/*
 * Builds dist-firefox/, a directory Firefox can load directly:
 *
 *   npm run build:firefox
 *   about:debugging -> This Firefox -> Load Temporary Add-on
 *   -> pick dist-firefox/manifest.json
 *
 * There is no bundler and no dependencies: the extension already ships plain
 * files, so this only copies them and writes the Firefox-flavoured manifest.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefoxManifest } from './firefox-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-firefox');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const dir of ['src', 'icons']) {
  fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
}

const chromium = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const firefox = firefoxManifest(chromium);

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(firefox, null, 2) + '\n');

console.log('Firefox build -> ' + path.relative(root, out));
console.log('  name/version : ' + firefox.name + ' ' + firefox.version);
console.log('  background   : ' + firefox.background.scripts.join(', ') + ' (event page)');
console.log('  gecko id     : ' + firefox.browser_specific_settings.gecko.id);
console.log('  load with    : about:debugging -> This Firefox -> Load Temporary Add-on');
