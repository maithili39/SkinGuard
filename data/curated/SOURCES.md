# Curated flag provenance

The `source` column in `ingredient_flags.csv` is a **curated synthesis**, not a
single authoritative dataset. Comedogenic / fungal-acne / pregnancy ratings are
inherently *guidance* — they vary between references and individuals. This file
documents what each `source` label maps to.

> ⚠️ This data is for education, not medical advice. Reactions are individual.

| `source` label | What it refers to |
|---|---|
| `Fulton 1989 / compiled comedogenicity data` | Fulton JE Jr., *Comedogenicity and irritancy of commonly used ingredients in skin care products*, J. Soc. Cosmet. Chem. (1989) — the foundational comedogenicity rabbit-ear study, plus later compiled 0–5 rating tables widely used in cosmetic chemistry. Ratings are indicative; concentration and formulation change real-world behaviour. |
| `Simple Skincare Science fungal-acne-safe list` | The widely-referenced Malassezia (fungal acne) safe/unsafe ingredient compilation (fatty acids C11–C24, esters, polysorbates flagged as potential triggers). Community-maintained, not clinical. |
| `EU Reg 1223/2009 Annex III` | EU Cosmetics Regulation No 1223/2009, Annex III — restricted substances, including the 26 declarable fragrance allergens. **Authoritative / legal.** |
| `EU CosIng Annex V` | Permitted preservatives + their concentration limits. **Authoritative / legal.** |
| `EU CosIng Annex VI` | Permitted UV filters + limits. **Authoritative / legal.** |
| `EU CosIng` | General identity/function from the EU CosIng database. **Authoritative.** |
| `dermatology consensus` | Broadly accepted dermatological guidance (e.g. niacinamide tolerability, SLS drying). Synthesised, not a single citation. |
| `medical guidance` / `teratogenicity guidance` | Pregnancy contraindications for retinoids, hydroquinone, etc., per standard obstetric/dermatology references. Always defer to a doctor. |
| `emerging dermatology data` | Newer evidence (e.g. bakuchiol as a retinol alternative) — promising but less established. |
| `common knowledge` | Uncontroversial basics (water as solvent, xanthan gum as thickener). |

## Roadmap to production-grade sourcing
For a real medical-adjacent product, each *row* should carry a specific citation
(DOI / regulation article), and ratings should be reviewed by a qualified
professional. The categories above are the honest current state.
