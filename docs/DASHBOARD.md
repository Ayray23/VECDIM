# VECDIM Dashboard

The dashboard is served by the backend at `/dashboard/`.

It is a live decision-support view backed by the VECDIM API. It does not contain copied candidate-pack data or mock analytics.

## Roles

- **UNIOSUN**: all states, alert counts by tier, recent alerts and filters.
- **VECDIM**: alerts and record activity limited to the user's assigned state.
- **Field**: field-record and sync-status view for the user's assigned state; analytics dashboard access is denied by the API.

The role switcher sends the selected role and user identifier in the existing `x-role` and `x-user-id` headers. The API remains responsible for authorization and state scoping.

## Endpoints used

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/records`
- `GET /api/v1/alerts`

Tier and resistance are displayed as separate fields, matching the technical-task requirement.
