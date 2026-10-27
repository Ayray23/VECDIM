# Field Record Creation Screen Audit

## 2026-10-26 — Screen implementation review

### Scope
Reviewed the actual field-record workflow in `mobile/App.js` after the Stage 1 implementation and backend-stage refinements. This captures the present client behaviour and validation status.

### Current implementation
- The form uses controlled State → LGA → Ward selectors, a native date picker, species/insecticide catalogs, and a dedicated GPS capture action.
- Drafts are autosaved under `@vecdim/draft-v2` and saved offline records are kept under `@vecdim/records-v1`.
- The app validates core required fields, GPS presence and accuracy, LGA distance warnings, state mismatch, dead/exposed consistency, future dates, and duplicate record warnings.
- It calculates mortality live and classifies the result as Susceptible / Possible resistance / Resistant.
- Record IDs are generated using `expo-crypto` `randomUUID()` so the same UUID pattern can be used for later sync idempotency.

### Verification
- The app has been reviewed against the actual implementation, not against stale earlier assumptions.
- The required sign-off gate is: device/runtime confirmation that three offline records persist across restart, a partial draft resumes correctly, and the GPS accuracy/LGA warning/block behaviours match the field specification.
- This sign-off must be recorded before merge to `main`.

### Review notes
- This is no longer a single draft-only screen. The app stores multiple saved offline records that remain pending sync until backend sync is enabled.
- GPS capture logic is still a foreground capture flow; it should keep retrying for a better fix and avoid leaking watchers when the timer finishes.
- Required numeric values are validated as blank/empty and range-checked, not just keyboard-hinted.
- Save actions are local-only at this stage; they are not server submissions.
