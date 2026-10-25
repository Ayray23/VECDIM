# Validation parity result

## Status

**Implementation: complete for the documented validation rules.**

**Official 1,525-row parity comparison: pending / unavailable.**

The candidate-pack specification requires comparison against `outputs/validation_flags_all.csv`. That expected-output file is not available in the working candidate pack, so no official PASS/FAIL claim is made here.

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

If the official expected CSV is later provided, run:

```bash
node scripts/parity-test.mjs /path/to/VECDIM_Candidate_Pack
```

The parity script requires exactly the supplied 1,525-row dataset and expected output and compares all 11 R-output rule columns. The synthetic dataset and expected output are not copied into this repository.

## Important

This document deliberately does **not** label the unavailable official parity comparison as PASS. The absence of the expected output is an assessment-pack limitation, not evidence that the validator differs from the R pipeline.
