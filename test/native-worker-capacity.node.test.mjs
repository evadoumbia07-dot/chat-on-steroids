import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryAdmissionSlots } from '../src/main/native-worker-capacity.ts';
const base = { enabled: true, totalMiB: 8192, availableMiB: 4096, pendingWorkers: 0 };
test('RAM guard is opt in and respects low memory', () => {
  assert.equal(memoryAdmissionSlots({...base, enabled:false,availableMiB:0}), Infinity);
  assert.equal(memoryAdmissionSlots({...base, availableMiB:1700}), 0);
  assert.equal(memoryAdmissionSlots(base), 4);
});
test('more available RAM permits more admissions, pending reservations reduce them', () => {
  assert.equal(memoryAdmissionSlots({...base,pendingWorkers:3}), 1);
  assert.equal(memoryAdmissionSlots({...base,pendingWorkers:9}), 0);
  assert.equal(memoryAdmissionSlots({...base,totalMiB:16384,availableMiB:8192}), 9);
});
test('invalid measurements fail closed and available cannot exceed host total', () => {
  assert.equal(memoryAdmissionSlots({...base,availableMiB:NaN}), 0);
  assert.equal(memoryAdmissionSlots({...base,totalMiB:0}), 0);
  assert.equal(memoryAdmissionSlots({...base,pendingWorkers:-1}), 0);
  assert.equal(memoryAdmissionSlots({...base,availableMiB:999999}), 12);
});
