"""One-time script: add regulatory_status column to ingredient_flags.csv."""
import csv

REGULATORY_UPDATES = {
    'Hydroquinone':               ('banned',     'EU Reg 1223/2009 Annex II entry 1339'),
    'Tretinoin':                  ('banned',     'EU Reg 1223/2009 Annex II entry 372 (retinoic acid)'),
    'Salicylic Acid':             ('restricted', 'EU Reg 1223/2009 Annex III entry 98 (max 0.5-2%)'),
    'Formaldehyde':               ('restricted', 'EU Reg 1223/2009 Annex III entry 5 (max 0.2% as HCHO)'),
    'DMDM Hydantoin':             ('restricted', 'EU Reg 1223/2009 Annex III (formaldehyde releaser; max 0.2% as HCHO)'),
    'Methylisothiazolinone':      ('restricted', 'EU Reg 1223/2009 Annex III entry 57 (rinse-off only, 0.0015%)'),
    'Methylchloroisothiazolinone':('restricted', 'EU Reg 1223/2009 Annex III entry 39 (rinse-off only, 0.0015%)'),
    'Quaternium-15':              ('restricted', 'EU Reg 1223/2009 Annex III (formaldehyde releaser; max 0.2% as HCHO)'),
    'Diazolidinyl Urea':          ('restricted', 'EU Reg 1223/2009 Annex III (formaldehyde releaser; max 0.5%)'),
    'Imidazolidinyl Urea':        ('restricted', 'EU Reg 1223/2009 Annex III (formaldehyde releaser; max 0.6%)'),
    'Oxybenzone':                 ('restricted', 'EU Reg 1223/2009 Annex VI entry 4 (max 6% body/face, 0.5% oral)'),
    'Homosalate':                 ('restricted', 'EU Reg 1223/2009 Annex VI entry 3 (max 7.34%)'),
    'Octocrylene':                ('restricted', 'EU Reg 1223/2009 Annex VI entry 10 (max 9%)'),
    'Avobenzone':                 ('restricted', 'EU Reg 1223/2009 Annex VI entry 22 (max 3%)'),
    'Octinoxate':                 ('restricted', 'EU Reg 1223/2009 Annex VI entry 13 (max 7.5%)'),
    'Kojic Acid':                 ('restricted', 'EU Reg 1223/2009 Annex III entry 243 (max 1% face, 0.5% hands)'),
    'Zinc Oxide':                 ('restricted', 'EU Reg 1223/2009 Annex VI entry 30 (sunscreen; max 25%)'),
    'Benzyl Alcohol':             ('restricted', 'EU Reg 1223/2009 Annex III entry 45 (max 1% as preservative)'),
    'Resorcinol':                 ('restricted', 'EU Reg 1223/2009 Annex III entry 35 (hair colorants; max 0.5% other)'),
    'Salicylic Acid Acetate':     ('restricted', 'EU Reg 1223/2009 Annex III (salicylate derivative; same limits apply)'),
}

NEW_ROWS = [
    {
        'inci_name': 'Triclosan',
        'aliases': 'Trichloro-2-hydroxydiphenyl Ether',
        'function': 'preservative',
        'comedogenic': '',
        'fungal_acne_safe': '',
        'pregnancy_safe': 'caution',
        'irritant': 'no',
        'notes': 'Antimicrobial restricted in EU to specific product types (toothpaste, hand soap, deodorant, foot care; max 0.3%). Endocrine disruption concerns.',
        'source': 'EU Reg 1223/2009 Annex III entry 40',
        'regulatory_status': 'restricted',
    },
    {
        'inci_name': 'Resorcinol',
        'aliases': 'm-Dihydroxybenzene|Resorcin',
        'function': 'hair colorant',
        'comedogenic': '',
        'fungal_acne_safe': '',
        'pregnancy_safe': 'caution',
        'irritant': 'yes',
        'notes': 'Phenolic compound used in hair dyes. EU restricted: max 0.5% non-oxidative hair colorants, max 1.25% oxidative preparations.',
        'source': 'EU Reg 1223/2009 Annex III entry 35',
        'regulatory_status': 'restricted',
    },
    {
        'inci_name': 'Hydrogen Peroxide',
        'aliases': 'H2O2',
        'function': 'oxidising agent',
        'comedogenic': '',
        'fungal_acne_safe': '',
        'pregnancy_safe': 'caution',
        'irritant': 'yes',
        'notes': 'Oxidising bleaching agent. EU restricted with concentration limits by product type (max 4% hair bleach, 0.1% general cosmetics). Avoid eye area.',
        'source': 'EU Reg 1223/2009 Annex III entry 8',
        'regulatory_status': 'restricted',
    },
    {
        'inci_name': 'Hexachlorophene',
        'aliases': '',
        'function': 'antimicrobial',
        'comedogenic': '',
        'fungal_acne_safe': '',
        'pregnancy_safe': 'no',
        'irritant': 'yes',
        'notes': 'Chlorinated bisphenol antimicrobial. Banned in EU cosmetics due to neurotoxicity and teratogenicity.',
        'source': 'EU Reg 1223/2009 Annex II entry 419',
        'regulatory_status': 'banned',
    },
    {
        'inci_name': 'Bithionol',
        'aliases': '',
        'function': 'antimicrobial',
        'comedogenic': '',
        'fungal_acne_safe': '',
        'pregnancy_safe': 'no',
        'irritant': 'yes',
        'notes': 'Chlorinated antimicrobial. Banned in EU cosmetics due to photosensitisation risk.',
        'source': 'EU Reg 1223/2009 Annex II entry 93',
        'regulatory_status': 'banned',
    },
    {
        'inci_name': 'Zinc Pyrithione',
        'aliases': 'Pyrithione Zinc|ZPT',
        'function': 'antimicrobial',
        'comedogenic': '',
        'fungal_acne_safe': '',
        'pregnancy_safe': 'caution',
        'irritant': 'no',
        'notes': 'Anti-dandruff agent. EU restricted to rinse-off hair products only at max 1%; banned in leave-on products since 2022.',
        'source': 'EU Reg 1223/2009 Annex III entry 101',
        'regulatory_status': 'restricted',
    },
    {
        'inci_name': 'Piroctone Olamine',
        'aliases': 'Octopirox',
        'function': 'antimicrobial',
        'comedogenic': '',
        'fungal_acne_safe': '',
        'pregnancy_safe': 'caution',
        'irritant': 'no',
        'notes': 'Anti-dandruff agent. EU restricted to rinse-off hair products at max 1%, face products at max 0.5%.',
        'source': 'EU Reg 1223/2009 Annex III entry 92',
        'regulatory_status': 'restricted',
    },
    {
        'inci_name': 'Chlorhexidine Digluconate',
        'aliases': 'Chlorhexidine|CHG',
        'function': 'antimicrobial',
        'comedogenic': '',
        'fungal_acne_safe': '',
        'pregnancy_safe': 'caution',
        'irritant': 'yes',
        'notes': 'Broad-spectrum antimicrobial. EU restricted: max 0.1% general use, 0.5% oral hygiene. Avoid eye contact; anaphylaxis risk reported.',
        'source': 'EU Reg 1223/2009 Annex III entry 43',
        'regulatory_status': 'restricted',
    },
]

CSV_PATH = 'data/curated/ingredient_flags.csv'
FIELDNAMES = [
    'inci_name', 'aliases', 'function', 'comedogenic',
    'fungal_acne_safe', 'pregnancy_safe', 'irritant',
    'notes', 'source', 'regulatory_status',
]

with open(CSV_PATH, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows_raw = list(reader)

clean_rows = []
for r in rows_raw:
    # Rebuild row with only the canonical fieldnames (drops stray None key)
    clean = {k: (r.get(k) or '') for k in FIELDNAMES[:-1]}
    # Row 70 (Sodium Hydroxide) has a trailing extra column stored under None
    if None in r and r[None]:
        extra_vals = r[None] if isinstance(r[None], list) else [r[None]]
        extra = ', '.join(str(x).strip() for x in extra_vals if str(x).strip())
        if extra:
            clean['source'] = (clean['source'].strip() + '; ' + extra).strip('; ')
    name = clean['inci_name']
    if name in REGULATORY_UPDATES:
        status, src = REGULATORY_UPDATES[name]
        clean['regulatory_status'] = status
        clean['source'] = src
    else:
        clean['regulatory_status'] = ''
    clean_rows.append(clean)

clean_rows.extend(NEW_ROWS)

with open(CSV_PATH, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
    writer.writeheader()
    writer.writerows(clean_rows)

updated = sum(1 for r in clean_rows if r['regulatory_status'] in ('banned', 'restricted'))
print(f'Updated {sum(1 for r in clean_rows if r.get("regulatory_status"))} rows with regulatory_status.')
print(f'Added {len(NEW_ROWS)} new rows. Total: {len(clean_rows)} rows.')
print(f'Banned: {sum(1 for r in clean_rows if r["regulatory_status"] == "banned")}')
print(f'Restricted: {sum(1 for r in clean_rows if r["regulatory_status"] == "restricted")}')
