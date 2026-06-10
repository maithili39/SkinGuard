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
  tooltip: string;
  activeClass: string;
}[] = [
  { key: 'acne_prone', label: 'Acne Prone', tooltip: 'Flags comedogenic (pore-clogging) ingredients as high risk.', activeClass: 'active-acne' },
  { key: 'sensitive_skin', label: 'Sensitive Skin', tooltip: 'Flags common allergens and known skin irritants.', activeClass: 'active-sensitive' },
  { key: 'pregnant', label: 'Pregnant', tooltip: 'Checks ingredients contraindicated during pregnancy — retinoids, salicylates, and more.', activeClass: 'active-pregnant' },
  { key: 'fungal_acne', label: 'Fungal Acne', tooltip: 'Flags fatty acids, esters, and lipids that feed Malassezia yeast.', activeClass: 'active-fungal' },
  { key: 'rosacea', label: 'Rosacea', tooltip: 'Flags common rosacea triggers — drying alcohols, strong acids, fragrances.', activeClass: 'active-rosacea' },
  { key: 'normal_skin', label: 'Normal Skin', tooltip: 'Standard analysis without additional sensitivity filters.', activeClass: 'active-normal' },
  { key: 'dry_skin', label: 'Dry Skin', tooltip: 'Flags drying ingredients like denatured alcohols that strip moisture.', activeClass: 'active-dry' },
  { key: 'oily_skin', label: 'Oily Skin', tooltip: 'Flags highly comedogenic ingredients that worsen sebum buildup.', activeClass: 'active-oily' },
  { key: 'combination_skin', label: 'Combination', tooltip: 'Flags comedogenic ingredients that clog pores in the T-zone.', activeClass: 'active-combo' },
];

export function ProfilePanel({ profile, onToggle }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
      {TOGGLES.map(({ key, label, tooltip, activeClass }) => (
        <div key={key} style={{ position: 'relative' }} className="group">
          <label
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
          {/* Tooltip */}
          <div className="tooltip" style={{ opacity: 0, pointerEvents: 'none', transition: 'opacity 0.15s ease', position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', width: 200 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            {tooltip}
          </div>
        </div>
      ))}

      <style jsx>{`
        .group:hover .tooltip {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
      `}</style>
    </div>
  );
}
