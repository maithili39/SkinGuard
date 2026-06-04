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
  emoji: string;
  activeClass: string;
  glowClass: string;
  hoverClass: string;
}[] = [
  {
    key: 'acne_prone',
    label: 'Acne Prone',
    emoji: '🧴',
    activeClass: 'bg-gradient-to-r from-primary-600 to-primary-500 border-primary-600 shadow-glow-green',
    glowClass: 'shadow-glow-green',
    hoverClass: 'hover:border-primary-300 hover:bg-primary-50',
  },
  {
    key: 'sensitive_skin',
    label: 'Sensitive Skin',
    emoji: '🌿',
    activeClass: 'bg-gradient-to-r from-amber-500 to-orange-400 border-amber-500 shadow-glow-amber',
    glowClass: 'shadow-glow-amber',
    hoverClass: 'hover:border-amber-300 hover:bg-amber-50',
  },
  {
    key: 'pregnant',
    label: 'Pregnant',
    emoji: '🤰',
    activeClass: 'bg-gradient-to-r from-rose-500 to-pink-500 border-rose-500 shadow-glow-rose',
    glowClass: 'shadow-glow-rose',
    hoverClass: 'hover:border-rose-300 hover:bg-rose-50',
  },
  {
    key: 'fungal_acne',
    label: 'Fungal Acne',
    emoji: '🔬',
    activeClass: 'bg-gradient-to-r from-purple-600 to-violet-500 border-purple-600 shadow-glow-violet',
    glowClass: 'shadow-glow-violet',
    hoverClass: 'hover:border-purple-300 hover:bg-purple-50',
  },
  {
    key: 'rosacea',
    label: 'Rosacea',
    emoji: '🌸',
    activeClass: 'bg-gradient-to-r from-pink-500 to-rose-400 border-pink-500 shadow-glow-rose',
    glowClass: 'shadow-glow-rose',
    hoverClass: 'hover:border-pink-300 hover:bg-pink-50',
  },
];

export function ProfilePanel({ profile, onToggle }: Props) {
  return (
    <div className="w-full max-w-2xl mb-8 relative z-10">
      <p className="text-center text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
        My Skin Profile
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {TOGGLES.map(({ key, label, emoji, activeClass, hoverClass }) => (
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
            <span className="text-base leading-none">{emoji}</span>
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
