# VECDIM

Offline-first entomological field surveillance prototype for the VECDIM technical assessment.

## Project structure

- `mobile/` — React Native field application
- `backend/` — backend API (added in a later stage)
- `dashboard/` — web dashboard (added in a later stage)
- `packages/` — shared validation and domain logic
- `docs/` — development, audit, and AI-usage documentation

## Development status

**Stage 2 — Validation and parity is in progress.** Stage 1 mobile implementation is complete pending final Android runtime/device sign-off.

### Stage 1 includes

- Offline UUID v4 record creation
- State/LGA/Ward selection
- Native collection date picker
- Mosquito species and insecticide selection
- GPS capture, accuracy display and retry flow
- Nigeria/state boundary checks
- 25 km LGA reference-point warning
- WHO mortality calculation and classification
- Device-side block/warn checks required for field capture
- Automatic draft persistence and recovery
- Multiple saved offline records
- `pending_sync` local status for records awaiting the later sync stage

### Stage 2 includes

- Shared validation rule module based on the supplied R reference implementation
- Device/server rule separation
- WHO mortality edge-case tests
- GPS accuracy boundary tests
- LGA distance warning tests
- Duplicate, future-date and field-consistency tests
- Candidate-pack parity runner for all 1,525 rows and 11 R-output rules

Stage 2 is not signed off until the candidate-pack parity test has been run locally and the result recorded. The candidate pack's synthetic data and expected output are not copied into this repository.

## Run the mobile app

From `mobile/`:

```bash
npm install
npx expo start
```

For Android, use Expo Go on a physical device or an Android emulator.

## Run validation unit tests

```bash
node packages/validation/test-validation.mjs
```

## Run the full parity test

```bash
node scripts/parity-test.mjs /path/to/VECDIM_Candidate_Pack
```

The parity runner expects the original candidate pack locally because the synthetic data must not be shared or committed to this repository.

## Stage sign-off rule

A stage is not merged into `main` until its automated tests and required runtime checklist have been executed successfully. Stage 1's required assessment check is to create three records offline, close/reopen the app, verify all three remain, recover a half-filled draft after restart, and verify the GPS accuracy and LGA warning/block behaviours.
