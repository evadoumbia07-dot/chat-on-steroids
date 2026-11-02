import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(path.join(root, 'ecom-cos-source.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const license = readFileSync(path.join(root, 'LICENSE'), 'utf8');
const architecture = readFileSync(path.join(root, 'docs', 'ECOM-OS-NATIVE-COS.md'), 'utf8');

assert.equal(pkg.name, 'chat-on-steroids');
assert.equal(pkg.version, source.upstream.tag.slice(1));
assert.match(license, /MIT License/);
assert.match(license, /Chat On Steroids contributors/);
assert.equal(source.upstream.commit.length, 40);
assert.equal(source.product.basis, 'actual-upstream-cos-source');
assert.equal(source.product.no_second_orchestrator, true);
assert.equal(source.integration.cloud, 'fenced-standby');
assert.equal(source.integration.canonical_mission, 'umi-1dad2d3f3ec2246cdc39daa7');
assert.match(architecture, /GET \/v1\/workers\/\{localOwnerId\}/);
for (const native of [
  'src/main/agents.ts',
  'src/main/goal.ts',
  'src/main/agent-admission.ts',
  'src/main/control-workers.ts',
  'src/main/control-api.ts',
  'extension/manifest.json'
]) {
  assert.ok(readFileSync(path.join(root, native)).length > 0, native);
}
console.log('ECOM_COS_REAL_UPSTREAM_BASELINE_VERIFIED', source.upstream.tag, source.upstream.commit);
