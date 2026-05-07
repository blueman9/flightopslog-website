# FL-63 — Feedback attachments (website side)

**Status:** approved
**Date:** 2026-05-06
**Linear:** [FL-63](https://linear.app/blueman9/issue/FL-63/is-there-a-way-to-upload-files-or-screenshots)
**Companion iOS spec:** `docs/superpowers/specs/2026-05-06-fl-63-feedback-attachments-design.md` (in iOS repo)

## Context

The iOS app now uploads up to 3 images and 1 CSV per feedback to Firebase Storage at `feedback-attachments/{feedbackId}/{filename}` and writes references onto the Firestore feedback doc. The website's admin dashboard at `/admin` must:

1. Display attachments alongside each feedback row.
2. Upload attachment bytes to the corresponding Linear issue when feedback is converted to Linear, so the Linear issue holds a permanent copy.
3. Provide an admin-controlled cleanup that deletes Storage objects after the Linear copy is safe (or for discarded feedback that never went to Linear).
4. Set up Firebase Storage rules that enforce the access model.

Without this, Firebase Storage will fill up against the 5 GB free tier within a few hundred attachments.

## Goals

- Attachments visible on each feedback row when expanded.
- Convert-to-Linear preserves attachments by uploading their bytes to Linear (not just URL pointers).
- Storage cleanup is a single admin-initiated sweep, not per-row, and only acts on safely-eligible items.
- Storage rules deny anonymous deletes; only the admin email can delete.
- All-or-nothing semantics on attachment upload during issue creation, so we never mark a row as "archived to Linear" when it isn't.

## Non-goals

- Automatic / scheduled cleanup. Admin must click the sweep button.
- Showing attachments on individual Linear issues from the admin UI (admin can open the Linear issue if they want to verify).
- Per-attachment management (delete one image, retry one upload). Operations are per-feedback or global.
- Storage usage indicator. Skip until needed.
- Editing or rotating attachments before upload.

## Architecture

Four surfaces:

1. **Firestore `feedback` doc fields** — iOS writes `attachments[]` and `attachmentUploadFailures?`. Website adds one new field, `attachmentsArchivedToLinear?: boolean`, set after a successful Linear upload during convert-to-Linear.
2. **Cloudflare Worker** (`worker/handlers/`) — extends `linear-create-issue` to also upload attachment bytes to Linear, and adds a new `cleanup-attachments` endpoint that deletes Storage objects + clears the `attachments` array on each doc.
3. **React admin UI** (`src/admin/`) — renders attachments inline when a row is expanded, surfaces `attachmentUploadFailures` as a warning badge, adds a single "Clean up Storage" sweep button to the FeedbackList header.
4. **Firebase Storage rules** (`storage.rules` at repo root, deployed via Firebase CLI from this repo) — allow create from authenticated users (matching iOS path), allow read by anyone (downloadURL token is the actual gate), allow delete only for the admin email + verified, deny everything else.

Auth boundary stays the same as today: browser holds a Firebase ID token, sends it to the Worker as a Bearer token. Worker verifies via `jose` (already wired) and forwards the token to Firebase Storage REST API for deletes. Storage rules enforce admin email + verified.

## Data model

`Feedback` type in `src/admin/types.ts` gains:

```ts
export interface Attachment {
  kind: 'image' | 'csv'
  filename: string
  sizeBytes: number
  contentType: 'image/jpeg' | 'text/csv'
  downloadURL: string
}

export interface Feedback {
  // ... existing fields ...
  attachments?: Attachment[]                 // from iOS
  attachmentUploadFailures?: number          // from iOS, only present when > 0
  attachmentsArchivedToLinear?: boolean      // set by Worker after successful Linear upload
}
```

All three new fields are optional. Older docs from pre-attachment iOS builds won't have them.

### Firestore rules (admin-write fields)

The existing rules pattern allows specific admin-only fields on update via `hasOnly()` plus `!('field' in data)` enforcement (per memory note `feedback_firestore_rules_admin_fields.md`). The deployed rules need `attachmentsArchivedToLinear` added to that allow-list. Implementer must diff against the live rules, not just the spec.

## Worker endpoints

### `POST /api/linear-create-issue` (extended)

Same auth (`Bearer` Firebase ID token, admin email + verified). Request body extended:

```ts
{
  title: string
  description: string
  labels: string[]
  attachments?: Attachment[]   // NEW — browser passes the array straight through
}
```

Behavior:

1. Existing flow: resolve team id, resolve label ids, call `issueCreate`.
2. **New, only when `attachments` is non-empty:** for each attachment, in series:
   - `GET attachment.downloadURL` to fetch bytes (downloadURL has its own access token, no Firebase auth needed).
   - Linear `fileUpload(size, contentType, filename)` mutation to get a presigned upload URL.
   - `PUT` bytes to the presigned URL.
   - Linear `attachmentCreate({ issueId, url: <linearAssetUrl>, title: filename })` to attach.
3. **All-or-nothing:** if any per-file step fails, return `502 { error: 'attachment_upload_failed', issueUrl, identifier, detail }` so the browser can show a clear error and the admin still has a link to the orphan issue. The Linear issue is NOT rolled back. Leave it to the admin to delete the Linear issue manually if they want a clean retry.
4. On full success (or no attachments), return existing `{ id, url, identifier }` plus a new boolean `attachmentsArchivedToLinear: true` ONLY when attachments were actually uploaded. Browser writes that flag onto the Firestore doc alongside the existing `status: 'triaged'` and `linearIssueUrl` update.

Edge: feedback with no attachments behaves exactly like today.

### `POST /api/cleanup-attachments` (new)

Same auth. Request body:

```ts
{ feedbackIds: string[] }   // up to ~50 per call
```

Behavior, per id:

1. Read the Firestore doc via REST API (using the admin's forwarded ID token). Validate eligibility:
   - `status === 'triaged'`
   - `attachments` is non-empty
   - `attachmentsArchivedToLinear === true` OR `linearIssueUrl` is absent (discarded path)
   Skip ineligible with a per-id `{ status: 'skipped', detail }`.
2. For each `attachment` in the doc: `DELETE /v0/b/{bucket}/o/{encodedPath}` against Firebase Storage REST API, where `path = feedback-attachments/{feedbackId}/{filename}`. Use the admin's forwarded ID token. Treat 404 as success (idempotent).
3. After all deletes succeed for that doc, update the Firestore doc to remove the `attachments` field via REST PATCH with an updateMask that targets `attachments`. Do NOT touch `attachmentsArchivedToLinear`; it stays as historical record.
4. Per-feedback result: `{ feedbackId, status: 'cleaned' | 'skipped' | 'partial' | 'failed', detail? }`. `partial` means Storage deletes succeeded but Firestore patch failed; the next sweep will re-attempt and the 404-as-success rule keeps it idempotent.

Response shape: `{ results: PerFeedbackResult[], summary: { cleaned, skipped, partial, failed } }`.

### Worker secrets

No new secrets. Linear API key is reused. Firebase Storage / Firestore REST calls use the forwarded admin ID token.

### Worker code organization

- `worker/handlers/linear-create-issue.ts` — extended (existing file).
- `worker/handlers/cleanup-attachments.ts` — new.
- `worker/lib/firebase-rest.ts` — new helper module for `firestoreGet`, `firestorePatch`, `storageDelete` against the REST API. Centralizes URL construction, auth header, error handling. Keeps both handlers small and testable.
- `worker/lib/linear.ts` — new helper module factored out of `linear-create-issue.ts` (existing `linearGraphQL`, `resolveTeamId`, `resolveLabelIds`, plus new `uploadAttachmentToLinear`). Existing handler shrinks to coordination only.
- `worker/index.ts` — route `/api/cleanup-attachments` POST to the new handler.

The lib refactor is targeted improvement, not unrelated cleanup: both handlers need Firebase REST and the existing Linear handler has grown enough that extracting helpers makes the new attachment-upload code readable.

## UI changes

### `src/admin/types.ts`

Add `Attachment` interface and the three new optional fields on `Feedback` (as shown in Data model).

### `src/admin/FeedbackRow.tsx`

- **Collapsed row:** if `attachments?.length`, append a small badge `📎 N` after the preview text. If `attachmentUploadFailures && attachmentUploadFailures > 0`, show a separate red badge `⚠ N failed` (the iOS-reported failures, not website-side).
- **Expanded row:** new "Attachments" section between the body `<pre>` and `TriageNoteEditor`:
  - Image attachments: 96×96 thumbnails in a flex-wrap row, each `<a target="_blank" rel="noreferrer" href={downloadURL}>` wrapping `<img loading="lazy" />`. Filename + human-formatted size (KB/MB) shown beneath each.
  - CSV attachments: a row with paperclip icon, filename, size, "Download" link to `downloadURL`.
  - If `attachmentsArchivedToLinear === true` AND `attachments` is non-empty, show a small line: "Archived to Linear — eligible for storage cleanup."
- No per-row cleanup or attachment-management actions. Attachments are read-only here.

### `src/admin/FeedbackList.tsx`

- Header gets a new "Clean up Storage" button next to Refresh. Disabled when no eligible feedback. Label shows count: `Clean up Storage (N)`. Eligibility computed from already-loaded `items`: `status === 'triaged' AND attachments?.length AND (attachmentsArchivedToLinear === true OR !linearIssueUrl)`.
- Click: confirmation modal showing "About to delete K attachments across N feedback items, freeing ~X MB" with Confirm/Cancel.
- Confirm fires a single `POST /api/cleanup-attachments` with all eligible ids. Button shows spinner state. On response, patch local `items` (clear `attachments` for each cleaned id, no change for skipped/failed) and show toast: `"Cleaned N. Skipped K. Failed J."` using existing toast component.

### `src/admin/ConvertToLinearModal.tsx`

- Pass the feedback's `attachments` (if any) through in the `createLinearIssue` request.
- Show a small line "📎 N attachments will be uploaded to Linear" above the Create button when applicable, so the admin knows the click is heavier than usual.
- On `attachment_upload_failed` (new error code): keep modal open, show error with link to the orphan Linear issue and copy explaining that the issue exists but attachments did not upload; ask admin to delete the Linear issue manually if they want a clean retry. Do NOT auto-retry (would create duplicate issues).

### `src/admin/linearClient.ts`

- Extend `CreateIssueInput` with `attachments?: Attachment[]`.
- Extend `CreatedIssue` (or response handling) to read `attachmentsArchivedToLinear` from the Worker response.
- Add `cleanupAttachments(feedbackIds: string[]): Promise<CleanupResponse>` matching the existing pattern.
- Add `LinearError`-equivalent or reuse for the cleanup endpoint. Keep error code conventions consistent.

### New: `src/admin/CleanupConfirmModal.tsx` (or similar)

Small modal component for the cleanup confirmation. Reuses styling from `ConvertToLinearModal`. Could be inlined into `FeedbackList` if it stays under ~50 lines.

## Storage rules

New file `storage.rules` at repo root:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /feedback-attachments/{feedbackId}/{filename} {
      allow create: if request.auth != null
                    && request.resource.size < 6 * 1024 * 1024
                    && request.resource.contentType.matches('image/jpeg|text/csv');
      allow read: if true;
      allow delete: if request.auth != null
                    && request.auth.token.email == 'blueman9@gmail.com'
                    && request.auth.token.email_verified == true;
      allow update: if false;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

`firebase.json` updated to add a `storage` block:

```json
{
  "functions": [...existing...],
  "storage": { "rules": "storage.rules" }
}
```

Deploy command: `firebase deploy --only storage`. Added to README admin section as a manual step.

**Open verification at implementation time:** confirm whether iOS uploads with an authenticated Firebase user (in which case `request.auth != null` on `create` is correct) or anonymously (in which case the rule needs to drop the auth check). Cross-check with the iOS spec referenced above. If iOS uses anonymous Firebase auth, no rule change is needed.

`allow read: if true` — necessary because Firebase downloadURLs are intended for anonymous browser access (e.g., `<img>` tags). The `?token=...` query param on the URL is the access control. Worker also reads via the same URL, so this works for both.

## Error handling matrix

| Failure | Behavior |
|---|---|
| Linear issue create fails | Same as today — error in modal, doc unchanged. |
| Issue created, any attachment upload fails | Worker returns `502 attachment_upload_failed` with `issueUrl`/`identifier`. Modal: "Issue [FL-X] was created but couldn't upload attachments. Delete the Linear issue manually to retry." Doc NOT marked triaged, NOT archived. Row stays in default view. |
| Worker can't reach Storage during cleanup | Per-feedback result `failed`. Other feedback in batch continue. Toast summarizes. |
| Storage object 404 during cleanup | Treat as success for that file. Idempotent. |
| Firestore patch fails after Storage deletes | Per-feedback result `partial`. Storage objects are gone but `attachments` array still on doc. Next sweep retries. The 404-as-success rule means re-attempted deletes are no-ops. |
| Browser loses auth mid-sweep | Worker returns 401. Browser: "Sign out and back in." (matching existing pattern). |
| Attachment downloadURL expired/revoked | Worker GET returns non-2xx → counted as upload failure → all-or-nothing kicks in. |
| Worker request body too large (many attachments) | Caps from iOS side: 3 images @ 2 MB ≈ 6 MB + 1 CSV ≤ 5 MB = ~11 MB max. Worker streams uploads serially, doesn't buffer all in memory. |

## Testing strategy

- **Worker:** unit-test the new `firebase-rest` and `linear` helpers with `vitest` (or whatever the existing project uses; check `package.json` — currently no test runner is set up). For now, manual end-to-end testing in dev: submit feedback from a TestFlight build with attachments, verify it appears in admin, convert-to-Linear, verify Linear issue has attached files, run cleanup, verify Storage is empty.
- **UI:** test in `npm run dev` against real Firebase. Cover: feedback with 0/1/3 images, with CSV, with `attachmentUploadFailures > 0`, eligible vs ineligible cleanup states.
- **Storage rules:** Firebase emulator if convenient, otherwise verify by attempting a delete from a non-admin browser session and confirming permission-denied.
- **Build:** `npm run build` clean, no errors/warnings, before each commit.

No automated test suite is added in this task. Consistent with the existing admin code which is also manually tested. Acceptable because: (a) the surface area is small, (b) the project has no test infrastructure today, (c) introducing a test framework is out of scope.

## Implementation order

1. **Types + Storage rules + Firestore rules diff.** Foundation work; nothing functional yet.
2. **Worker `firebase-rest` lib + `linear` lib refactor.** Pure refactor of existing code into modules. Existing endpoint should still pass manual smoke test after this.
3. **Worker: extend `linear-create-issue` with attachment upload.** Test convert-to-Linear with a feedback that has attachments.
4. **Worker: new `cleanup-attachments` endpoint.** Test sweep with eligible/ineligible items.
5. **UI: render attachments on row.** Test display of various attachment shapes.
6. **UI: cleanup button + confirmation modal in FeedbackList.** End-to-end test sweep.
7. **README update + deploy doc.**
8. **Deploy storage rules + Worker.**

Each step ends with `npm run build` (no warnings), commit, and a manual smoke test where applicable.

## Risks

- Linear's `fileUpload` mutation requires CORS-friendly PUT to a presigned S3 URL. If S3 rejects the Worker's PUT for any reason (wrong content-type header, missing required headers), all uploads fail. Mitigation: test once with a real attachment before considering the convert-to-Linear path complete.
- Firestore rules update is fragile (per memory note). Mitigation: diff against deployed rules before pushing.
- Storage rules `allow create: if request.auth != null` may break iOS uploads if iOS is unauthenticated. Mitigation: verify iOS auth model from companion spec before deploying rules.

## References

- iOS spec: `docs/superpowers/specs/2026-05-06-fl-63-feedback-attachments-design.md` (in iOS repo)
- iOS plan: `docs/superpowers/plans/2026-05-06-fl-63-feedback-attachments.md` (in iOS repo)
- FL-63 handoff comment: https://linear.app/blueman9/issue/FL-63 (only comment, dated 2026-05-07)
- Memory: `feedback_firestore_rules_admin_fields.md` — rules update pattern
- Existing admin spec: `docs/superpowers/specs/2026-05-01-admin-feedback-dashboard-design.md`
