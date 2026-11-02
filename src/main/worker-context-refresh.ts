/**
 * Read-only session metadata for sleeping CoS sub-agents.
 *
 * The native broker still owns admission, context limits and persistence.
 * Only four metadata reads are outstanding at once, regardless of the number
 * of sleeping workers. Results are returned in their original broker order;
 * callers update broker state and cross the usual durability barrier AFTER
 * every read has settled.
 */
export async function readSleepingWorkerContexts<T>(
  conversationIds: readonly string[],
  read: (conversationId: string) => Promise<T | null>
): Promise<Array<T | null>> {
  if (!conversationIds.length) return [];
  const result: Array<T | null> = Array(conversationIds.length).fill(null);
  let next = 0;
  const readers = Math.min(4, conversationIds.length);
  await Promise.all(Array.from({ length: readers }, async () => {
    while (next < conversationIds.length) {
      const index = next++;
      try {
        result[index] = await read(conversationIds[index]!);
      } catch {
        // Keep the current fail-closed behavior: an unreadable session never
        // supplies a fabricated context measurement or a revival permit.
        result[index] = null;
      }
    }
  }));
  return result;
}
