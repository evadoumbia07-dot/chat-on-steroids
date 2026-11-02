import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Electron-builder follows the checkout's dependency graph. A junction to a
// different checkout can silently omit Sharp's hoisted transitive dependencies
// even though an ordinary source build succeeds. Reject that input *before*
// downloading runtimes or constructing an unusable Windows package.
export function verifyPackagingInputs(checkoutRoot) {
  const dependencyRoot = path.join(checkoutRoot, 'node_modules');
  let stat;
  try {
    stat = lstatSync(dependencyRoot);
  } catch {
    throw new Error('Packaging requires locally installed node_modules; run npm ci in this checkout.');
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Packaging requires physical node_modules in this checkout, not a symlink or junction; run npm ci in an isolated checkout.');
  }

  const sharpManifest = path.join(dependencyRoot, 'sharp', 'package.json');
  if (!existsSync(sharpManifest)) {
    throw new Error('Packaging requires Sharp installed in this checkout; run npm ci.');
  }

  const sharpRequire = createRequire(sharpManifest);
  let libcEntry;
  try {
    libcEntry = sharpRequire.resolve('detect-libc');
  } catch {
    throw new Error('Sharp cannot resolve detect-libc from this checkout; run npm ci before packaging.');
  }
  // A parent folder's hoisted module must not mask an incomplete checkout.
  const realDeps = realpathSync(dependencyRoot);
  const relative = path.relative(realDeps, realpathSync(libcEntry));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Sharp resolves detect-libc outside this checkout; install physical dependencies with npm ci.');
  }
  return { sharp: true, detectLibc: true, physical: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  verifyPackagingInputs(root);
  process.stdout.write('Packaging inputs verified: physical node_modules and local Sharp/detect-libc.\n');
}
