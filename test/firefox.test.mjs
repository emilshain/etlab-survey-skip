/*
 * The Firefox manifest is generated, so these tests are really about the
 * conversion being faithful: same identity, same permissions, event page
 * instead of a service worker, and a stable Gecko id.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefoxManifest, GECKO_ID } from '../scripts/firefox-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromium = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const firefox = firefoxManifest(chromium);

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    console.log('  FAIL ' + name + ' -> ' + error.message);
    process.exitCode = 1;
  }
}

test('keeps the same name and version', () => {
  assert.equal(firefox.name, chromium.name);
  assert.equal(firefox.version, chromium.version);
});

test('keeps every permission and host permission', () => {
  assert.deepEqual(firefox.permissions, chromium.permissions);
  assert.deepEqual(firefox.host_permissions, chromium.host_permissions);
});

test('uses an event page instead of a service worker', () => {
  assert.equal(firefox.background.service_worker, undefined);
  assert.deepEqual(firefox.background.scripts, [chromium.background.service_worker]);
});

test('the background script it points at exists', () => {
  firefox.background.scripts.forEach((f) =>
    assert.ok(fs.existsSync(path.join(root, f)), 'missing ' + f));
});

test('drops minimum_chrome_version', () => {
  assert.equal(firefox.minimum_chrome_version, undefined);
});

test('declares a stable gecko id with a minimum version', () => {
  assert.equal(firefox.browser_specific_settings.gecko.id, GECKO_ID);
  assert.match(firefox.browser_specific_settings.gecko.strict_min_version, /^\d+\.\d+$/);
});

test('keeps the popup and icons', () => {
  assert.equal(firefox.action.default_popup, chromium.action.default_popup);
  assert.deepEqual(firefox.icons, chromium.icons);
  Object.values(firefox.icons).forEach((p) =>
    assert.ok(fs.existsSync(path.join(root, p)), 'missing ' + p));
});

test('the conversion does not mutate the source manifest', () => {
  assert.ok(chromium.background.service_worker, 'source manifest must stay Chromium-style');
  assert.equal(chromium.browser_specific_settings, undefined);
});

test('refuses a manifest without a service worker', () => {
  assert.throws(() => firefoxManifest({ background: {} }), /background.service_worker/);
});

console.log('\nAll ' + passed + ' Firefox manifest tests passed.');
