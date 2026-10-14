# What this app sends to your CRM

Every request goes through `src/api/client.ts`. Two guards live there:
1. **Read-only guard** – any non-GET request is blocked inside the app unless the path starts with `/owner/`. (Login is the only other POST, sent separately.)
2. **Request sharing** – identical GETs within 4 seconds share one call, so repeated pull-to-refresh cannot hammer the server.

| Call | Method | Used by | Notes |
|---|---|---|---|
| `/api/auth/login` | POST | Login | Same endpoint your web app uses. Creates a normal login/token. |
| `/api/stats` | GET | Home | Read-only. |
| `/api/manager/analytics?startDate&endDate` | GET | Home, Analytics | Manager role. Heaviest query: runs once per Home load and once per range change. |
| `/api/restaurant/settled-bills`, `/api/bar/settled-bills` | GET | Bills | CRM caps each list at 250 rows. |
| `/api/hospitality/history?limit=200` (`ROUTES.ROOM_BILLS`) | GET | Bills | Verified to exist in the CRM `server.js` (read-only SELECT, no auth on the CRM side). Heavier than the bill lists because it joins guests, rooms and payments. Only checked-out stays are kept in the app. |
| `/api/restaurant/orders/:id`, `/api/bar/orders/:id` | GET | Bill detail | One per bill opened. |
| `/api/owner/*` | GET/POST | Approvals, Activity, Notifications, push token | Do not exist yet. 404 shows a notice. Only these can write. |

## Checked against the CRM server code (read-only review, CRM not modified)
- `/api/stats`, `/restaurant/settled-bills`, `/bar/settled-bills`, `/restaurant/orders/:id`, `/bar/orders/:id`, `/hospitality/history`: plain SELECTs, no writes.
- `/api/auth/login`: no lockout or rate limit. Its only write is a one-time plaintext-to-bcrypt password upgrade.
- `/api/manager/analytics`: manager-only, read-only, the heaviest query. The CRM uses synchronous SQLite, so a slow query can briefly delay the front desk. The app calls it once per Home load and once per date-range change.
- `/api/owner/*` does not exist in the CRM. Those screens show "not connected" until it does. The app never writes anywhere else.

## Still unverified
- Exact field names in `/stats` and `/manager/analytics` (Home tiles and charts read them defensively).
- Behaviour on a very large database (lists are capped by the CRM, so older bills are not shown).

## Security notes for whoever hosts the CRM (not changed by this app)
Several CRM read routes have no auth, CORS is open and JWT_SECRET falls back to a default. Do not expose the CRM to the internet without a VPN or added auth.
