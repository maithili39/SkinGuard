'use client';

import React from 'react';
import type { SkinProfile } from '../types';

interface Props {
  profile: SkinProfile;
  onToggle: (key: keyof SkinProfile) => void;
}

const TOGGLES: [keyof SkinProfile, string, string, string][] = [
  ['acne_prone', 'Acne Prone', 'bg-primary-600 border-primary-600', 'hover:border-primary-300'],
  ['sensitive_skin', 'Sensitive Skin', 'bg-amber-500 border-amber-500', 'hover:border-amber-300'],
  ['pregnant', 'Pregnant', 'bg-rose-500 border-rose-500', 'hover:border-rose-300'],
  ['fungal_acne', 'Fungal Acne', 'bg-purple-600 border-purple-600', 'hover:border-purple-300'],
];

export function ProfilePanel({ profile, onToggle }: Props) {
  return (
    <div className="w-full max-w-2xl mb-8 flex flex-wrap justify-center gap-4 relative z-10">
      {TOGGLES.map(([key, label, activeClass, hoverClass]) => (
        <label
          key={key}
          className={`cursor-pointer flex items-center gap-2 px-5 py-2.5 rounded-full transition-all border ${
            profile[key]
              ? `${activeClass} text-white shadow-md`
              : `bg-white/80 text-slate-700 border-slate-200 ${hoverClass} backdrop-blur-sm`
          }`}
        >
          <input
            type="checkbox"
            className="hidden"
            checked={profile[key]}
            onChange={() => onToggle(key)}
            id={`profile-${key}`}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
