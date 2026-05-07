# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Admin Dashboard (`/admin`)

A private feedback-triage dashboard at `flightopslog.com/admin`, locked to a single Google account (`blueman9@gmail.com`). Lists `feedback/*` docs from Firestore and supports mark-triaged, delete, and convert-to-Linear actions.

### How it works

- The route is lazy-loaded (`React.lazy`) so the marketing bundle ships zero Firebase code — Firebase downloads only when `/admin` is visited.
- Sign-in uses Firebase Auth's Google provider client-side; the admin email is checked in three places: the SPA (`src/admin/AdminApp.tsx`), the Worker handler, and Firestore security rules.
- The site deploys as a Cloudflare **Worker with static assets**, configured in `wrangler.jsonc`. The Worker entrypoint at `worker/index.ts` routes `POST /api/linear-create-issue` and `POST /api/cleanup-attachments` to handlers under `worker/handlers/`, and forwards everything else to `env.ASSETS.fetch(request)` (which serves `dist/` and falls back to `index.html` for SPA routes).
- Handlers verify the Firebase ID token via `jose` against Google's JWKS, then call the Linear GraphQL API (with `LINEAR_API_KEY`) and/or the Firebase REST APIs (Storage + Firestore, using the forwarded admin token) on behalf of the admin. The Linear key never reaches the browser.
- Feedback can include image and CSV attachments uploaded by the iOS app to Firebase Storage. When the admin converts feedback to Linear, the Worker also uploads the attachment bytes to Linear (all-or-nothing) and marks the doc `attachmentsArchivedToLinear: true`. A "Clean up Storage" sweep on the dashboard then deletes the Storage objects and clears the `attachments` field for any triaged feedback that's safely archived to Linear or was discarded without filing.

### Deployment requirements

**Cloudflare Worker variables (production) — Plaintext, build-time, set in dashboard:**

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN` (e.g. `flightopslog.firebaseapp.com`)
- `VITE_FIREBASE_PROJECT_ID` (`flightopslog`)
- `VITE_FIREBASE_APP_ID`

These are inlined by Vite at build time. They live under Worker → Settings → Variables and Secrets, type **Plaintext**.

**Cloudflare Worker secret (for the handler) — Encrypted, runtime:**

- `LINEAR_API_KEY` — set via `wrangler secret put LINEAR_API_KEY` or in the Worker dashboard with type **Secret**.

**Firebase:**

- Add `flightopslog.com` (and any preview domains) to Firebase Auth → Sign-in method → Authorized domains.
- Firestore rules live in this repo as `firestore.rules`. They grant the admin email read/update/delete on `feedback/*` (with the admin-write fields locked down to `status`, `linearIssueUrl`, `triageNote`, `attachmentsArchivedToLinear`, and clearing `attachments`), and allow unauthenticated `feedback/*` create from iOS with strict shape validation. Deploy with `firebase deploy --only firestore`.
- Storage rules live in this repo as `storage.rules` (deploy with `firebase deploy --only storage`). They allow create on `feedback-attachments/{feedbackId}/{filename}` (size + content-type gated; iOS uploads anonymously, mirroring Firestore), allow public read so downloadURLs work in the admin UI and the Worker, and allow delete only for the admin email.

### Local development

Copy `.env.example` to `.env.local` and fill in your Firebase web SDK config. To exercise the Worker locally (handler + assets):

```bash
npm run build
npx wrangler dev
```

`wrangler dev` reads `.dev.vars` for the `LINEAR_API_KEY`. Create one (gitignored via `*.local` + add `.dev.vars` to `.gitignore` if needed) with:

```
LINEAR_API_KEY=<your-linear-key>
```

### Regenerating Worker types

If you change `wrangler.jsonc`, regenerate the typed env with:

```bash
npx wrangler types
```

This rewrites `worker-configuration.d.ts` (committed to the repo).

### Firebase deploys

The website depends on Firebase rules + functions deployed from this repo:

- **Storage rules** — `storage.rules`. Deploy with:

  ```bash
  firebase deploy --only storage
  ```

  Run this whenever `storage.rules` changes.

- **Firestore rules** — `firestore.rules`. Deploy with:

  ```bash
  firebase deploy --only firestore
  ```

- **Cloud Functions** — `functions/`. Deploy with `firebase deploy --only functions`.
