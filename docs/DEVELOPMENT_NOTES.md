# Development Notes

## Stage 1 — Mobile foundation

### Goal
Create the smallest working React Native foundation for a field observation workflow that behaves correctly while offline.

### Current design
- React Native with Expo for the mobile client.
- AsyncStorage for persistent local drafts and saved offline records in this stage.
- Expo Location for foreground GPS capture.
- Native date picker for collection date.
- JavaScript is used for the prototype to keep the implementation lightweight and consistent with the developer's existing React/Node workflow.

### Stage 1 behaviour
- A UUID v4 is generated on-device when a record is opened and remains attached to that record.
- State, LGA and Ward are controlled selections based on the supplied candidate-pack catalogues.
- GPS accuracy is shown to the fieldworker. The app keeps trying for a better fix for up to 60 seconds after a first fix above 10 m; >50 m or missing accuracy blocks saving.
- LGA distance uses the supplied reference point and haversine distance. More than 25 km is a warning, not a block.
- Mortality is calculated as `100 * dead / exposed`, rounded to one decimal place, with the specified WHO class bands.
- Drafts autosave after changes and on backgrounding. Drafts are not submitted and can be resumed or discarded after restart.
- Saved records are persisted separately and marked `pending_sync`. They are intentionally not uploaded until the later sync stage.

### Important boundary
This stage is not the final offline-sync implementation. Server validation, idempotency, retry handling, rejection/resubmission, PostGIS persistence and dashboard behaviour are later stages.

### Stage 1 verification requirement
The implementation is considered ready for sign-off only after Android runtime testing confirms three saved offline records survive an app restart, a partly completed draft is recovered with its values and record ID, and the GPS accuracy/LGA warning and block behaviours match the supplied field specification.
