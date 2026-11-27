import { availableParallelism, cpus, freemem, loadavg, totalmem } from 'node:os';
import { readFileSync } from 'node:fs';

const MiB = 1024 * 1024;

/** Conservative admission estimate, not a provider quota or measured per-tab usage. */
export function memoryAdmissionSlots(input: {
  enabled: boolean; availableMiB: number; totalMiB: number; pendingWorkers: number;
}): number {
  if (!input.enabled) return Infinity;
  if (!Number.isFinite(input.availableMiB) || !Number.isFinite(input.totalMiB) ||
      input.availableMiB < 0 || input.totalMiB <= 0 ||
      !Number.isSafeInteger(input.pendingWorkers) || input.pendingWorkers < 0) return 0;
  const reserve = Math.max(1536, Math.ceil(input.totalMiB * 0.20));
  const perWorker = 512;
  return Math.max(0, Math.floor((Math.min(input.availableMiB, input.totalMiB) - reserve) / perWorker) - input.pendingWorkers);
}

/** Host-local memory sample. Respect process/cgroup limits when Node exposes them.
 * Linux MemAvailable includes reclaimable cache; freemem is a conservative fallback.
 */
export function hostMemoryAdmissionSlots(enabled: boolean, pendingWorkers: number): number {
  if (!enabled) return Infinity;
  try {
    let total = totalmem(), available = freemem();
    if (process.platform === 'linux') {
      try {
        const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'));
        if (match) available = Number(match[1]) * 1024;
      } catch { /* retain conservative fallback */ }
    }
    const constrained = typeof process.constrainedMemory === 'function' ? process.constrainedMemory() : 0;
    if (constrained && constrained > 0) {
      total = Math.min(total, constrained);
      // An actual process limit without an available-memory reading is unknown.
      if (typeof process.availableMemory !== 'function') return 0;
      available = Math.min(available, process.availableMemory());
    }
    return memoryAdmissionSlots({ enabled, availableMiB: available / MiB,
      totalMiB: total / MiB, pendingWorkers });
  } catch { return 0; }
}

/** Conservative local CPU admission estimate. Load is expressed in busy-core equivalents.
 * A missing sample is not proof of capacity. This is not a CPU quota for running agents.
 */
export function cpuAdmissionSlots(input: {
  enabled: boolean; parallelism: number; load: number; pendingWorkers: number;
}): number {
  if (!input.enabled) return Infinity;
  if (!Number.isSafeInteger(input.parallelism) || input.parallelism < 1 ||
      !Number.isFinite(input.load) || input.load < 0 ||
      !Number.isSafeInteger(input.pendingWorkers) || input.pendingWorkers < 0) return 0;
  return Math.max(0, Math.floor((input.parallelism * 0.8 - input.load) / 0.5) - input.pendingWorkers);
}

type CpuTicks = { at: number; total: number; idle: number; cores: number };
let previousTicks: CpuTicks | undefined;
let lastCpuLoad: number | undefined;

/** Windows does not provide loadavg. Use deltas of OS CPU counters, never a blocking sleep.
 * On restricted hosts the system-wide load may overestimate our share: fail conservatively.
 */
export function cpuLoadFromTicks(before: CpuTicks, after: CpuTicks): number | undefined {
  const elapsed = after.at - before.at;
  const total = after.total - before.total;
  const idle = after.idle - before.idle;
  if (elapsed < 1000 || elapsed > 30000 || before.cores !== after.cores ||
      !Number.isFinite(total) || !Number.isFinite(idle) ||
      total <= 0 || idle < 0 || idle > total) return undefined;
  return (1 - idle / total) * after.cores;
}

export function hostCpuAdmissionSlots(enabled: boolean, pendingWorkers: number): number {
  if (!enabled) return Infinity;
  try {
    const parallelism = availableParallelism();
    let load: number | undefined;
    if (process.platform !== 'win32') {
      // Includes runnable and, on Linux, uninterruptible work: intentionally conservative.
      load = loadavg()[0];
    } else {
      const counters = cpus();
      const now = { at: Date.now(), total: 0, idle: 0, cores: counters.length };
      for (const cpu of counters) {
        now.total += Object.values(cpu.times).reduce((sum, tick) => sum + tick, 0);
        now.idle += cpu.times.idle;
      }
      if (!previousTicks || now.at < previousTicks.at || now.at - previousTicks.at >= 1000) {
        lastCpuLoad = previousTicks ? cpuLoadFromTicks(previousTicks, now) : undefined;
        previousTicks = now;
      }
      load = lastCpuLoad;
    }
    return cpuAdmissionSlots({ enabled, parallelism, load: load ?? NaN, pendingWorkers });
  } catch { return 0; }
}
