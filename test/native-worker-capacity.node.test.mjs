import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryAdmissionSlots, cpuAdmissionSlots, cpuLoadFromTicks } from '../src/main/native-worker-capacity.ts';
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

test('CPU guard admits only within estimated effective parallelism and pending reservations', () => {
  const cpu = {enabled:true,parallelism:2,load:0,pendingWorkers:0};
  assert.equal(cpuAdmissionSlots(cpu),3);
  assert.equal(cpuAdmissionSlots({...cpu,load:1,pendingWorkers:1}),0);
  assert.equal(cpuAdmissionSlots({...cpu,load:4}),0);
  assert.equal(cpuAdmissionSlots({...cpu,parallelism:8,load:1,pendingWorkers:2}),8);
  assert.equal(cpuAdmissionSlots({...cpu,load:NaN}),0);
  assert.equal(cpuAdmissionSlots({...cpu,enabled:false,load:NaN}),Infinity);
});
test('Windows CPU delta requires a valid recent sample; resets do not create capacity', () => {
  const before = {at:1000,total:10000,idle:8000,cores:4};
  const after = {at:3000,total:18000,idle:12000,cores:4};
  assert.equal(cpuLoadFromTicks(before,after),2);
  assert.equal(cpuLoadFromTicks(before,{...after,at:1100}),undefined);
  assert.equal(cpuLoadFromTicks(before,{...after,at:40000}),undefined);
  assert.equal(cpuLoadFromTicks(before,{...after,cores:2}),undefined);
  assert.equal(cpuLoadFromTicks(before,{...after,idle:5000}),undefined);
});
