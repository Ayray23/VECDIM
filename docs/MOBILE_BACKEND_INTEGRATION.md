# Mobile ↔ backend integration

The Expo field app now sends locally saved `pending_sync` records to the Express API through `POST /api/v1/sync`. The app continues to store records in AsyncStorage first, so a missing network or unavailable backend does not discard captured data.

## 1. Configure the mobile API URL

From the repository root in PowerShell:

```powershell
Copy-Item mobile/.env.example mobile/.env
```

Edit `mobile/.env` and replace `YOUR_COMPUTER_LAN_IP` with your computer's current IPv4 address. For a physical phone, use the computer's Wi-Fi/LAN address and connect both devices to the same network. Do not use `localhost` from a physical phone. For an Android emulator, use `http://10.0.2.2:4000` instead.

After changing the environment file, restart Expo so the public environment variable is loaded:

```powershell
cd mobile
npx expo start --clear
```

## 2. Start the backend and database

The backend requires Node.js 20 or newer and a PostgreSQL database with PostGIS enabled and the repository migrations applied. In a second terminal:

```powershell
cd backend
Copy-Item .env.example .env
```

Edit `backend/.env` so `DATABASE_URL` points to the configured database, then run:

```powershell
npm install
npm run migrate
npm run dev
```

Check the API from the computer:

```powershell
Invoke-RestMethod http://localhost:4000/health
```

The health response should show `status: ok` and `database: connected`. If it reports a database error, fix the database connection/migrations before testing mobile sync.

## 3. Sync records

In the app, complete and save a valid field record. It is stored locally with `pending_sync` status. Tap **Sync pending records**. Successful records change to `synced`; backend-rejected records are marked `rejected` and retain a sync error for review. Network/configuration errors leave pending records stored locally.

The mobile client translates the frontend fields (`recordId`, `exposed`, `dead`, `latitude`, etc.) to the backend API schema (`id`, `exposedCount`, `deadCount`, `gpsLatitude`, etc.).

## 4. Notes

- `EXPO_PUBLIC_API_URL` is public client configuration, not a secret. Never put database passwords or server-only credentials in Expo public variables.
- Do not commit `mobile/.env` or `backend/.env`.
- This first integration uses a manual sync action. Automatic network-aware background syncing can be added after the end-to-end path is verified.
