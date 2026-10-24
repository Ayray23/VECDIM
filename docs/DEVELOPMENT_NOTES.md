# Development Notes

## Stage 1 — Mobile foundation

### Goal
Create the smallest working React Native foundation for a field observation workflow.

### Current design
- React Native with Expo for the mobile client.
- AsyncStorage for the first local draft mechanism.
- Expo Location for foreground GPS capture.
- JavaScript is used for the prototype to keep the implementation lightweight and consistent with the developer's existing React/Node workflow.

### Important boundary
This stage is not the final offline-sync implementation. Persistent sync queues, server validation, idempotency and retry handling are later stages.

### Why local draft persistence matters
The assessment requires the application to work offline and recover an unfinished draft after the app is closed or restarted. The first stage therefore persists the current form state locally.
