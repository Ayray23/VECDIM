# Mobile ↔ backend integration

The Expo field app stores field records and drafts in AsyncStorage before any upload. It maps saved records to the backend sync schema and calls `POST /api/v1/sync`. The app attempts sync after saving a record, when the app becomes active, and when the fieldworker taps **Sync Now**. Pending records remain on the device when the backend is unavailable.

## 1. Configure the mobile API URL

For a physical Android phone, the app can derive the computer's LAN IP from Expo's development host. If that is not reliable on your network, configure the optional environment variable:

```powershell
Copy-Item mobile/.env.example mobile/.env
```

Edit `mobile/.env` and replace `YOUR_COMPUTER_LAN_IP` with your computer's current IPv4 address. Keep the phone and computer on the same Wi-Fi. Do not use `localhost` from a physical phone. For an Android emulator, use `http://10.0.2.2:4000`.

Restart Expo after changing the environment file:

```powershell
cd mobile
npm install
npx expo start --clear
```

## 2. Start the backend and database

The backend requires Node.js 20 or newer and PostgreSQL with PostGIS enabled. In a separate terminal:

```powershell
cd backend
Copy-Item .env.example .env
```

Edit `backend/.env` to use your actual database credentials, then run:

```powershell
npm install
npm run migrate
npm start
```

Check the health endpoint:

```powershell
Invoke-RestMethod http://localhost:4000/health
```

Expected: `status = ok` and `database = connected`. If the database is disconnected, fix the PostgreSQL/PostGIS configuration before testing the mobile app.

## 3. Sync and correct records

Save a valid field record. It is stored locally with `pending_sync` status, then sent to the server when sync runs. Accepted records become `synced`; validation-rejected records stay on the device with the server's rejection reason and can be corrected and resubmitted. Network errors leave records pending locally.

The mobile client maps app fields such as `recordId`, `exposed`, `dead`, and `latitude` to the server's `id`, `exposedCount`, `deadCount`, and `gpsLatitude` fields. The server validates each record again and uses the UUID for idempotent handling.

## Notes and current limitations

- `EXPO_PUBLIC_API_URL` is public client configuration. Never put database credentials in an Expo public variable.
- Do not commit `mobile/.env` or `backend/.env`.
- Sync is triggered by app activity and explicit user action; a true operating-system background task and exponential retry/back-off have not been verified.
- The official 1,525-row R parity comparison still requires the supplied candidate pack and R dependencies; see `docs/PARITY_RESULT.md`.
