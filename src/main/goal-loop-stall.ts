/** Detect a repeated, fully recorded automatic Loop outcome; never a completion proof. */
export interface LoopProgressRow {
  role: 'user' | 'assistant';
  text: string;
  automatic?: boolean;
  final?: boolean;
  complete?: boolean;
  turnId?: string;
}

export const automaticLoopStalled: (rows: readonly LoopProgressRow[]) => boolean = function automaticLoopStalled(rows) {
  const rounds = [];
  let active = null;
  for (const row of rows) {
    if (row.role === 'user') {
      if (active) rounds.push(active);
      active = null;
      if (row.automatic !== true) { rounds.length = 0; continue; }
      active = { turnId: '', answer: '', valid: true };
      continue;
    }
    if (!active || row.final !== true) continue;
    if (!row.complete || !row.turnId || !row.text.trim() || active.turnId) {
      active.valid = false;
      continue;
    }
    active.turnId = row.turnId;
    active.answer = row.text.trim();
  }
  if (active) rounds.push(active);
  const recent = rounds.slice(-3);
  return recent.length === 3 && recent.every(r => r.valid && r.turnId && r.answer) &&
    new Set(recent.map(r => r.turnId)).size === 3 &&
    recent.every(r => r.answer === recent[0].answer);
};
