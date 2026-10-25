# VECDIM

Offline-first entomological field surveillance prototype for the VECDIM technical assessment.

## Project structure

- `mobile/` — React Native field application
- `backend/` — backend API (added in a later stage)
- `dashboard/` — web dashboard (added in a later stage)
- `packages/` — shared validation and domain logic
- `docs/` — development, audit, and AI-usage documentation

## Development status

Stage 1 — Mobile foundation implementation is complete pending final Android runtime/device sign-off.

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

Stage 1 does not include backend submission, server validation, synchronization, PostGIS, alerts or the dashboard. Those are later stages.

## Run the mobile app

From `mobile/`:

```bash
npm install
npx expo start
```

For Android, use Expo Go on a physical device or an Android emulator.

## Stage sign-off rule

The stage is not merged into `main` until the Android runtime checklist in `docs/AUDIT_TRAIL.md` has been executed successfully. The required assessment check is to create three records offline, close/reopen the app, verify all three remain, recover a half-filled draft after restart, and verify the GPS accuracy and LGA warning/block behaviours.
