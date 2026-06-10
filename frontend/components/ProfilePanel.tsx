'use client';
 
import React from 'react';
import type { SkinProfile } from '../types';
 
interface Props {
  profile: SkinProfile;
  onToggle: (key: keyof SkinProfile) => void;
}
 
const SKIN_TYPES: {
  key: keyof SkinProfile;
  label: string;
  tooltip: string;
  activeClass: string;
}[] = [
  { key: 'normal_skin', label: 'Normal Skin', tooltip: 'Standard analysis without additional sensitivity filters.', activeClass: 'active-normal' },
  { key: 'dry_skin', label: 'Dry Skin', tooltip: 'Flags drying ingredients like denatured alcohols that strip moisture.', activeClass: 'active-dry' },
  { key: 'oily_skin', label: 'Oily Skin', tooltip: 'Flags highly comedogenic ingredients that worsen sebum buildup.', activeClass: 'active-oily' },
  { key: 'combination_skin', label: 'Combination', tooltip: 'Flags comedogenic ingredients that clog pores in the T-zone.', activeClass: 'active-combo' },
];
 
const SKIN_CONCERNS: {
  key: keyof SkinProfile;
  label: string;
  tooltip: string;
  activeClass: string;
}[] = [
  { key: 'acne_prone', label: 'Acne Prone', tooltip: 'Flags comedogenic (pore-clogging) ingredients as high risk.', activeClass: 'active-acne' },
  { key: 'sensitive_skin', label: 'Sensitive Skin', tooltip: 'Flags common allergens and known skin irritants.', activeClass: 'active-sensitive' },
  { key: 'pregnant', label: 'Pregnant / Nursing', tooltip: 'Checks ingredients contraindicated during pregnancy — retinoids, salicylates, and more.', activeClass: 'active-pregnant' },
  { key: 'fungal_acne', label: 'Fungal Acne', tooltip: 'Flags fatty acids, esters, and lipids that feed Malassezia yeast.', activeClass: 'active-fungal' },
  { key: 'rosacea', label: 'Rosacea', tooltip: 'Flags common rosacea triggers — drying alcohols, strong acids, fragrances.', activeClass: 'active-rosacea' },
];
 
export function ProfilePanel({ profile, onToggle }: Props) {
  const renderPill = ({ key, label, tooltip, activeClass }: {
    key: keyof SkinProfile;
    label: string;
    tooltip: string;
    activeClass: string;
  }) => (
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
      <div className="tooltip" style={{ opacity: 0, pointerEvents: 'none', transition: 'opacity 0.15s ease', position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', width: 220, zIndex: 10 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
      >
        {tooltip}
      </div>
    </div>
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
          {SKIN_CONCERNS.map(renderPill)}
        </div>
      </div>
 
      <style jsx>{`
        .group:hover .tooltip {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
        .tooltip {
          background: #1e293b;
          color: #ffffff;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11px;
          line-height: 1.4;
          text-align: center;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.08);
          pointer-events: none;
          white-space: normal;
        }
        .tooltip::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-width: 5px;
          border-style: solid;
          border-color: #1e293b transparent transparent transparent;
        }
      `}</style>
    </div>
  );
}
