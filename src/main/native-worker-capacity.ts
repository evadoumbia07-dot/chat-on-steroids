import { freemem, totalmem } from 'node:os';
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
