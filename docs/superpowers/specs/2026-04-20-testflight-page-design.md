# TestFlight Page — Design

**Date:** 2026-04-20
**Status:** Proposed

## Summary

Add a `/testflight` page to the FlightOps Log website that invites visitors to join the public TestFlight beta, walks non-technical testers through installing TestFlight and accepting the invite, and tells them how to send feedback. In the same change, consolidate the handful of existing hardcoded "Download on the App Store" anchors into a single `DownloadCTA` component so every call-to-action on the site points at `/testflight` while the app is pre-launch, and flipping to the App Store later is a one-file edit.

## Motivation

The app is not on the App Store yet. The public beta on TestFlight is currently the only way to get FlightOps Log. The homepage and every subpage currently advertise a "Download on the App Store" button that links to `https://apps.apple.com` — a placeholder that is effectively a dead link and actively hurts trust. The user also wants to run the beta for friends and friends-of-friends, meaning some testers will be non-technical and have never used TestFlight.

This change:

1. Removes the dead App Store link in favor of a live TestFlight CTA.
2. Gives non-technical testers a step-by-step page they can be directed to.
3. Frames the app honestly as beta software so testers give feedback instead of leaving reviews for a shipped product.
4. Centralizes the download CTA so the eventual switch back to an App Store URL is trivial.

## Non-goals

- No feedback form that posts to a backend. Feedback is routed to TestFlight's built-in "Share Beta Feedback" flow (for bugs with auto-attached diagnostics) and to `support@flightopslog.com` via `mailto:` (for longer feedback and questions). A backend-backed form can be added later if beta volume makes it worth the cost; it is not required today.
- No dual App-Store-and-TestFlight messaging. While the app is pre-launch, the CTA says "Try the public beta." When the App Store listing goes live, the CTA flips wholesale in one place.
- No tester analytics, no signup capture, no per-invite tracking.
- No countdown, release date, or roadmap messaging on the page.

## Architecture

### Route

Add a new route to `src/main.tsx`:

```tsx
<Route path="/testflight" element={<TestFlight />} />
```

### Page component

New file `src/pages/TestFlight.tsx`, following the same shell pattern as `src/pages/Support.tsx` and `src/pages/ImportTemplate.tsx`:

- Top nav (logo → `/`, DownloadCTA on the right)
- Article body with the content sections listed below
- Footer with links to Privacy, Support, Import Template, and TestFlight itself

### Shared `DownloadCTA` component

New file `src/components/DownloadCTA.tsx` (creates the `src/components/` directory, which does not yet exist).

Purpose: one source of truth for the primary CTA that today is replicated as a hardcoded `<a href="https://apps.apple.com">Download on the App Store</a>` across `src/App.tsx` (twice — nav and hero), `src/pages/PrivacyPolicy.tsx`, `src/pages/Support.tsx`, and `src/pages/ImportTemplate.tsx`.

Props:

```ts
type DownloadCTAProps = {
  size?: 'compact' | 'large'  // default: 'compact'
  className?: string          // optional extra classes
}
```

Behavior today:

- `href` → `/testflight` (an internal route — uses `react-router-dom`'s `Link`).
- Copy: `size="compact"` → **"Try the public beta"**; `size="large"` → **"Join the public beta on TestFlight"**.
- Styling: mirrors the existing CTA classes verbatim so there is no visual regression.
  - `compact`: `bg-action text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity`
  - `large`: `bg-action text-white px-8 py-3 rounded-xl text-lg font-semibold hover:opacity-90 transition-opacity`

Behavior after App Store launch (out of scope for this change, but design constraint):

- Flipping to App Store becomes two edits inside this one file: change the `Link`/`<a>` target to the App Store URL and change the two copy strings. No other file in the repo needs to touch to swap the CTA.

### Content entry point

The TestFlight invite URL lives in exactly one place in the new page: the primary "Join the Beta" button on `src/pages/TestFlight.tsx`. It is **not** put in the shared `DownloadCTA`, because `DownloadCTA` points at the page, not at TestFlight directly. URL:

```
https://testflight.apple.com/join/x77FsCXN
```

### Discoverability

1. **Home nav + hero** — both use `DownloadCTA` (compact and large respectively).
2. **Subpage navs** — every existing subpage (`Support`, `PrivacyPolicy`, `ImportTemplate`) swaps its hardcoded anchor for `<DownloadCTA />`.
3. **Footer link** — add a **Beta** link pointing at `/testflight` in the footer of every page (`App.tsx`, `Support.tsx`, `PrivacyPolicy.tsx`, `ImportTemplate.tsx`, and the new `TestFlight.tsx` itself).
4. **No new hero treatment on the homepage.** The homepage hero already sells the app; the beta framing happens on the dedicated page.

## Page content

Five sections.

### 1. Hero

- App icon (`src/assets/logo.png`), large rounded.
- Headline: **"FlightOps Log — Public Beta"**
- Subhead: *A professional pilot logbook built for military and civilian aviators. Free, in active development, and open to anyone who wants to help shape it.*
- Primary button: **"Join the Beta"** → `https://testflight.apple.com/join/x77FsCXN` (opens in the same tab so iOS deep-links into TestFlight).
- Small caption under the button: *Requires an iPhone running iOS 17 or later.*

### 2. What to expect

Short bulleted list, framed honestly:

- You're testing pre-release software — things may change, break, or look rough in spots.
- Updates roll out often. TestFlight will notify you when a new build is available.
- Your flight data is safe — the beta uses the same iCloud sync as release builds. Keeping a CSV export as a backup is still a good habit.
- The beta automatically expires when a new build replaces it; TestFlight handles the upgrade for you.

### 3. How to install (progressive disclosure)

Default view is a single, confident instruction under the primary button in the hero — "Tap **Join the Beta** above on your iPhone." Below the hero, a collapsible `<details>` block titled **"First time using TestFlight?"** expands to a four-step numbered list:

1. Install Apple's **TestFlight** app from the App Store.
2. Tap **Join the Beta** above on your iPhone.
3. Accept the invitation in TestFlight.
4. Tap **Install** to get FlightOps Log.

The `<details>` element matches the existing FAQ collapse pattern in `Support.tsx`, so styling is consistent and no new primitives are introduced.

### 4. Sending feedback

Two short paragraphs with clear headings:

- **Quick bugs and screenshots** — "Take a screenshot in FlightOps Log, then tap **Share Beta Feedback**. TestFlight attaches device info and diagnostics automatically."
- **Ideas, questions, longer feedback** — "Email [support@flightopslog.com](mailto:support@flightopslog.com?subject=FlightOps%20Log%20Beta%20Feedback) — the subject is pre-filled so we can route it quickly."

Both channels are equally weighted. No form, no embedded widget.

### 5. Footer

Same footer as the other pages, now also including a link back to `/testflight` (labeled **Beta**). Present on every page for consistency.

## Styling

Reuse existing Tailwind tokens (`bg-surface`, `text-primary`, `bg-card`, `text-action`, `text-secondary-text`, etc.). Match visual style and spacing of `Support.tsx` and `ImportTemplate.tsx`. No new design tokens, no new CSS files.

The large CTA inside the TestFlight page hero (the one that links directly to `testflight.apple.com`) uses the same class string as `DownloadCTA size="large"` so the page looks consistent with the rest of the site, but it is a separate element because it points at an external URL rather than at `/testflight`.

## Data flow

None. Fully static page with two outbound links (TestFlight invite, `mailto:`). No state, no API, no persistence.

## Error handling

- If the TestFlight invite is revoked or expires, the link on TestFlight's side 404s — nothing on the website needs to change. Accepted; mitigated by owning `/testflight` as our URL so we can swap the upstream target later without breaking shared links.
- No client-side failure modes on the page itself.

## Testing

- `npm run build` — no errors or warnings.
- `npm run dev` — visit `/testflight`; verify the page renders, the "Join the Beta" button points at `https://testflight.apple.com/join/x77FsCXN`, the `<details>` expands, the email link has the pre-filled subject, and the footer contains a **Beta** link.
- From `/`, click the **Try the public beta** button in the nav and in the hero — both should navigate to `/testflight` with no full page reload (react-router `Link`).
- From `/support`, `/privacy`, and `/import-template`, click the nav CTA — each should navigate to `/testflight`.
- Verify the **Beta** footer link appears on every page (`/`, `/support`, `/privacy`, `/import-template`, `/testflight`) and routes correctly.
- Verify direct-URL access to `/testflight` works on the deployed Cloudflare Pages site (tests SPA routing for the new route via `public/_redirects`).

## Rollback plan

Entire change is additive to the routing table plus a refactor of existing CTAs. Rolling back is a single `git revert`. The `DownloadCTA` component has no external dependencies; deleting it and restoring the hardcoded anchors is trivial if needed.

## Future work (not in this change)

- When the App Store listing goes live, edit `src/components/DownloadCTA.tsx` only: change the target URL and the two copy strings. The TestFlight page itself stays as a secondary beta channel, or is deleted and its route removed.
- If beta volume outgrows email triage, replace the `mailto:` link on `/testflight` with a small feedback form backed by a database. This is explicitly a later upgrade — the spec's Non-goals call this out.

## Out of scope

- Any kind of tester signup capture or analytics.
- Localization.
- Changes to the iOS app itself.
- A dedicated "beta changelog" page listing what's new in each build.
