# VECDIM project walkthrough

This repository is an offline-first field surveillance system for entomological data capture in Nigeria. In plain terms, the app lets a field worker record mosquito/IRS observations on a phone even when there is no internet, then later syncs the records to a Postgres database with validation and auditing.

The repository is split into four main layers:

- Mobile client: the field app used by data collectors
- Backend API: the database-backed service that validates and stores records
- Shared validation module: the rules used by both mobile and server logic
- Scripts and docs: parity testing, validation checks, and project notes

---

## 1) Repository-level files

### README.md
This is the main project overview. It explains that the project is a VECDIM prototype, describes the Stage 1 mobile implementation and Stage 2 backend/validation work, and gives instructions for running the mobile app and validation scripts.

### .gitignore
This repo ignores local dependencies and build artifacts, especially:
- mobile/.expo/
- mobile/dist/
- mobile/node_modules/
- backend/node_modules/

It keeps the repository clean and prevents generated files from being committed.

### .github/workflows/mobile-stage1.yml
This workflow is for CI/CD around the mobile stage. It likely verifies the Expo/mobile app builds or tests under automation.

### .github/workflows/validation-tests.yml
This workflow checks validation logic and parity-related tests. It is there to enforce that the shared rules and candidate-pack checks keep passing.

---

## 2) backend/

This is the server-side database layer. It handles persistence, validation, and sync operations.

### backend/package.json
This defines the backend Node project:
- TypeScript-like modern JS module mode (`"type": "module"`)
- Scripts: `dev`, `start`, `migrate`, and `test`
- Dependencies: Express, PostgreSQL driver, CORS, dotenv, Zod
- Runtime requirement: Node 20+

This tells us the backend is a lightweight Express API connected to PostgreSQL.

### backend/src/app.js
This creates the Express app and registers the API routes.

What it does:
- enables CORS
- parses JSON body data
- exposes `/health` for database health checks
- mounts `/api/records` routes
- mounts `/api/sync` routes

Essentially, this is the application entry point for the server.

### backend/src/db.js
This configures the PostgreSQL connection pool using `pg`.

It does two important things:
- creates a shared pool of database connections
- provides `checkDatabaseConnection()` to run `SELECT 1` and verify connectivity

This file is the database access foundation for everything else.

### backend/src/records.js
This is the main data-access layer for field records.

It contains:
- `fieldRecordSchema`: a Zod schema for validating a single field record
- `createFieldRecord(query, record)`: inserts a new record or returns an existing one if the UUID is already present
- `getFieldRecord(query, id)`: fetches one record by ID
- `listFieldRecords(query, { limit, offset })`: paginated read access

This file is the database contract for record creation and retrieval. It also uses PostGIS geometry in the SQL insert to store the location as a geography point.

### backend/src/records-routes.js
This is the HTTP router for record CRUD endpoints.

Routes:
- `POST /api/records`: validates input, then inserts a record
- `GET /api/records/:id`: fetches one record
- `GET /api/records`: lists records with pagination

It returns structured validation errors and clean API responses.

### backend/src/sync.js
This is the logic for syncing offline mobile records to the server.

It does the following:
- validates a whole batch of records
- logs each batch to `sync_batches`
- inserts or updates each record in the database
- keeps track of accepted, rejected, and already-existing records
- returns a summary like `accepted`, `rejected`, `outcome`, and `results`

This is the server-side sync engine for the offline-first workflow.

8114193112311
git commit -m "Fix parity test crash: pass row index to validateRow"
### backend/src/sync-routes.js
This exposes the HTTP route for syncing:
- `POST /api/sync`

It passes the record array from the request body into `syncFieldRecords` and returns the batch result.

### backend/src/migrations.js
This is the core database migration runner.

It:
- reads SQL files in the `migrations/` directory
- sorts them by filename
- creates a `schema_migrations` table if missing
- applies only migrations not yet run
- uses an advisory lock to avoid concurrent migration races

This is the backbone that keeps the database schema reproducible.

### backend/src/migrate.js
This is the script entry for running migrations.

If run directly, it calls `runMigrations()` and prints which migrations were applied. It also shuts down the Postgres pool cleanly.

### backend/src/server.js
This file is the actual server launcher. It starts listening on a configured port and uses the app built by `createApp()`. It is the runtime start point in production/dev.

### backend/src/app.test.js
This is a test file for the app health handler.

It checks that:
- `/health` returns `200` when the DB is healthy
- `/health` returns `503` when the DB check throws an error

This validates the health endpoint contract.

### backend/src/records-routes.test.js
This tests the records API endpoints.

It verifies that:
- invalid records are rejected with `400`
- new records are created with `201`
- duplicate UUIDs are handled idempotently
- single record reads work
- 404 is returned for missing data
- pagination works correctly

### backend/src/records.test.js
This tests the lower-level record logic, not just the HTTP layer.

It covers:
- schema validation rules
- insert behavior and idempotency
- retrieving records
- listing with pagination

### backend/src/sync.test.js
This tests the sync logic in detail.

It covers:
- batch acceptance rules
- invalid batch rejection
- already-existing record handling
- partial batch outcomes
- logging behavior for sync batches and batch records
- validation errors thrown by the sync endpoint

---

## 3) backend/migrations/

These are SQL schema files that define the database structure.

### backend/migrations/001_enable_postgis.sql
This enables PostGIS extension support. PostGIS is required because the app stores geographic locations in a geospatial format and enforces distance checks using geography data.

### backend/migrations/002_create_field_records.sql
This creates the `field_records` table.

Important columns:
- `id`: unique record UUID
- `state`, `lga`, `ward`: geographic metadata
- `collection_date`, `species`, `insecticide`: observation metadata
- `exposed_count`, `dead_count`, `mortality_pct`: entomological outcome data
- `gps_latitude`, `gps_longitude`, `gps_accuracy_m`: GPS capture details
- `location`: geography point using PostGIS
- `larval_density`, `urban_rural`, `irs`, `itn_use_pct`: environmental and intervention data
- `sync_status`, `rejection_reason`: sync state tracking

It also creates indexes for geography, state/LGA/ward lookup, sync status, and date queries.

### backend/migrations/003_create_migration_log.sql
This creates `schema_migrations`, which records which SQL migration files have already been applied. This prevents the same migration from running more than once.

### backend/migrations/004_create_audit_and_alert_tables.sql
This creates the operational tables for auditing and alerting.

Tables include:
- `users`: role and organisation data for field/VECDIM/UNIOSUN actors
- `validation_results`: per-record rule outcomes (Block/Warn)
- `sync_batches`: sync batch summary records
- `sync_batch_records`: per-record results inside a batch
- `alerts`: higher-level alert state, risk, and escalation flags

This is the backend’s operational audit layer beyond the core field record table.

---

## 4) mobile/

This is the React Native / Expo field application. It is the user-facing app for collecting records on a mobile device while offline.

### mobile/package.json
This installs the mobile app dependencies:
- Expo
- React Native
- AsyncStorage
- DateTimePicker
- expo-location

It defines the app as an Expo project and provides scripts for starting the app on Android/iOS/web.

### mobile/app.json
This is the Expo app configuration.

It sets:
- app name and slug
- orientation and theme
- permission text for location access

This file is important because it tells the mobile runtime what the app is and what permissions it needs.

### mobile/App.js
This is the main mobile screen and the most important file in the project.

It contains the full field-data collection UI and behavior:
- record draft generation
- local persistence with AsyncStorage
- GPS capture with Expo Location
- validation of each field before save
- LGA/state checks and GPS distance warnings
- mortality calculation and WHO-style classification
- duplicate detection on device
- offline save flow with later sync status

This file is effectively the core of the field workflow.

The app uses a single screen with sections for:
1. Collection site
2. Specimen and assay
3. Site conditions
4. Saved offline records

It automatically saves drafts and stores records locally until a later sync stage uploads them.

---

## 5) packages/validation/

This folder contains the shared validation logic used to keep device rules and server rules aligned.

### packages/validation/package.json
A minimal package manifest for the validation module. It marks the module as an ES module package.

### packages/validation/index.js
This is the most important shared validation file.

It includes:
- `STATE_BOUNDS` and `LGA_REFERENCE` for valid Nigeria locations
- `RULE_IDS` and `DEVICE_RULE_IDS`
- `haversineKm()` for distance calculations
- `validateRecord(record, options = {})` for device and server validation
- `calculateMortality(exposed, dead)`
- `classifyMortality(mortalityPct)`

This is the common rules engine. It is designed to be used by both the mobile app and the backend, so rule logic stays consistent.

### packages/validation/test-validation.mjs
This is a Node-based validation self-check script. It runs sample records through the rule engine and asserts that:
- mortality calculations are correct
- classification thresholds behave as expected
- GPS zero/invalid/out-of-state conditions trigger correctly
- duplicate rules and future-date rules trigger
- server-only enrichment rules work

It acts as a validation sanity check for the shared logic.

---

## 6) scripts/

These are project tooling scripts for parity checking and large-scale validation comparisons.

### scripts/parity-test.mjs
This is one of the most important Stage 2 validation tools.

It expects a candidate-pack directory and then checks whether the custom validator matches a supplied R reference implementation.

It does the following:
- looks for candidate CSV input and expected output files
- verifies the data row count is 1525
- runs the supplied R script if the expected output is missing
- parses both CSVs
- compares each rule result across all rows
- fails if there are too many mismatches or if totals do not match the expected 222 flagged / 1,303 cleaned rows

This script is the main parity gate for the project.

### scripts/parity-utils.mjs
This contains general CSV parsing and parity comparison helpers.

It provides:
- `parseCsv()` to read CSV files safely with support for quoted values
- `compareParity()` to compare rule outputs row by row against a reference dataset

This file is a utility layer used by the parity test.

### scripts/validation-self-check.mjs
This is a smaller, focused validation sanity test separate from the candidate-pack parity run. It checks representative edge cases quickly.

---

## 7) docs/

These markdown files are the project’s design/traceability documents.

### docs/AI_USAGE.md
This documents how AI was used in the project and records the workflow for AI-assisted development.

### docs/AUDIT_TRAIL.md
This tracks project traceability and audit history, useful for verifying changes and governance around the implementation.

### docs/DEVELOPMENT_NOTES.md
This covers development decisions and Stage 1 mobile implementation details. It explains the architecture, offline behaviour, and the verification requirements for sign-off.

### docs/FIELD_RECORD_SCREEN_AUDIT.md
This is a record of the field record screen behavior and review notes, likely focused on the mobile form's current logic and validation decisions.

### docs/PARITY_RESULT.md
This stores parity-check results, likely documenting whether the validation logic matches the reference output.

### docs/STAGE_2_VALIDATION.md
This is the Stage 2 validation specification and notes, explaining the server-side rules, parity testing, and acceptance criteria.

### docs/test.md
This is a general scratch/test documentation file, and it is the file you are currently reading as a project explainer.

---

## 8) How the whole codebase fits together

At a high level, the project works like this:

1. The mobile app collects field data on-device.
2. It validates the record against device rules and persists it locally.
3. It stores the observed data offline with status `pending_sync`.
4. Later, the backend accepts a sync payload through `/api/sync`.
5. The backend validates each record and writes it to Postgres/PostGIS.
6. The validation logic package is shared so the mobile and server enforce the same rules.
7. Scripts compare the validator to the R reference model to ensure parity and correctness.

This is exactly what an offline-first field-surveillance system should look like: data capture offline first, validation centralized, and backend persistence later.

---

## 9) The big idea behind the repository

This repo is not just “app code”; it is a staged engineering project.

- Stage 1: build the Android/field app with offline capture and validation
- Stage 2: bring in backend persistence, sync, and candidate-pack parity checks
- The validation package acts as a shared specification layer between device and server
- The database and migration system turn the app into a real backend service rather than a local mock

If you read only one sentence from this whole repository, it is this:

VECDIM is a field-surveillance prototype that captures mosquito data offline on mobile devices, validates it with a shared rule system, stores it in PostGIS-backed PostgreSQL, and verifies correctness against a reference implementation through parity tests.

---

# Test execution log

## 2026-10-28 — Repository and validation checks

### Environment and repository state

- Repository: `Ayray23/VECDIM`
- Branch tested: `feature/server-validation-and-mobile-sync`
- HEAD at time of test: `0cd9e0c` — `fixed the safe area warning`
- Git status: PASS — working tree clean; branch was up to date with origin at the time of inspection.
- Backend runtime requirement in `backend/package.json`: Node.js `>=20`.
- No root-level `package.json` was present in the checked-out repository.

### Test case: backend automated test suite

**Command**
```powershell
cd C:\Users\Owner\VECDIM\backend
npm test
```

**Result: PASS**

- Tests: 63
- Passed: 63
- Failed: 0
- Cancelled: 0
- Skipped: 0
- Todo: 0
- Duration reported by Node: approximately 7.5 seconds.

**Coverage observed in the test output**
- Alert and dashboard role/state access restrictions.
- Missing or invalid identity headers and role mismatch handling.
- CSV field preservation and escaping.
- Health endpoint success and database failure behavior.
- Malformed JSON and oversized request handling.
- Database pool error handling when a connection is dropped.
- Migration ordering, applied-migration skipping, and rollback behavior.
- Shared mobile/server validation compatibility, including LGA payloads and mortality rounding.
- Record create/read/list behavior, pagination, state scoping, and idempotent retries.
- Sync batch limits, partial failures, rejected-record resubmission, and validation outcomes.
- Duplicate detection, future-date handling in the Lagos calendar, and persisted validation results.

**Non-failing warning observed**
Node emitted `[MODULE_TYPELESS_PACKAGE_JSON]` for `mobile/sync.js`: module syntax was detected, but the nearest `mobile/package.json` does not declare `"type": "module"`. The test suite still passed. This is recorded as a warning, not a test failure; no code was changed during this test.

### Test case: independent validation self-check

**Command**
```powershell
cd C:\Users\Owner\VECDIM
node .\scripts\validation-self-check.mjs
```

**Result: PASS**

Output: `VECDIM validation self-check: PASS`

Coverage reported: mortality boundaries, GPS accuracy boundaries, GPS/state/LGA checks, dead/exposed counts, future dates, duplicates, and server enrichment ranges.

### Test case: validation package unit tests

**Command**
```powershell
node .\packages\validation\test-validation.mjs
```

**Result: PASS**

Output: `validation unit tests: PASS`

### Test case: locate official parity pack

**Result: FOUND LOCALLY; OFFICIAL PARITY NOT YET RUN**

The local file search found:
- `C:\Users\Owner\Downloads\VECDIM_Candidate_Pack.zip` (81,198 bytes)
- Other ZIP candidates were also found, but have not been identified as the official assessment pack.

The candidate ZIP contents, required R runtime/dependencies, and official comparison results have not yet been verified. Do not mark official parity as PASS until `scripts/parity-test.mjs` completes successfully against the supplied candidate pack.

### Outstanding checks

1. Inspect the contents of `VECDIM_Candidate_Pack.zip` and confirm it contains the expected 1,525-row input and supplied R reference script.
2. Confirm the required R runtime and packages are available.
3. Run the official parity runner and record the actual flagged/cleaned totals and rule-by-rule differences. Expected acceptance totals documented in `docs/PARITY_RESULT.md`: 222 flagged and 1,303 cleaned.
4. Import and verify the supplied `cleaned_data.csv` and `alerts.csv` outputs in the intended test environment, including counts, alert tiers, duplicates, and dashboard totals.
5. Record the results of database/PostGIS migration checks, authorization checks, and the live offline/reconnect sync evidence.
6. Record the short demo once captured.

**Change control:** These checks were run for verification only. No application code was modified as part of the test run described above.
