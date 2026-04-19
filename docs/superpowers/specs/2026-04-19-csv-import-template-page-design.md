# CSV Import Template Page — Design

**Date:** 2026-04-19
**Linear issue:** [FL-11 — CSV import template](https://linear.app/blueman9/issue/FL-11/csv-import-template)
**Status:** Proposed

## Summary

Add a `/import-template` page to the FlightOps Log website that lets users download a pre-formatted CSV template for bulk-importing existing flights into the iOS app, along with a concise guide to editing and re-exporting the file correctly in Excel, Numbers, or Google Sheets.

## Motivation

Pilots moving from paper logbooks, another app, or a spreadsheet need a way to enter existing flights in bulk. The iOS app supports CSV import under **Settings → Data Management → Import from CSV**, but without a canonical template users have to guess the expected columns and formats. FL-11 calls for a downloadable template and accompanying rules — a hosted tool is explicitly out of scope.

## Non-goals

- No in-browser CSV editor or validator
- No server-side processing (site remains fully static on Cloudflare Pages)
- No column-by-column reference manual — column headers in the CSV are self-descriptive; this page focuses on *how* to edit and save, not *what* each column means

## Architecture

### Route

Add a new route in `src/main.tsx`:

```tsx
<Route path="/import-template" element={<ImportTemplate />} />
```

### Page component

New file `src/pages/ImportTemplate.tsx`, following the same shell pattern as `src/pages/Support.tsx`:

- Top nav (logo → `/`, App Store CTA)
- Article body with the sections described in **Content** below
- Footer

### CSV asset

Copy the template to `public/flight_import_template.csv`. Cloudflare Pages serves `public/` contents at the site root, so the file is available at `/flight_import_template.csv`. No build-time processing needed.

### Download mechanism

A plain anchor tag with the `download` attribute:

```tsx
<a href="/flight_import_template.csv" download>
  Download flight_import_template.csv
</a>
```

No JavaScript, no Blob construction — browsers handle the rest. The filename is preserved on disk.

### Discoverability

1. **Footer link** — add "Import Template" next to "Privacy Policy" and "Support" in the footers of both `src/App.tsx` and `src/pages/Support.tsx` (and on the new page itself for consistency).
2. **Support FAQ entry** — add a new FAQ in `src/pages/Support.tsx`:
   > **Q:** How do I bulk import existing flights?
   > **A:** Download our CSV import template, fill it in, and import it in the app. See the full guide at [our import template page](/import-template).

## Page content

Five sections, each a small subsection on the page.

### 1. Download

- One prominent primary button: **Download flight_import_template.csv**
- One-line caption under it: *The template includes one example row showing the expected format — delete or overwrite it with your own flights.*

### 2. Quick steps

Numbered list:

1. Download the template above.
2. Open it in your spreadsheet app (Excel, Numbers, or Google Sheets).
3. Replace the example row with your flights — one row per flight.
4. Save or export the file as CSV (see the next section for per-app instructions).
5. Open the CSV on your iPhone or iPad and, in FlightOps Log, go to **Settings → Data Management → Import from CSV**.

### 3. Editing in Excel, Numbers, or Google Sheets

One subsection per app. Each tells the user exactly how to export back to a compatible CSV.

**Microsoft Excel**
- Edit normally.
- When saving: **File → Save As → CSV UTF-8 (Comma delimited) (*.csv)**.
- Do *not* use the plain "CSV (Comma delimited)" option — it can corrupt non-ASCII characters in remarks.

**Apple Numbers**
- Edit normally.
- Export: **File → Export To → CSV…**
- Expand **Advanced Options** and set **Text Encoding: Unicode (UTF-8)**.

**Google Sheets**
- Edit normally.
- Export: **File → Download → Comma Separated Values (.csv)**.
- Google Sheets uses UTF-8 by default — no extra settings needed.

Followed by a shared warning: *Spreadsheet apps will "helpfully" reformat dates and strip leading zeros from tail numbers. See the pitfalls below to work around this.*

### 4. Common pitfalls

Bulleted list:

- **Dates must stay in `YYYY-MM-DD` format** (e.g., `2024-11-15`). If your spreadsheet shows `11/15/2024`, format the Date column as **Text** before entering values, or reformat to ISO-style before saving.
- **Times are decimal hours, not `H:MM`** — use `1.5` for one and a half hours, not `1:30`.
- **Blank cells are fine.** Leave a column empty if it doesn't apply rather than entering `0` where there's no value to log — it keeps your totals honest.
- **Don't rename, remove, or reorder the header row.** The app matches columns by header name; changes here will break the import.
  - *Implementation TODO (before building): verify against the iOS app whether column order actually matters or whether only header names matter. Update this bullet accordingly. See **Open questions**.*
- **Tail numbers and flight numbers:** format those columns as **Text** so leading zeros survive save/export.
- **Remarks with commas are fine** — spreadsheet apps will auto-quote them on export. Don't add quotes manually.

### 5. Troubleshooting

Short paragraph:

> If the import fails, open your CSV in a plain text editor (TextEdit, Notepad) and confirm it's comma-separated and the original header row is intact. Still stuck? Email [support@flightopslog.com](mailto:support@flightopslog.com).

## Styling

Reuse existing Tailwind tokens (`bg-surface`, `text-primary`, `bg-card`, `text-action`, `text-secondary-text`, etc.). Match the visual style and spacing of `Support.tsx`. No new design tokens.

The download button uses the existing action-button treatment: `bg-action text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity`.

## Data flow

None — this is a static page with a single static asset download. No state, no API calls, no forms.

## Error handling

None needed for the page itself. If the static asset is missing (e.g., someone forgets to copy it into `public/`), the download link returns a 404 from Cloudflare Pages. The build verification step (`npm run build`) will not catch this — see **Testing**.

## Testing

- `npm run build` — no errors or warnings.
- `npm run dev` — visit `/import-template`; verify the page renders, footer link works, and clicking the download button saves `flight_import_template.csv` with the expected contents.
- Open the downloaded CSV in a spreadsheet app to confirm it's not corrupted.
- Verify the footer "Import Template" link appears on `/`, `/support`, `/privacy`, and `/import-template`.
- Verify the Support FAQ entry links to `/import-template` and the link works.
- Verify direct-URL access to `/import-template` works (tests the Cloudflare Pages SPA routing — there's no `_redirects` file currently, so this should use whatever mechanism replaced it).

## Open questions

- **Does the iOS app require columns in the exact order of the template, or does it match by header name regardless of order?** FL-11 raises this explicitly. The spec assumes order matters (conservative; safest guidance for users). Before or during implementation, verify against the iOS app import logic and update the "Don't rename, remove, or reorder" pitfall bullet to match reality. If order doesn't matter, soften to "Don't rename or remove headers — order can change, but names must match exactly."

## Out of scope

- An in-browser CSV builder/validator (FL-11 mentions this as a "would be cool" but lands on "just give them a template")
- Per-column reference documentation
- Localization
- Sample CSVs for specific aircraft types or mission profiles
