/*
 * Guards the packaging contract: the manifest, the package name and the files
 * the browser actually loads must agree, and the extension must never ask for
 * more access than it needs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    console.log('  FAIL ' + name + ' -> ' + error.message);
    process.exitCode = 1;
  }
};

test('is Manifest V3', () => assert.equal(manifest.manifest_version, 3));

test('is named ETLab Survey Skip', () => {
  assert.equal(manifest.name, 'ETLab Survey Skip');
  assert.equal(manifest.action.default_title, 'ETLab Survey Skip');
});

test('manifest and package versions agree', () => assert.equal(manifest.version, pkg.version));

test('requests no more than scripting, tabs and storage', () =>
  assert.deepEqual([...manifest.permissions].sort(), ['scripting', 'storage', 'tabs']));

test('never asks for localhost access', () =>
  assert.deepEqual(manifest.host_permissions.filter((h) => /127\.0\.0\.1|localhost/.test(h)), []));

test('host permissions are limited to ETLab domains', () =>
  manifest.host_permissions.forEach((h) =>
    assert.match(h, /^https:\/\/(\*\.)?etlab\.(app|in)\/\*$/)));

test('every file the manifest loads exists', () =>
  [manifest.background.service_worker, manifest.action.default_popup].forEach((f) =>
    assert.ok(fs.existsSync(path.join(root, f)), 'missing ' + f)));

test('popup title matches the extension name', () => {
  const html = read('src/popup.html');
  assert.match(html, /<title>ETLab Survey Skip<\/title>/);
  assert.match(html, /<h1>ETLab Survey Skip<\/h1>/);
});

test("every icon the manifest references exists", () => {
  Object.values(manifest.icons || {}).forEach((p) =>
    assert.ok(fs.existsSync(path.join(root, p)), "missing " + p));
});

test("icons are real PNG files", () => {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  Object.values(manifest.icons || {}).forEach((p) =>
    assert.deepEqual([...fs.readFileSync(path.join(root, p)).subarray(0, 8)], magic, "not a PNG: " + p));
});

console.log('\nAll ' + passed + ' manifest tests passed.');
