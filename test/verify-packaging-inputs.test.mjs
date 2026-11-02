import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyPackagingInputs } from '../scripts/verify-packaging-inputs.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'cos-package-inputs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function put(root, relative, content = '') {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

test('accepts a physical checkout with Sharp and local detect-libc', (t) => {
  const root = fixture(t);
  put(root, 'node_modules/sharp/package.json', '{"name":"sharp"}');
  put(root, 'node_modules/detect-libc/package.json', '{"name":"detect-libc","main":"index.js"}');
  put(root, 'node_modules/detect-libc/index.js', 'module.exports = {};');
  assert.deepEqual(verifyPackagingInputs(root), { sharp: true, detectLibc: true, physical: true });
});

test('rejects missing Sharp transitive detect-libc before builder starts', (t) => {
  const root = fixture(t);
  put(root, 'node_modules/sharp/package.json', '{"name":"sharp"}');
  assert.throws(() => verifyPackagingInputs(root), /cannot resolve detect-libc/);
});

test('rejects a junction or symbolic link to a different node_modules tree', (t) => {
  const root = fixture(t);
  const foreign = path.join(root, 'foreign-modules');
  mkdirSync(foreign);
  try {
    symlinkSync(foreign, path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error?.code)) return t.skip('Windows symlink privilege not available');
    throw error;
  }
  assert.throws(() => verifyPackagingInputs(root), /physical node_modules/);
});

test('rejects detect-libc inherited from a parent instead of this checkout', (t) => {
  const root = fixture(t);
  const checkout = path.join(root, 'checkout');
  put(checkout, 'node_modules/sharp/package.json', '{"name":"sharp"}');
  put(root, 'node_modules/detect-libc/package.json', '{"name":"detect-libc","main":"index.js"}');
  put(root, 'node_modules/detect-libc/index.js', 'module.exports = {};');
  assert.throws(() => verifyPackagingInputs(checkout), /outside this checkout/);
});
