# Validation parity result

## Status

**Implementation: complete for the documented validation rules.**

**Official 1,525-row parity comparison: pending / unavailable.**

The official comparison has not been run in this workspace because the candidate pack and R runtime are unavailable here. The ZIP's `outputs/` folder may be empty; the parity runner now executes the supplied `R/01_validate_and_clean.R` to generate `outputs/validation_flags_all.csv` when needed. The acceptance totals are 222 flagged / 1,303 cleaned records; the runner checks both R-reference and JavaScript totals.

## Evidence completed instead

The validation package contains automated boundary and rule tests covering:

- WHO mortality thresholds: 89.9, 90, 97.9 and 98 percent
- GPS accuracy: 10, 10.1, 50 and 50.1 metres
- GPS outside Nigeria
- 0,0 GPS
- state/GPS mismatch
- LGA distance warning
- dead mosquitoes greater than exposed
- future collection dates
- duplicate records
- server-side slide positivity range
- server-side temperature range
- server-side rainfall range

The independent self-check can be run with:

```bash
node scripts/validation-self-check.mjs
```

The unit suite can be run with:

```bash
node packages/validation/test-validation.mjs
```

With the candidate pack and its R dependencies installed locally, run:

```bash
node scripts/parity-test.mjs /path/to/VECDIM_Candidate_Pack
```

The runner requires the supplied 1,525-row dataset and R reference script, compares all 11 R-output rule columns, and aligns by `record_id` when the column exists in both CSVs. It allows at most five differing rule cells and reports up to 20 examples. The synthetic dataset and generated expected output are not copied into this repository.

## Important

This document deliberately does **not** label the unavailable official parity comparison as PASS. The absence of the expected output is an assessment-pack limitation, not evidence that the validator differs from the R pipeline.
