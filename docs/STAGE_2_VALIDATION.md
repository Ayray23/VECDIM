# Stage 2 — Validation and parity

## Scope

This stage implements the validation rules that the VECDIM candidate pack identifies as device/server rules and records the WHO mortality edge cases.

The reference implementation is the supplied `R/helpers.R` function `validate_records()` and `docs/validation_rules.md` from the candidate pack. The synthetic candidate data and expected output are intentionally not copied into this repository.

## Implemented

- Nigeria bounding-box check
- 0,0 GPS check
- State bounding-box check
- 25 km LGA reference-point warning using haversine distance
- GPS accuracy: 10 m or better accepted; >10–50 m warning; >50 m or missing accuracy blocked
- Dead mosquitoes greater than exposed blocked
- Future collection date blocked
- Server-only positivity, temperature and rainfall checks
- Duplicate detection key matching the R specification
- Core-field checks for device records
- WHO mortality calculation rounded to one decimal place
- WHO classes: <90 Resistant, 90–<98 Possible resistance, >=98 Susceptible

## Automated tests

Run:

```bash
node packages/validation/test-validation.mjs
```

The test covers the GPS accuracy boundaries (10, 10.1, 50, 50.1), GPS boundary cases, LGA distance warning, dead/exposed consistency, future dates, duplicate detection and WHO classification edges.

## Full parity test

The candidate pack's `data/vecdim_dummy_entomology_data.csv` is required locally. The expected flags are generated from the supplied `R/01_validate_and_clean.R` when `outputs/validation_flags_all.csv` is absent, so R and the candidate pack's R dependencies must be installed. Candidate data and generated outputs are not committed.

Run:

```bash
node scripts/parity-test.mjs /path/to/VECDIM_Candidate_Pack
```

The script uses the fixed parity reference date `2026-10-08`, checks all 1,525 rows and all 11 R-output rules, aligns records by `record_id` when available, and reports up to 20 mismatch examples. It enforces the supplied aggregate totals of 222 flagged and 1,303 cleaned records, as well as a maximum of five differing rule cells.

## Sign-off condition

Stage 2 is not considered signed off until the local candidate-pack parity run has been executed and the result is recorded. Device GPS accuracy tests remain part of the physical mobile test plan.
