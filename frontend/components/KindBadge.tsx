'use client';

import { Scale, Lightbulb } from 'lucide-react';

export function KindBadge({ kind }: { kind: 'regulatory' | 'advice' }) {
  if (kind === 'regulatory') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
        <Scale size={9} />EU Regulation
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
      <Lightbulb size={9} />Expert Guidance
    </span>
  );
}
