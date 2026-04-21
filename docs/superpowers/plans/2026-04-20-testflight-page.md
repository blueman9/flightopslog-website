# TestFlight Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/testflight` page that invites visitors to join the public beta and walks non-technical testers through TestFlight, and consolidate all existing "Download on the App Store" anchors into one shared `DownloadCTA` component pointing at `/testflight`.

**Architecture:** New React component `src/components/DownloadCTA.tsx` replaces hardcoded app-store links in four existing pages. New page `src/pages/TestFlight.tsx` follows the shell pattern from `Support.tsx` and `ImportTemplate.tsx`. One new route in `src/main.tsx`. "Beta" footer link added to every page's footer. No new dependencies. No new tests (project has no test framework today — verification is `npm run build` plus a dev-server smoke check).

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, react-router-dom. No new packages.

**Spec:** `docs/superpowers/specs/2026-04-20-testflight-page-design.md`

---

## Pre-flight

- [ ] **Step 0.1: Pull latest**

CLAUDE.md requires this at the start of every session.

```bash
git pull origin main --rebase
```

Expected: fast-forward or already up to date.

- [ ] **Step 0.2: Install deps (if node_modules missing)**

```bash
[ -d node_modules ] && echo "ok" || npm install
```

Expected: `ok` (or a clean install).

- [ ] **Step 0.3: Baseline build**

Establish a green baseline before touching code, so any later failure is clearly attributable to this work.

```bash
npm run build
```

Expected: build succeeds with no errors.

---

## Task 1: Create the `DownloadCTA` component

**Files:**
- Create: `src/components/DownloadCTA.tsx`

The `src/components/` directory does not exist yet. Vite + TypeScript will pick up the new file with no configuration changes.

- [ ] **Step 1.1: Create the component**

Create `src/components/DownloadCTA.tsx` with this exact content:

```tsx
import { Link } from 'react-router-dom'

type DownloadCTAProps = {
  size?: 'compact' | 'large'
  className?: string
}

const compactClasses =
  'bg-action text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity'
const largeClasses =
  'bg-action text-white px-8 py-3 rounded-xl text-lg font-semibold hover:opacity-90 transition-opacity'

function DownloadCTA({ size = 'compact', className }: DownloadCTAProps) {
  const label =
    size === 'large' ? 'Join the public beta on TestFlight' : 'Try the public beta'
  const base = size === 'large' ? largeClasses : compactClasses

  return (
    <Link to="/testflight" className={className ? `${base} ${className}` : base}>
      {label}
    </Link>
  )
}

export default DownloadCTA
```

- [ ] **Step 1.2: Type-check**

```bash
npm run build
```

Expected: build succeeds. The file is not yet imported anywhere, so Vite may warn about an unused module — that is fine and will resolve in Task 2. If TypeScript errors appear, fix them here before moving on.

- [ ] **Step 1.3: Commit**

```bash
git add src/components/DownloadCTA.tsx
git commit -m "$(cat <<'EOF'
feat: add DownloadCTA component pointing at /testflight

Consolidates the primary CTA used across the site. Today it links
to /testflight while the app is pre-launch; switching to an App
Store URL later is a single-file edit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Swap hardcoded links on the homepage

**Files:**
- Modify: `src/App.tsx`

The homepage currently has two hardcoded `<a href="https://apps.apple.com">` blocks — one in the nav (compact) and one in the hero (large). Both get replaced with `DownloadCTA`.

- [ ] **Step 2.1: Replace the nav anchor**

In `src/App.tsx`, replace this block (currently around lines 13–18):

```tsx
        <a
          href="https://apps.apple.com"
          className="bg-action text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Download on the App Store
        </a>
```

with:

```tsx
        <DownloadCTA />
```

- [ ] **Step 2.2: Replace the hero anchor**

In the same file, replace this block (currently around lines 36–41):

```tsx
        <a
          href="https://apps.apple.com"
          className="bg-action text-white px-8 py-3 rounded-xl text-lg font-semibold hover:opacity-90 transition-opacity"
        >
          Get it free on the App Store
        </a>
```

with:

```tsx
        <DownloadCTA size="large" />
```

- [ ] **Step 2.3: Add the import**

Add this import near the top of `src/App.tsx`, alongside the existing imports:

```tsx
import DownloadCTA from './components/DownloadCTA'
```

- [ ] **Step 2.4: Verify**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 2.5: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
refactor: use DownloadCTA on the homepage

Replaces the two hardcoded apps.apple.com placeholder anchors
(nav and hero) with the shared DownloadCTA component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Swap hardcoded links on subpage navs

**Files:**
- Modify: `src/pages/Support.tsx`
- Modify: `src/pages/PrivacyPolicy.tsx`
- Modify: `src/pages/ImportTemplate.tsx`

Each of these three pages has exactly one hardcoded `<a href="https://apps.apple.com">` in its top nav. Same pattern on all three.

- [ ] **Step 3.1: Update `Support.tsx`**

In `src/pages/Support.tsx`, replace this block (currently around lines 54–59):

```tsx
        <a
          href="https://apps.apple.com"
          className="bg-action text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Download on the App Store
        </a>
```

with:

```tsx
        <DownloadCTA />
```

Add the import near the existing imports:

```tsx
import DownloadCTA from '../components/DownloadCTA'
```

- [ ] **Step 3.2: Update `PrivacyPolicy.tsx`**

In `src/pages/PrivacyPolicy.tsx`, replace this block (currently around lines 13–18):

```tsx
        <a
          href="https://apps.apple.com"
          className="bg-action text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Download on the App Store
        </a>
```

with:

```tsx
        <DownloadCTA />
```

Add the import:

```tsx
import DownloadCTA from '../components/DownloadCTA'
```

- [ ] **Step 3.3: Update `ImportTemplate.tsx`**

In `src/pages/ImportTemplate.tsx`, replace this block (currently around lines 23–28):

```tsx
        <a
          href="https://apps.apple.com"
          className="bg-action text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Download on the App Store
        </a>
```

with:

```tsx
        <DownloadCTA />
```

Add the import:

```tsx
import DownloadCTA from '../components/DownloadCTA'
```

- [ ] **Step 3.4: Confirm no other app-store anchors remain**

```bash
grep -rn "apps.apple.com" src/ public/ || echo "none found"
```

Expected: `none found`. If any remain, they should have been caught in Task 2 or Task 3 — update them to use `DownloadCTA` and add to this step's commit.

- [ ] **Step 3.5: Verify**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3.6: Commit**

```bash
git add src/pages/Support.tsx src/pages/PrivacyPolicy.tsx src/pages/ImportTemplate.tsx
git commit -m "$(cat <<'EOF'
refactor: use DownloadCTA on subpage navs

Replaces the hardcoded apps.apple.com placeholder anchors on the
Support, Privacy, and Import Template page navs with the shared
DownloadCTA component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create the TestFlight page component

**Files:**
- Create: `src/pages/TestFlight.tsx`

This is the main deliverable. Follows the exact shell pattern of `Support.tsx` (nav / article / footer) and reuses the local `Section` helper pattern for consistency.

- [ ] **Step 4.1: Create the page**

Create `src/pages/TestFlight.tsx` with this exact content:

```tsx
import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'
import DownloadCTA from '../components/DownloadCTA'

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/x77FsCXN'
const FEEDBACK_EMAIL =
  'mailto:support@flightopslog.com?subject=FlightOps%20Log%20Beta%20Feedback'

function TestFlight() {
  return (
    <div className="min-h-screen bg-surface text-primary">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <Link to="/" className="flex items-center gap-3 no-underline text-primary">
          <img src={logo} alt="FlightOps Log" className="w-10 h-10 rounded-lg" />
          <span className="text-xl font-bold tracking-tight">FlightOps Log</span>
        </Link>
        <DownloadCTA />
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-12 pb-8 max-w-3xl mx-auto">
        <img
          src={logo}
          alt="FlightOps Log app icon"
          className="w-24 h-24 rounded-2xl shadow-lg mb-6"
        />
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
          FlightOps Log <span className="text-accent">Public Beta</span>
        </h1>
        <p className="text-secondary-text text-lg max-w-xl mb-6">
          A professional pilot logbook built for military and civilian aviators.
          Free, in active development, and open to anyone who wants to help shape it.
        </p>
        <a
          href={TESTFLIGHT_URL}
          className="bg-action text-white px-8 py-3 rounded-xl text-lg font-semibold hover:opacity-90 transition-opacity"
        >
          Join the Beta
        </a>
        <p className="text-secondary-text text-sm mt-3">
          Requires an iPhone running iOS 17 or later.
        </p>
      </section>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-8">
        <div className="space-y-10 text-[15px] leading-relaxed">
          <Section title="What to expect">
            <ul className="list-disc list-outside ml-5 space-y-2">
              <li>
                You're testing pre-release software — things may change, break, or
                look rough in spots.
              </li>
              <li>
                Updates roll out often. TestFlight will notify you when a new build
                is available.
              </li>
              <li>
                Your flight data is safe — the beta uses the same iCloud sync as
                release builds. Keeping a CSV export as a backup is still a good
                habit.
              </li>
              <li>
                Beta builds automatically expire when a new build replaces them —
                TestFlight handles the upgrade for you.
              </li>
            </ul>
          </Section>

          <Section title="How to install">
            <p className="mb-3">
              Already have TestFlight? Tap <strong>Join the Beta</strong> above on
              your iPhone — that's it.
            </p>
            <details className="bg-card rounded-lg border border-secondary-text/20">
              <summary className="font-semibold cursor-pointer px-4 py-3">
                First time using TestFlight?
              </summary>
              <div className="px-4 pb-4 text-secondary-text">
                <ol className="list-decimal list-outside ml-5 space-y-2">
                  <li>
                    Install Apple's <strong>TestFlight</strong> app from the App
                    Store.
                  </li>
                  <li>
                    Tap <strong>Join the Beta</strong> above on your iPhone.
                  </li>
                  <li>Accept the invitation in TestFlight.</li>
                  <li>
                    Tap <strong>Install</strong> to get FlightOps Log.
                  </li>
                </ol>
              </div>
            </details>
          </Section>

          <Section title="Sending feedback">
            <p className="mb-3">
              <strong>Quick bugs and screenshots.</strong> Take a screenshot in
              FlightOps Log, then tap <strong>Share Beta Feedback</strong>.
              TestFlight attaches device info and diagnostics automatically.
            </p>
            <p>
              <strong>Ideas, questions, longer feedback.</strong> Email{' '}
              <a href={FEEDBACK_EMAIL} className="text-action underline">
                support@flightopslog.com
              </a>{' '}
              — the subject is pre-filled so we can route it quickly.
            </p>
          </Section>
        </div>
      </article>

      {/* Footer */}
      <footer className="text-center text-secondary-text text-sm py-8 border-t border-secondary-text/20">
        <p>&copy; {new Date().getFullYear()} FlightOps Log. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/privacy" className="text-secondary-text hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link to="/support" className="text-secondary-text hover:text-primary transition-colors">
            Support
          </Link>
          <Link to="/import-template" className="text-secondary-text hover:text-primary transition-colors">
            Import Template
          </Link>
          <Link to="/testflight" className="text-secondary-text hover:text-primary transition-colors">
            Beta
          </Link>
        </div>
      </footer>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      {children}
    </section>
  )
}

export default TestFlight
```

- [ ] **Step 4.2: Verify the page compiles**

```bash
npm run build
```

Expected: build succeeds. The page is not yet reachable (no route registered yet) — that's done in Task 5. The build should still succeed because the file is syntactically correct and all imports resolve.

Note: the file will not actually be bundled until it is imported from `main.tsx`. Do not move on assuming the page is live yet.

- [ ] **Step 4.3: Commit**

```bash
git add src/pages/TestFlight.tsx
git commit -m "$(cat <<'EOF'
feat: add TestFlight page

Invites visitors to join the public beta and walks non-technical
testers through installing TestFlight and sending feedback. Not
yet routed — route is wired in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Register the `/testflight` route

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 5.1: Add the import**

In `src/main.tsx`, add this import alongside the existing page imports:

```tsx
import TestFlight from './pages/TestFlight.tsx'
```

- [ ] **Step 5.2: Add the route**

Add this `<Route>` inside the existing `<Routes>` block, alongside the others:

```tsx
<Route path="/testflight" element={<TestFlight />} />
```

After the change, the full routes block should look like:

```tsx
<Routes>
  <Route path="/" element={<App />} />
  <Route path="/privacy" element={<PrivacyPolicy />} />
  <Route path="/support" element={<Support />} />
  <Route path="/import-template" element={<ImportTemplate />} />
  <Route path="/testflight" element={<TestFlight />} />
</Routes>
```

- [ ] **Step 5.3: Verify**

```bash
npm run build
```

Expected: build succeeds. `TestFlight.tsx` is now reachable and will be included in the bundle.

- [ ] **Step 5.4: Commit**

```bash
git add src/main.tsx
git commit -m "$(cat <<'EOF'
feat: wire /testflight route

Makes the TestFlight page reachable. The DownloadCTA component,
already present site-wide, now resolves to this page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add the "Beta" footer link to every existing page

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Support.tsx`
- Modify: `src/pages/PrivacyPolicy.tsx`
- Modify: `src/pages/ImportTemplate.tsx`

The TestFlight page already has the Beta link in its footer (added in Task 4). This task adds the same link to every other page for consistent navigation.

- [ ] **Step 6.1: Update the homepage footer**

In `src/App.tsx`, find the footer nav block. It currently looks like:

```tsx
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/privacy" className="text-secondary-text hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link to="/support" className="text-secondary-text hover:text-primary transition-colors">
            Support
          </Link>
          <Link to="/import-template" className="text-secondary-text hover:text-primary transition-colors">
            Import Template
          </Link>
        </div>
```

Add the Beta link as the last item:

```tsx
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/privacy" className="text-secondary-text hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link to="/support" className="text-secondary-text hover:text-primary transition-colors">
            Support
          </Link>
          <Link to="/import-template" className="text-secondary-text hover:text-primary transition-colors">
            Import Template
          </Link>
          <Link to="/testflight" className="text-secondary-text hover:text-primary transition-colors">
            Beta
          </Link>
        </div>
```

- [ ] **Step 6.2: Update the Support footer**

In `src/pages/Support.tsx`, the footer currently has only Privacy and Import Template links (no self-link to Support). Add both Support (for consistency with other footers) and Beta. The block currently looks like:

```tsx
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/privacy" className="text-secondary-text hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link to="/import-template" className="text-secondary-text hover:text-primary transition-colors">
            Import Template
          </Link>
        </div>
```

Change to:

```tsx
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/privacy" className="text-secondary-text hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link to="/import-template" className="text-secondary-text hover:text-primary transition-colors">
            Import Template
          </Link>
          <Link to="/testflight" className="text-secondary-text hover:text-primary transition-colors">
            Beta
          </Link>
        </div>
```

(Intentionally leaving Support off its own footer — that matches the existing Privacy and Import Template pages, which also don't self-link.)

- [ ] **Step 6.3: Update the Privacy Policy footer**

In `src/pages/PrivacyPolicy.tsx`, the footer currently looks like:

```tsx
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/support" className="text-secondary-text hover:text-primary transition-colors">
            Support
          </Link>
          <Link to="/import-template" className="text-secondary-text hover:text-primary transition-colors">
            Import Template
          </Link>
        </div>
```

Change to:

```tsx
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/support" className="text-secondary-text hover:text-primary transition-colors">
            Support
          </Link>
          <Link to="/import-template" className="text-secondary-text hover:text-primary transition-colors">
            Import Template
          </Link>
          <Link to="/testflight" className="text-secondary-text hover:text-primary transition-colors">
            Beta
          </Link>
        </div>
```

- [ ] **Step 6.4: Update the Import Template footer**

In `src/pages/ImportTemplate.tsx`, the footer currently looks like:

```tsx
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/privacy" className="text-secondary-text hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link to="/support" className="text-secondary-text hover:text-primary transition-colors">
            Support
          </Link>
          <Link to="/import-template" className="text-secondary-text hover:text-primary transition-colors">
            Import Template
          </Link>
        </div>
```

Change to:

```tsx
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/privacy" className="text-secondary-text hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link to="/support" className="text-secondary-text hover:text-primary transition-colors">
            Support
          </Link>
          <Link to="/testflight" className="text-secondary-text hover:text-primary transition-colors">
            Beta
          </Link>
        </div>
```

(Removes the self-link to Import Template, consistent with Privacy and Support footers.)

- [ ] **Step 6.5: Verify**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 6.6: Commit**

```bash
git add src/App.tsx src/pages/Support.tsx src/pages/PrivacyPolicy.tsx src/pages/ImportTemplate.tsx
git commit -m "$(cat <<'EOF'
feat: add Beta footer link on every page

Points at /testflight. Also drops a couple of self-links in the
Support and Import Template footers so footers match the pattern
already used on Privacy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final verification

**No file changes. This is a smoke-test checklist before pushing.**

- [ ] **Step 7.1: Clean build**

```bash
npm run build
```

Expected: build succeeds with no errors or warnings. Any TypeScript or Vite warning must be investigated before declaring done.

- [ ] **Step 7.2: Dev server smoke check**

Run:

```bash
npm run dev
```

Open the Local URL printed in the terminal (typically `http://localhost:5173/`) and manually verify:

- [ ] Home (`/`) renders. Nav "Try the public beta" button and hero "Join the public beta on TestFlight" button both navigate to `/testflight`.
- [ ] `/testflight` renders with hero, "What to expect," "How to install" (expand the `<details>` to confirm), and "Sending feedback" sections.
- [ ] `/testflight` "Join the Beta" button points at `https://testflight.apple.com/join/x77FsCXN` (inspect the anchor or right-click → Copy Link).
- [ ] `/testflight` email link has `subject=FlightOps%20Log%20Beta%20Feedback` in the `mailto:` URL.
- [ ] `/support`, `/privacy`, `/import-template`: nav CTA navigates to `/testflight`; **Beta** footer link navigates to `/testflight`.
- [ ] No console errors on any page.

Stop the dev server (`Ctrl+C`) when done.

- [ ] **Step 7.3: Confirm all app-store placeholders are gone**

```bash
grep -rn "apps.apple.com" src/ public/ || echo "none found"
```

Expected: `none found`.

- [ ] **Step 7.4: Push**

```bash
git push origin main
```

Expected: push succeeds. Cloudflare Pages will auto-deploy from `main`.

---

## Self-review (done during plan authoring)

**Spec coverage:**
- New `/testflight` page — Task 4 + Task 5.
- DownloadCTA component with `compact`/`large` variants — Task 1.
- Replace site-wide placeholder anchors — Task 2 (homepage, 2 instances) + Task 3 (three subpages).
- Hero with TestFlight URL + iOS 17 caption — Task 4.
- "What to expect" bullets — Task 4.
- Progressive "How to install" with `<details>` — Task 4.
- Feedback section with TestFlight + `mailto:` — Task 4.
- Beta footer link on every page — Task 4 (TestFlight itself) + Task 6 (every other page).
- Cloudflare SPA routing — relies on existing `public/_redirects`; no change needed (verified manually as part of Step 7.2 and post-deploy).

**Placeholder scan:** No TBD/TODO/"fill in details"/"handle edge cases" in the plan. All code blocks are complete and copy-pasteable.

**Type consistency:** `DownloadCTAProps` shape (`size?: 'compact' | 'large'`; `className?: string`) is stable across Tasks 1, 2, 3, and 4. The component's prop spelling matches everywhere it's called.
