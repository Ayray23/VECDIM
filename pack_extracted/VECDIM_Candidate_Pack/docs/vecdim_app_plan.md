# VECDIM: the plan your app implements

This is the part of the VECDIM project plan that covers the mobile app, backend and dashboard. Budget and partner details are left out.

## Purpose

VECDIM replaces paper-based, retrospective malaria surveillance reporting with real-time data capture, automated analysis and early warning. Field teams record georeferenced mosquito (entomology) data at the point of collection. Programme managers use the results to decide where to spray, where to send bed nets, and which insecticide to use.

## Three layers

| Layer | What the plan says | What you build in this task |
| --- | --- | --- |
| 1. Real-time data collection | Cross-platform app (React Native), GPS-enabled, **fully offline-capable with automatic sync**, georeferenced entry of entomological and environmental data, DHIS2-compatible schemas, automated GPS-plausibility and value-range validation on every submission | The mobile app and the validation logic |
| 2. Analysis and early-warning engine | Automated spatial analytics and a machine-learning risk model; a threshold-driven early-warning system (EWS) that sends escalating alerts to field supervisors, state-level (VECDIM) managers and national-level (UNIOSUN) managers | **Already done for you in R.** You consume its outputs (`alerts.csv`, `risk_predictions.csv`) through your API |
| 3. Decision support | Role-differentiated dashboard with **field / VECDIM / UNIOSUN views**, risk maps, an alert feed with response tracking | The dashboard screens |

Backend: an API with a PostgreSQL/PostGIS database (the backend framework is your choice; justify it in your README), a DHIS2-compatible data layer, and the same GPS and value-range checks applied again on the server.

## Plan targets worth designing for

- Data captured in the field reaches the server within 24 hours of the device getting a connection.
- At least 95% of submitted records complete.
- At least 80% of alerts acknowledged within 48 hours (alert response tracking).
- Works in low-connectivity local government areas, so offline is the normal case, not an edge case. A half-filled form survives the app closing, and a rejected record can be corrected and sent again without re-entering it.
- Open-source stack with no licence cost, so the government programme can host and own it.

## Users

- **Field worker** (entomology team): records data, sees their own submissions and sync status.
- **VECDIM state-level user**: sees alerts and records for their one state.
- **UNIOSUN national-level user**: sees all states, with summary views.
- **Supervisor**: receives escalating alerts and confirms action taken.
