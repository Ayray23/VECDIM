# VECDIM

Offline-first entomological field surveillance prototype for the VECDIM technical assessment.

## Project structure

- `mobile/` — React Native field application
- `backend/` — Node.js/Express API with PostgreSQL/PostGIS integration
- `dashboard/` — live role-based decision-support dashboard
- `packages/` — shared validation and domain logic
- `docs/` — development, audit, dashboard, and AI-usage documentation

## Current status

Stages 1–4 provide the mobile foundation, validation, safe synchronization, and PostGIS-backed backend. Stage 5 adds the live dashboard and role-scoped dashboard API.

## Run the mobile app

From `mobile/`:

```bash
npm install
npx expo start
```

## Run backend tests

```bash
cd backend
npm install
npm test
```

## Run the dashboard

Start the backend and open `http://localhost:3000/dashboard/`.

The dashboard reads live API data. Select the appropriate demo user identifier from the candidate pack and the matching role. The API, not the browser, enforces role and state scope.

## Candidate-pack parity

The synthetic candidate pack is intentionally **not stored in this repository**. Run the parity script against your local copy:

```bash
node scripts/parity-test.mjs /path/to/VECDIM_Candidate_Pack
```

## AI usage

AI coding assistance was used during development and is documented in `docs/AI_USAGE.md`. The developer reviews and tests submitted code and remains responsible for explaining the implementation.

## Stage sign-off

A stage is merged only after its automated tests and required runtime checks have been completed. The supplied synthetic data and candidate-pack outputs remain local and are never committed to the repository.
