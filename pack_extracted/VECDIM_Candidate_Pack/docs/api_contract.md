# Suggested API contract

You may change details if you document why. The behaviours marked **must** are assessed. All paths are under `/api/v1`. Responses are JSON. The contract does not depend on a programming language: use the backend framework you judge best (see the brief, item 4).

## Authentication and roles

A simple token or header is enough for this task (see `data/demo_users.csv`). Three roles: `field`, `vecdim` and `uniosun`. A `vecdim` user is the **state-level** user and is tied to one state; a `uniosun` user is the **national-level** user. A `field` user sees only their own records; a `vecdim` user sees their state; a `uniosun` user sees everything.

## Records

### `POST /records/batch` (must)

Request:

```json
{
  "records": [
    {
      "record_id": "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90",
      "state": "Osun", "lga": "Osogbo", "ward": "Osogbo Ward 2",
      "latitude": 7.77, "longitude": 4.56, "gps_accuracy_m": 6.5,
      "collection_date": "2026-10-07",
      "species": "An. gambiae s.s.", "insecticide": "Permethrin",
      "n_exposed": 100, "n_dead": 54,
      "larval_density": 6, "urban": 1, "irs_covered": 0, "itn_use_pct": 61.5,
      "captured_at": "2026-10-07T09:14:22Z"
    }
  ]
}
```

Response (one entry per record, same order). Every error carries the rule, the field and a message the app can show to the field worker:

```json
{
  "results": [
    { "record_id": "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90",
      "status": "accepted", "flags": [], "errors": [] },
    { "record_id": "8c1d0b22-4f3e-4a57-b6f1-2e9a77c0d314",
      "status": "rejected", "flags": [],
      "errors": [
        { "rule": "n_dead_gt_n_exposed", "field": "n_dead",
          "message": "n_dead (120) is more than n_exposed (100). Correct the number of dead mosquitoes." }
      ] }
  ]
}
```

`status` is one of `accepted`, `accepted_with_flags` (with `flags` listing the Warn rules that fired, same shape as `errors`), `rejected` (with `errors` listing every Block rule that fired) or `already_received`.

**Must:**

- Sending the same `record_id` twice never creates a second row (idempotent).
- One bad record in a batch never blocks the others: valid records are stored and answered `accepted`, invalid ones are answered `rejected`, in the same response. Use the HTTP status 200 for a batch that was processed, even if some records were rejected.
- **Resubmission.** A record that was `rejected` was not stored, so the app can send it again after the user corrects it, **with the same `record_id`**. The server validates it afresh and, if it passes, stores it and answers `accepted` (or `accepted_with_flags`). `already_received` is only for a `record_id` that was already **accepted**. Keep every attempt (including the rejected ones and their errors) in your sync-batch log.

### `GET /records?state=&lga=&since=` (must)

Returns records the caller is allowed to see, filtered as asked.

## Alerts and risk (read-only data from the R pipeline)

### `GET /alerts?state=&lga=&from=&to=` (must)

Loaded from `outputs/alerts.csv` at start-up (a seed script is fine). Each item looks like this (the values here are only an illustration; use the real file):

```json
{
  "id": "Osun|Osogbo|2026-06",
  "state": "Osun", "lga": "Osogbo", "month": "2026-06",
  "n_records": 4, "mean_risk": 0.74,
  "tier": "ALERT",
  "pyrethroid_resistance_flag": true
}
```

Tiers: `ALERT` (risk 0.70 or more), `WARNING` (0.50 to below 0.70), `WATCH` (below 0.50). The resistance flag is separate and must not change the tier.

### `GET /risk-points?bbox=minLon,minLat,maxLon,maxLat` (bonus)

Loaded from `outputs/risk_predictions.csv`. With PostGIS, answer the bounding box with a spatial query (`ST_Intersects` or `&&`) on a `geometry(Point, 4326)` column with a GiST index.

### `POST /alerts/{id}/acknowledge` (bonus)

Records who acknowledged an alert, when, and an optional note. The plan's target is 80% of alerts acknowledged within 48 hours, so expose "time to acknowledge".

## Other

- `GET /health` (must): returns `{"status":"ok"}`.
- `GET /export/dhis2?state=&month=` (bonus): returns records as a DHIS2-style `dataValueSets` JSON. Document your data-element mapping in the README.
