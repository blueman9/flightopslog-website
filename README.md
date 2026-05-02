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
- Sign-in uses Firebase Auth's Google provider client-side; the admin email is checked in three places: the SPA (`src/admin/AdminApp.tsx`), Firestore security rules, and the Cloudflare Pages Function.
- Convert-to-Linear posts to a Pages Function at `/api/linear-create-issue`. The Function verifies the Firebase ID token via `jose` and Google's JWKS, then calls the Linear GraphQL API with a Workers secret. The API key never reaches the browser.

### Deployment requirements

**Cloudflare Pages env vars (production):**

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN` (e.g. `flightopslog.firebaseapp.com`)
- `VITE_FIREBASE_PROJECT_ID` (`flightopslog`)
- `VITE_FIREBASE_APP_ID`

**Cloudflare Pages secret (for the Function):**

- `LINEAR_API_KEY` — set via `npx wrangler pages secret put LINEAR_API_KEY` or in the Pages dashboard.

**Firebase:**

- Add `flightopslog.com` (and any preview domains) to Firebase Auth → Sign-in method → Authorized domains.
- The Firestore security rules in the **iOS app repo** must grant the admin email read/update/delete on `feedback/*`. See `docs/superpowers/specs/2026-05-01-admin-feedback-dashboard-design.md` for the rules diff.

### Local development

Copy `.env.example` to `.env.local` and fill in your Firebase web SDK config. To exercise the Pages Function locally:

```bash
npm run build
npx wrangler pages dev dist --binding LINEAR_API_KEY=<your-linear-key>
```
