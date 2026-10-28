# VECDIM

Offline-first entomological field-surveillance prototype for the VECDIM technical assessment.

## Repository layout

- `mobile/` — React Native / Expo field app, offline records and drafts, GPS capture, local validation and sync client.
- `backend/` — Node.js / Express API, PostgreSQL/PostGIS migrations, server-side validation, sync and role-scoped reads.
- `dashboard/` — role-based decision-support dashboard served by the backend.
- `packages/validation/` — shared field validation rules.
- `scripts/` — validation and candidate-pack parity utilities.
- `docs/` — setup, integration, parity status and AI-use notes.

## Run locally

The current setup starts the backend and mobile app in separate terminals; a single-command Docker Compose startup is not included.

### 1. Backend and database

Requirements: Node.js 20+, PostgreSQL, and PostGIS installed in the database.

From PowerShell:

```powershell
cd backend
Copy-Item .env.example .env
```

Edit `backend/.env` with your local PostgreSQL credentials. Then run:

```powershell
npm install
npm run migrate
npm start
```

Check `http://localhost:4000/health`; it should report `status: ok` and `database: connected`. The dashboard is served at `http://localhost:4000/dashboard/`.

### 2. Mobile app

In a second terminal:

```powershell
cd mobile
npm install
npx expo start
```

On a physical Android phone, keep the phone and computer on the same Wi-Fi. The app attempts to resolve the Expo host's LAN address automatically. If needed, copy `mobile/.env.example` to `mobile/.env`, set `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:4000`, and restart Expo. For an Android emulator, the app falls back to `http://10.0.2.2:4000`.

Full setup details: [Mobile/backend integration](docs/MOBILE_BACKEND_INTEGRATION.md).

## Tests

Backend and script tests:

```powershell
cd backend
npm ci
npm test
```

Validation edge cases:

```powershell
node packages/validation/test-validation.mjs
node scripts/validation-self-check.mjs
```

The GitHub Actions workflows run backend/script tests, validation tests, and an Expo Android bundle export.

## Why this backend

- **Existing R pipeline:** the API keeps analytical logic in the supplied R pipeline and includes a runner that can invoke it with prepared input data. Alerts and other outputs must be loaded from the supplied analysis outputs for assessment parity; the candidate pack is not committed to this repository.
- **Future modelling:** new models, retraining, covariates and a future NTD module can run as separate R or Python jobs and publish versioned outputs that the API imports, rather than putting model execution in mobile clients.
- **Scalability:** Express is stateless and can be replicated behind a load balancer; PostgreSQL/PostGIS remains the system of record and spatial indexes support location queries. A production deployment would also need managed infrastructure, monitoring, backups and a durable worker/queue for larger ingestion volumes.
- **Maintainability:** the code is split into API routes, data access, migrations, shared validation and a small static dashboard. Node.js is a familiar single runtime for the API and JavaScript validation, while the existing R pipeline remains independently owned.

## Assessment status and known limitations

- Mobile records and drafts are stored locally; sync runs after saving, when the app becomes active, and on user request. The server validates incoming records and supports per-record outcomes and same-ID correction after a rejection.
- The database schema includes PostGIS geometry and a spatial index; live database operation still depends on the reviewer's/local machine's PostgreSQL/PostGIS configuration.
- The official 1,525-row parity comparison has **not** been recorded as passing. Run `node scripts/parity-test.mjs /path/to/VECDIM_Candidate_Pack` with the supplied candidate pack and required R dependencies; see [parity status](docs/PARITY_RESULT.md).
- An automated import/seed script for the supplied `cleaned_data.csv` and `alerts.csv`, verified 647-alert and tier totals, a single-command full-stack startup, and a demo recording are not included/verified in this repository yet.
- A true OS-level background sync task and exponential retry/back-off have not been verified.
- The synthetic dataset is assessment material and is intentionally not committed to this repository.

## AI usage

AI coding assistance was used during development and is documented in [docs/AI_USAGE.md](docs/AI_USAGE.md). The developer reviews and tests submitted code and remains responsible for explaining the implementation.
