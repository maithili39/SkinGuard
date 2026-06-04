'use client';

import { Scale, Lightbulb } from 'lucide-react';

export function KindBadge({ kind }: { kind: 'regulatory' | 'advice' }) {
  if (kind === 'regulatory') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50">
        <Scale size={9} />EU Law
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50">
      <Lightbulb size={9} />Expert
    </span>
  );
}
