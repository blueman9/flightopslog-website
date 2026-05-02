# Admin Feedback Dashboard — Design

**Date:** 2026-05-01
**Status:** Proposed

## Summary

Add a private admin dashboard to flightopslog.com for triaging in-app user feedback submitted by pilots from the iOS FlightOps Log app. The dashboard lives at `/admin` inside the existing React SPA, lazy-loaded so the marketing bundle is unaffected. Access is gated to a single Google account (`blueman9@gmail.com`) at three layers: client UI, Cloudflare Pages Function, and Firestore security rules. Per-row actions are: mark triaged, delete, and convert to a Linear issue via a Pages Function that holds the Linear API key as a secret.

## Motivation

The iOS app already collects in-app feedback into Firestore (`feedback/*`), but there is no surface to triage it. Today the only way to see new submissions is the Firebase console, which is fine for spot-checks but unworkable for routinely converting bugs and feature requests into Linear issues. A small admin SPA, locked to one email, gives a triage flow that takes a few seconds per item and keeps Linear in sync.

## Non-goals

- Multi-user / role-based admin access. One email is the entire access list.
- Public-facing pieces (no marketing-side feedback form, no status page).
- Analytics, charts, dashboards over the feedback set.
- Real-time updates, push notifications.
- Test harness / unit tests / e2e — the surface is too small and the repo has no test setup; manual verification checklist instead.
- Backfilling historical feedback into Linear.

## Architecture

The system is two cooperating pieces inside the existing Cloudflare Pages project, plus three external services they reach out to.

```
flightopslog.com (Cloudflare Pages, existing)
│
├─ Marketing SPA (existing)              src/App.tsx + src/pages/*
│   └─ unchanged; ships zero Firebase code
│
├─ /admin    (new, lazy-loaded)          src/admin/
│     │
│     ├─ AdminApp.tsx          ← top-level shell, owns auth state + routing
│     ├─ SignIn.tsx            ← Google sign-in, only shown when signed-out
│     ├─ FeedbackList.tsx      ← list view with status filter + refresh
│     ├─ FeedbackRow.tsx       ← one row + expand-on-click for diagnostics
│     ├─ ConvertToLinearModal.tsx ← pre-flight title/description/labels editor
│     ├─ firebase.ts           ← initializes app, exports auth + db handles
│     └─ linearClient.ts       ← thin fetch wrapper around the Pages Function
│
└─ /api/linear-create-issue   (new Pages Function)   functions/api/linear-create-issue.ts
      ├─ Verifies Firebase ID token (jose + cached JWKS)
      ├─ Rejects if email ≠ blueman9@gmail.com or email_verified ≠ true
      └─ Posts to Linear GraphQL with LINEAR_API_KEY (Workers secret)
```

External services touched:

- **Firebase Auth (Google provider)** — sign-in via `signInWithPopup`. ID token is what the Pages Function verifies.
- **Firestore (`feedback/*`)** — read/update/delete from the SPA. Server-side rules (in iOS app repo) are the source of truth.
- **Linear GraphQL API** — only ever called from the Pages Function. API key never reaches the browser.

Why this shape:

- The marketing bundle stays unchanged because `src/admin/` is reached via `React.lazy()`. Firebase ships in a separate chunk that lazy-downloads on `/admin`.
- The SPA never sees the Linear API key. A compromised admin tab is capped at "delete a feedback doc," which the rules also gate to one email.
- One Pages Function with one job (Linear). Not a generic admin proxy — minimal attack surface.

### Routing changes

- `src/main.tsx` adds a lazy admin route: `<Route path="/admin" element={<AdminApp />} />`. No sub-routing in v1 — sign-in vs list vs not-authorized are state inside `AdminApp`, not separate URLs.
- `public/_redirects` is created with `/* /index.html 200` so deep links to `/admin` survive a hard refresh. (Documented as a known gotcha in `CLAUDE.md`, but the file does not currently exist.)
- `public/robots.txt` is created with `User-agent: *` / `Disallow: /admin`. The admin shell *also* sets `<meta name="robots" content="noindex">` on mount, but because Cloudflare's SPA fallback serves the same `index.html` for `/admin`, the JS-set meta tag isn't seen by crawlers that don't execute JS — `robots.txt` is the reliable belt.

### Packages

Two new dependencies, called out for explicit approval (per `CLAUDE.md`'s "don't add packages without asking"):

- `firebase` — Web SDK; Auth + Firestore. Tree-shaken; only ships in the lazy admin chunk.
- `jose` — used only by the Pages Function for JWT verification.

No new build, test, or UI dependencies.

## Components

### `src/admin/firebase.ts`

Initializes the Firebase Web SDK once and exports singletons (`auth`, `db`, `googleProvider`). Reads config from `import.meta.env.VITE_FIREBASE_*` (apiKey, authDomain, projectId, appId), set in Cloudflare Pages env vars and a local `.env.local` (gitignored).

### `src/admin/AdminApp.tsx` *(default export, lazy-loaded from `main.tsx`)*

Top-level shell. Owns auth state and gates everything below.

- Subscribes to `onAuthStateChanged`. Three states: `loading`, `signed-out`, `signed-in`.
- Signed-out → `<SignIn />`.
- Signed-in but `user.email !== 'blueman9@gmail.com'` → "Not authorized" pane with the offending email and a Sign Out button. (Belt-and-suspenders; Firestore rules also reject.)
- Signed-in and email matches → admin chrome (top bar with email + Sign Out) and `<FeedbackList />`.
- Sets `<meta name="robots" content="noindex">` on mount.

### `src/admin/SignIn.tsx`

Single button calling `signInWithPopup(auth, googleProvider)`. Inline error if popup blocked or cancelled.

### `src/admin/FeedbackList.tsx`

Owns: filter state, fetched docs, loading/error state, the convert-modal target.

- On mount and on Refresh: `getDocs(query(collection(db,'feedback'), orderBy('createdAt','desc')))`.
- Filter toggle: "Hide triaged" (default on) vs "Show all"; client-side filter at this volume.
- Renders `<FeedbackRow />` per doc. When a row asks to convert, lifts that doc into local state and renders `<ConvertToLinearModal />`.

### `src/admin/FeedbackRow.tsx`

One row, collapsed by default; click anywhere on the row body to expand.

**Collapsed:** `createdAt` (relative), `category` pill, `status` pill, `subject` if present else first ~120 chars of `body`, `contactEmail` if present.

**Expanded:** full `body`, then a key-value block for `appVersion`, `buildNumber`, `iosVersion`, `deviceModel`, `locale`, `originScreen`, `iCloudState`, `flightCount`, `pendingSyncCount`, `conflictCount`, and a `<details>` for `logs` if present.

Three actions in the row footer: **Mark triaged**, **Convert to Linear**, **Delete** (two-click confirm: first click swaps to red "Confirm delete?", second within ~3s deletes; clicking elsewhere reverts).

If the doc already has `linearIssueUrl`, the row footer shows that link instead of the Convert button.

### `src/admin/ConvertToLinearModal.tsx`

Pre-flight modal for Linear conversion.

Pre-filled fields:

- **Title** = `subject` if present, else `[${category}] ${first ~80 chars of body}…`
- **Description** = `body`, followed by a fenced metadata footer:
  ```
  ---
  App version: 1.2.3 (45)
  iOS: 17.4 — iPhone 15 Pro
  Locale: en-US
  Origin screen: AddFlightView
  iCloud: linked
  Counts: 412 flights, 0 pending sync, 0 conflicts
  Contact: pilot@example.com
  Feedback ID: <Firestore doc id>
  ```
- **Labels** = `feedback` by default; checkboxes for `Bug` / `Feature` / `question`, pre-checked from `category`.

Submit calls `linearClient.createIssue({ title, description, labels })`. On success: `updateDoc(..., { status: 'triaged', linearIssueUrl })`, close modal, show URL on the row. On failure: keep modal open, inline error.

### `src/admin/linearClient.ts`

Thin `fetch` wrapper. Calls `auth.currentUser.getIdToken()`, POSTs `{ title, description, labels }` to `/api/linear-create-issue` with `Authorization: Bearer <token>`. Returns `{ id, url }` or throws.

### `functions/api/linear-create-issue.ts`

Cloudflare Pages Function. Stateless.

1. Read `Authorization` header; reject 401 if missing or not Bearer.
2. Verify JWT with `jose.jwtVerify` against JWKS at `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`. JWKS cached in module scope (per isolate) via `createRemoteJWKSet`.
3. Verify `iss === 'https://securetoken.google.com/flightopslog'`, `aud === 'flightopslog'`, `email === 'blueman9@gmail.com'`, `email_verified === true`. Any failure → 403.
4. Parse JSON body `{ title, description, labels? }`. Validate types and length caps; 400 on bad input.
5. Look up team ID by key (`FlightOpsLog`) and label IDs by name via Linear GraphQL (cached per-isolate after first call).
6. Call Linear `issueCreate`; return `{ id, url }`. Linear errors → 502 preserving Linear's error message.

Hard caps on input (defense-in-depth):

- `title.length ≤ 300`
- `description.length ≤ 50000`
- `labels` array ≤ 10 entries, each ≤ 50 chars

## Data flows

### A) Sign-in → admin shell

Click → `signInWithPopup` → Firebase mints ID token, persists in IndexedDB → `onAuthStateChanged` fires → email check → render list or "Not authorized." Token auto-refreshes (1h expiry); subsequent Firestore calls and Function calls always pull fresh via `getIdToken()`.

### B) List load

Mount/Refresh → `getDocs(orderBy('createdAt','desc'))` → Firestore rules check admin email → returns docs → client filters `status === 'triaged'` based on toggle. No pagination, no listener.

### C) Mark triaged / Delete

`updateDoc(..., { status: 'triaged' })` or `deleteDoc(...)`. Optimistic local-state update on success; revert with inline error on failure. Two-click delete confirm.

### D) Convert to Linear

```
modal Submit
  → getIdToken()
  → POST /api/linear-create-issue with Bearer token + body
  ↓ Pages Function
  → jose.jwtVerify(idToken, JWKS)
  → assert iss/aud/email/email_verified
  → resolve teamId (cached) and labelIds (cached) via Linear GraphQL
  → Linear issueCreate mutation
  ← respond { id, url }
  ↑ Browser
  → updateDoc(feedback/id, { status: 'triaged', linearIssueUrl: url })
  → close modal; row shows URL link
```

The Function never touches Firestore. Tradeoff: a partial failure (Linear succeeds, Firestore update fails) leaves Firestore unupdated. Mitigation: the row's local state gets `linearIssueUrl` immediately on Function success — even if the Firestore write throws, the UI swaps Convert for the link, and a toast prompts the user to "Mark triaged" manually before refreshing.

## Error handling

### Sign-in / auth state

| Failure | Treatment |
|---|---|
| Popup cancelled | Inline: "Sign-in cancelled. Try again." |
| Popup blocked | Inline: "Your browser blocked the sign-in popup. Allow popups for flightopslog.com." |
| Network error | Inline: "Couldn't reach Google. Check your connection." |
| Email ≠ admin | "Not authorized" pane with Sign Out. |
| Token expired mid-session | Loading state while SDK refreshes; hard fail → drop to sign-out screen. |

### Firestore reads

| Failure | Treatment |
|---|---|
| `permission-denied` | Top banner: "Firestore denied this read. Rules may not be deployed yet." |
| Network/offline | Banner: "Couldn't reach Firestore." Last data stays visible. |
| Empty | Friendly empty state. |

### Firestore writes

Both buttons disable + spinner while in flight. On error: inline row error with revert (`permission-denied`, network) or quiet drop (`not-found`).

### Convert-to-Linear

| Where it broke | Function returns | Modal shows |
|---|---|---|
| No / malformed Authorization | 401 unauthorized | "Authentication expired. Sign out and back in." |
| JWT signature/exp/iss/aud invalid | 401 unauthorized | Same. |
| Email not admin / not verified | 403 forbidden | "This account isn't allowed to create Linear issues." |
| Bad request body | 400 invalid_request | Modal stays open, field-level error if pinpointable. |
| Linear team/label lookup failed | 502 linear_lookup_failed | "Couldn't find the FlightOpsLog team in Linear." |
| Linear `issueCreate` returned error | 502 linear_create_failed | Modal stays open, Linear's error message. |
| Linear unreachable (timeout/DNS) | 504 linear_unreachable | "Couldn't reach Linear. Try again." |
| `LINEAR_API_KEY` missing | 500 misconfigured | "Server isn't configured. Set LINEAR_API_KEY in Pages." |

### Partial-failure case (Linear succeeds, Firestore update fails)

Modal closes (issue exists; no double-file). Toast: "Issue created at <url>, but couldn't mark this feedback as triaged. Click 'Mark triaged' to fix it." Row's local state gets `linearIssueUrl` immediately so the link appears; the toast is the user's signal to act before refreshing.

### Explicit non-handling

- No retry loop in the Function (one-shot; user re-submits).
- No optimistic update on Convert-to-Linear (we wait for confirmation).
- No global error toast layer for v1 (inline per row/modal is enough).
- No Crashlytics/Sentry hookup.

## Firestore security rules diff

Hand off to the iOS app repo (where `firestore.rules` lives). **Do not apply this from the website repo.**

```diff
 rules_version = '2';

 service cloud.firestore {
   match /databases/{database}/documents {

+    function isAdmin() {
+      return request.auth != null
+          && request.auth.token.email == 'blueman9@gmail.com'
+          && request.auth.token.email_verified == true;
+    }
+
+    function isValidAdminUpdate(before, after) {
+      let changed = after.diff(before).affectedKeys();
+      return changed.hasOnly(['status', 'linearIssueUrl'])
+          && (!('status' in after) || after.status in ['new', 'triaged'])
+          && (!('linearIssueUrl' in after)
+              || (after.linearIssueUrl is string
+                  && after.linearIssueUrl.matches('^https://linear\\.app/.+')));
+    }
+
     function isValidFeedback(data) {
       return data.keys().hasOnly([
               'createdAt', 'category', 'subject', 'body', 'contactEmail',
               'appVersion', 'buildNumber', 'iosVersion', 'deviceModel', 'locale',
               'flightCount', 'pendingSyncCount', 'conflictCount',
-              'iCloudState', 'originScreen', 'logs', 'status'
+              'iCloudState', 'originScreen', 'logs', 'status', 'linearIssueUrl'
             ])
         && data.keys().hasAll([
               'createdAt', 'category', 'body', 'appVersion', 'buildNumber',
               'iosVersion', 'deviceModel', 'locale',
               'flightCount', 'pendingSyncCount', 'conflictCount',
               'iCloudState', 'originScreen', 'status'
             ])
         && data.category in ['bug', 'feature', 'other', 'question']
         && data.body is string && data.body.size() > 0 && data.body.size() <= 10000
         && (!('subject' in data) || (data.subject is string && data.subject.size() < 200))
         && (!('contactEmail' in data) || (data.contactEmail is string && data.contactEmail.size() < 320))
         && (!('logs' in data) || (data.logs is string && data.logs.size() <= 51200))
         && data.status == 'new'
         && data.createdAt is timestamp;
     }

     match /feedback/{id} {
       allow create: if isValidFeedback(request.resource.data);
-      allow read, update, delete: if false;
+      allow read:   if isAdmin();
+      allow update: if isAdmin()
+                    && isValidAdminUpdate(resource.data, request.resource.data);
+      allow delete: if isAdmin();
     }

     match /{document=**} {
       allow read, write: if false;
     }
   }
 }
```

Notes:

- `linearIssueUrl` is added to `hasOnly()` on `isValidFeedback` so the field is tolerated but not required at create. `isValidAdminUpdate` is the only path that actually writes it.
- `isValidAdminUpdate` uses `affectedKeys().hasOnly(['status','linearIssueUrl'])`, so the admin literally cannot mutate `body`, `category`, device fields, etc. Update blast radius is two fields.
- `email_verified` requirement guards against future provider-link edge cases.

**Apply timing:** rules can be deployed before the admin SPA exists — the SPA fails closed if it cannot read. Applying after the admin is wired up means first list-load hits `permission-denied` with no obvious diagnosis. Apply rules first.

## Testing & verification

No test harness; the surface is too small. Manual verification checklist on every change.

### Build / typecheck

- `npm run build` clean — no TS errors, no warnings.
- `npm run lint` clean.
- Bundle check: marketing chunk size unchanged. Admin route in a separate chunk; Firebase SDK ships only in that chunk.

### Local verification

`npm run dev` plus `npx wrangler pages dev dist` (with `LINEAR_API_KEY` set locally for the Function):

1. Marketing pages (`/`, `/privacy`, `/support`, `/import-template`, `/testflight`) load and look identical. No Firebase chunk in the network tab.
2. `/admin` deep-loads on hard refresh (proves `_redirects`).
3. Sign-in as `blueman9@gmail.com` → admin chrome appears.
4. Sign-in with a non-admin Google account → "Not authorized" pane; Firestore returns 403 if probed.
5. List renders untriaged docs in `createdAt` desc; empty state if none.
6. Toggle "Show all" reveals triaged docs.
7. Mark triaged → row flips, vanishes when toggle is on default. Refresh confirms persisted.
8. Delete (two-click) → first click red "Confirm delete?", second within 3s deletes. Refresh confirms.
9. Convert to Linear → modal opens with auto-derived fields. Submit → issue appears in Linear (correct labels), row gets `linearIssueUrl`, status flips to `triaged`. Refresh — link persists.
10. Convert-to-Linear edge cases:
    - `LINEAR_API_KEY` unset → 500 misconfigured.
    - `LINEAR_API_KEY` garbage → 502 with Linear's auth error.
    - Network cut mid-submit → 504, modal stays open, retry works.
11. Auth pass-through: forge a curl without/with tampered token → 401/403.

### Production smoke

After Cloudflare Pages publishes:

1. Sign in to `flightopslog.com/admin`; list loads.
2. Convert one (test) feedback to Linear; verify in Linear.
3. Mark one triaged; refresh; confirm.
4. Delete a throwaway test doc.
5. Test data: seed one test doc via Firebase Console before first run so we're not operating on real submissions.

### Explicitly skipped for v1

- Unit / integration / e2e tests.
- Lighthouse / Core Web Vitals on `/admin` (private page).
- Cross-browser matrix (Chrome + Safari is enough).

## Deployment

Cloudflare Pages auto-deploys from `main` (existing config). New requirements:

- **Pages env vars** (project settings → Environment variables → Production):
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN` (`flightopslog.firebaseapp.com`)
  - `VITE_FIREBASE_PROJECT_ID` (`flightopslog`)
  - `VITE_FIREBASE_APP_ID`
- **Pages secret** (for Functions): `LINEAR_API_KEY` — set via `npx wrangler pages secret put LINEAR_API_KEY` or the dashboard.
- **Authorized domain** in Firebase Auth → Sign-in method → Authorized domains: add `flightopslog.com` (the default `*.pages.dev` may already be there for previews).
- **Firestore rules** must be deployed in the iOS app repo before the admin SPA is exercised (see "Apply timing" above).

Local dev: `.env.local` (gitignored) carries the same `VITE_FIREBASE_*` vars; `LINEAR_API_KEY` is set when running `wrangler pages dev`.

## Open questions / future work

- If feedback volume grows past ~50/week, swap one-shot reads for `onSnapshot` and add basic pagination.
- If we ever invite a second triager, replace the email-list check with a custom claim or a `roles/{uid}` doc.
- A README section for `/admin` and the Pages Function deployment will be added as part of the implementation, in `README.md`.
