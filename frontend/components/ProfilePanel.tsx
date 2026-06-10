'use client';

import React from 'react';
import type { SkinProfile } from '../types';

interface Props {
  profile: SkinProfile;
  onToggle: (key: keyof SkinProfile | 'clear_concerns') => void;
}

const SKIN_TYPES: { key: keyof SkinProfile; label: string; activeClass: string }[] = [
  { key: 'normal_skin', label: 'Normal Skin', activeClass: 'active-normal' },
  { key: 'dry_skin', label: 'Dry Skin', activeClass: 'active-dry' },
  { key: 'oily_skin', label: 'Oily Skin', activeClass: 'active-oily' },
  { key: 'combination_skin', label: 'Combination', activeClass: 'active-combo' },
];

const SKIN_CONCERNS: { key: keyof SkinProfile; label: string; activeClass: string }[] = [
  { key: 'acne_prone', label: 'Acne Prone', activeClass: 'active-acne' },
  { key: 'sensitive_skin', label: 'Sensitive Skin', activeClass: 'active-sensitive' },
  { key: 'pregnant', label: 'Pregnant / Nursing', activeClass: 'active-pregnant' },
  { key: 'fungal_acne', label: 'Fungal Acne', activeClass: 'active-fungal' },
  { key: 'rosacea', label: 'Rosacea', activeClass: 'active-rosacea' },
];

export function ProfilePanel({ profile, onToggle }: Props) {
  const hasNoConcerns = !profile.acne_prone && !profile.sensitive_skin && !profile.pregnant && !profile.fungal_acne && !profile.rosacea;

  const renderPill = ({ key, label, activeClass }: { key: keyof SkinProfile; label: string; activeClass: string }) => (
    <label
      key={key}
      className={`profile-pill ${profile[key] ? activeClass : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <input
        type="checkbox"
        style={{ display: 'none' }}
        checked={profile[key]}
        onChange={() => onToggle(key)}
        id={`profile-${key}`}
      />
      {profile[key] && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', opacity: 0.7, flexShrink: 0 }} />
      )}
      {label}
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      {/* Skin Type Row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Skin Type (Choose One)
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {SKIN_TYPES.map(renderPill)}
        </div>
      </div>

      {/* Concerns Row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>
          Skin Concerns & Conditions (Select All That Apply)
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          <label
            className={`profile-pill ${hasNoConcerns ? 'active-normal' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <input
              type="checkbox"
              style={{ display: 'none' }}
              checked={hasNoConcerns}
              onChange={() => onToggle('clear_concerns')}
              id="profile-no-concerns"
            />
            {hasNoConcerns && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', opacity: 0.7, flexShrink: 0 }} />
            )}
            No Concerns
          </label>
          {SKIN_CONCERNS.map(renderPill)}
        </div>
      </div>
    </div>
  );
}
