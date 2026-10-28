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

Start the backend first (see "Run the dashboard" below), then from `mobile/`:

```bash
npm install
npx expo start
```

The app finds the backend automatically: it uses the computer running `expo start`, so a phone must be on the same Wi-Fi, and the computer's firewall must allow port 4000. To point the app somewhere else (for example a deployed server), set `EXPO_PUBLIC_API_URL` before starting, such as `EXPO_PUBLIC_API_URL=https://your-server npx expo start`. If an upload fails, the message under "Saved records" shows the address the app tried.

## Run backend tests

```bash
cd backend
npm install
npm test
```

## Run the dashboard

The backend needs PostgreSQL with the PostGIS extension available. From `backend/`:

```bash
cp .env.example .env   # then set DATABASE_URL
npm install
npm run migrate        # creates the schema and seeds the demo users
npm start              # listens on PORT from .env (default 4000)
```

Then open `http://localhost:4000/dashboard/`.

Record, sync-status, alert and dashboard reads require the `x-user-id` and `x-role` headers; results are limited to the user's assigned state unless the role is UNIOSUN.

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
