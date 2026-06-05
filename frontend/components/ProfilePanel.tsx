'use client';

import React from 'react';
import type { SkinProfile } from '../types';

interface Props {
  profile: SkinProfile;
  onToggle: (key: keyof SkinProfile) => void;
}

const TOGGLES: {
  key: keyof SkinProfile;
  label: string;
  activeClass: string;
  glowClass: string;
  hoverClass: string;
}[] = [
  {
    key: 'acne_prone',
    label: 'Acne Prone',
    activeClass: 'bg-gradient-to-r from-primary-600 to-primary-500 dark:from-primary-750 dark:to-primary-650 border-primary-600 dark:border-primary-700 shadow-glow-green',
    glowClass: 'shadow-glow-green',
    hoverClass: 'hover:border-primary-300 dark:hover:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-950/20',
  },
  {
    key: 'sensitive_skin',
    label: 'Sensitive Skin',
    activeClass: 'bg-gradient-to-r from-amber-500 to-orange-400 dark:from-amber-600 dark:to-orange-500 border-amber-500 dark:border-amber-700 shadow-glow-amber',
    glowClass: 'shadow-glow-amber',
    hoverClass: 'hover:border-amber-300 dark:hover:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/20',
  },
  {
    key: 'pregnant',
    label: 'Pregnant',
    activeClass: 'bg-gradient-to-r from-rose-500 to-pink-500 dark:from-rose-600 dark:to-pink-600 border-rose-500 dark:border-rose-700 shadow-glow-rose',
    glowClass: 'shadow-glow-rose',
    hoverClass: 'hover:border-rose-300 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/20',
  },
  {
    key: 'fungal_acne',
    label: 'Fungal Acne',
    activeClass: 'bg-gradient-to-r from-purple-600 to-violet-500 dark:from-purple-650 dark:to-violet-600 border-purple-600 dark:border-purple-700 shadow-glow-violet',
    glowClass: 'shadow-glow-violet',
    hoverClass: 'hover:border-purple-300 dark:hover:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/20',
  },
  {
    key: 'rosacea',
    label: 'Rosacea',
    activeClass: 'bg-gradient-to-r from-pink-500 to-rose-400 dark:from-pink-600 dark:to-rose-500 border-pink-500 dark:border-pink-700 shadow-glow-rose',
    glowClass: 'shadow-glow-rose',
    hoverClass: 'hover:border-pink-300 dark:hover:border-pink-800 hover:bg-pink-50 dark:hover:bg-pink-950/20',
  },
  {
    key: 'normal_skin',
    label: 'Normal Skin',
    activeClass: 'bg-gradient-to-r from-emerald-600 to-green-500 dark:from-emerald-700 dark:to-green-600 border-emerald-600 dark:border-emerald-700 shadow-glow-green',
    glowClass: 'shadow-glow-green',
    hoverClass: 'hover:border-emerald-300 dark:hover:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/20',
  },
  {
    key: 'dry_skin',
    label: 'Dry Skin',
    activeClass: 'bg-gradient-to-r from-sky-500 to-sky-400 dark:from-sky-600 dark:to-sky-500 border-sky-500 dark:border-sky-700 shadow-glow-sky',
    glowClass: 'shadow-glow-sky',
    hoverClass: 'hover:border-sky-300 dark:hover:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/20',
  },
  {
    key: 'oily_skin',
    label: 'Oily Skin',
    activeClass: 'bg-gradient-to-r from-teal-500 to-teal-400 dark:from-teal-600 dark:to-teal-500 border-teal-500 dark:border-teal-700 shadow-glow-teal',
    glowClass: 'shadow-glow-teal',
    hoverClass: 'hover:border-teal-300 dark:hover:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/20',
  },
  {
    key: 'combination_skin',
    label: 'Combination Skin',
    activeClass: 'bg-gradient-to-r from-indigo-500 to-indigo-400 dark:from-indigo-650 dark:to-indigo-555 border-indigo-500 dark:border-indigo-700 shadow-glow-indigo',
    glowClass: 'shadow-glow-indigo',
    hoverClass: 'hover:border-indigo-300 dark:hover:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/20',
  },
];

export function ProfilePanel({ profile, onToggle }: Props) {
  return (
    <div className="w-full max-w-2xl mb-8 relative z-10">
      <p className="text-center text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
        My Skin Profile
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {TOGGLES.map(({ key, label, activeClass, hoverClass }) => (
          <label
            key={key}
            className={`cursor-pointer select-none flex items-center gap-2 px-5 py-2.5 rounded-full transition-all duration-200 border font-medium text-sm btn-lift ${
              profile[key]
                ? `${activeClass} text-white`
                : `bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 backdrop-blur-sm ${hoverClass}`
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
    </div>
  );
}
