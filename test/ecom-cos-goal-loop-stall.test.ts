import { describe, it, expect } from 'vitest';
import { automaticLoopStalled, type LoopProgressRow } from '../src/main/goal-loop-stall.js';
const cases: Array<[string, LoopProgressRow[], boolean]> = [
  [
    "same three automatic final answers",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "3",
        "text": "Still blocked."
      }
    ],
    true
  ],
  [
    "different results",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "3",
        "text": "Completed"
      }
    ],
    false
  ],
  [
    "manual steering resets history",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": false,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "3",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "4",
        "text": "Still blocked."
      }
    ],
    false
  ],
  [
    "unproven automatic identity",
    [
      {
        "role": "user",
        "automatic": false,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "3",
        "text": "Still blocked."
      }
    ],
    false
  ],
  [
    "duplicate turn",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      }
    ],
    false
  ],
  [
    "incomplete final",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": false,
        "turnId": "3",
        "text": "Still blocked."
      }
    ],
    false
  ],
  [
    "commentary does not count",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "text": "Still blocked."
      }
    ],
    false
  ],
  [
    "ambiguous multiple final rows",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "3",
        "text": "Still blocked."
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "4",
        "text": "Still blocked."
      }
    ],
    false
  ],
  [
    "human input awaiting answer",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "3",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": false,
        "text": "Continue"
      }
    ],
    false
  ],
  [
    "new automatic turn not yet answered",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "3",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      }
    ],
    false
  ],
  [
    "commentary between real finals",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "text": "checking"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "3",
        "text": "Still blocked."
      }
    ],
    true
  ],
  [
    "only two rounds",
    [
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "1",
        "text": "Still blocked."
      },
      {
        "role": "user",
        "automatic": true,
        "text": "Continue"
      },
      {
        "role": "assistant",
        "final": true,
        "complete": true,
        "turnId": "2",
        "text": "Still blocked."
      }
    ],
    false
  ]
];
describe('ECOM OS Loop stall guard', () => {
  for (const [name,rows,expected] of cases) it(name, () => expect(automaticLoopStalled(rows)).toBe(expected));
});
