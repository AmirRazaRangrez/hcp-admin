# HCP Owner (Expo / React Native / TypeScript)
Run: `npm install && npx expo start`. Build: `npm run apk` (APK) or `npm run aab` (Play Store) via EAS.
Enter your CRM server URL and a manager/owner account on the login screen.
`src/api/client.ts` is the only file that talks to the CRM and enforces read-only access. See `API-USAGE.md` for every call the app makes.
`/api/owner/*` routes do not exist in the CRM, so Activity, Notifications and the Discounts tab are built in the app from the CRM's existing bill and stay lists (last 7 days, read-only). If the CRM later adds `/api/owner/*`, the app uses it automatically. Approving/rejecting discounts and remote push need those server routes.
Set `ROUTES.ROOM_BILLS` in `src/api/client.ts` to your CRM's room-bill route.

## Owner App Login

The sign-in screen has been removed. The dedicated Owner app silently authenticates against the configured CRM server using its built-in manager account, so the owner does not enter credentials.

CRM URL: `http://192.168.1.63:3000`


If the CRM returns 401 (restart, new JWT secret, expired token) the app signs in again by itself and retries the request.

## Web demo on Netlify
The browser build uses built-in SAMPLE data (`src/api/demo.ts`) and never contacts the CRM (`DEMO_MODE` in `src/config.ts`).
- Quick deploy: drag the `dist` folder onto https://app.netlify.com/drop
- Git deploy: push the project to GitHub, import it in Netlify. `netlify.toml` already sets the build command (`npx expo export -p web`) and publish folder (`dist`).
- Rebuild after changes: `npx expo export -p web`
The Android app (Expo Go / APK) still uses the real CRM.
