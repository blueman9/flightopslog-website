# FL-63 Feedback Attachments (Website) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add attachment display, Linear-archival, and admin-controlled Firebase Storage cleanup to the admin dashboard, plus deploy Firebase Storage rules.

**Architecture:** Cloudflare Worker handles Linear API and Firebase Storage REST operations (using forwarded admin ID tokens). React admin UI renders attachments inline on expanded rows and exposes a single global "Clean up Storage" sweep. All-or-nothing semantics on attachment upload. Storage rules enforce admin-only delete.

**Tech Stack:** TypeScript, React 19, Vite, Cloudflare Workers, Firebase (Auth, Firestore, Storage), Tailwind v4, Linear GraphQL API.

**Spec:** `docs/superpowers/specs/2026-05-06-fl-63-feedback-attachments-website-design.md`

**No automated test suite.** Project has no test runner today (per spec). Verification = `npm run build` clean + manual smoke test at each milestone.

---

## File map

**Create:**
- `storage.rules` — Firebase Storage security rules
- `worker/lib/firebase-rest.ts` — REST helpers for Firestore + Storage with bearer auth
- `worker/lib/linear.ts` — extracted Linear GraphQL helpers + new file upload helper
- `worker/handlers/cleanup-attachments.ts` — new endpoint
- `src/admin/AttachmentsBlock.tsx` — read-only attachment display (used in expanded row)
- `src/admin/CleanupModal.tsx` — confirmation modal for storage sweep

**Modify:**
- `firebase.json` — add `storage` block
- `src/admin/types.ts` — add `Attachment` interface, extend `Feedback`
- `src/admin/linearClient.ts` — pass attachments through, add `cleanupAttachments`
- `src/admin/FeedbackRow.tsx` — collapsed-row badges, expanded-row attachments section
- `src/admin/FeedbackList.tsx` — cleanup sweep button + result toast
- `src/admin/ConvertToLinearModal.tsx` — surface attachment count, pass through, handle partial-failure error
- `worker/handlers/linear-create-issue.ts` — extract helpers to lib, add attachment upload phase
- `worker/index.ts` — route new endpoint
- `README.md` — document storage rules deploy

---

## Task 1: Add `Attachment` type and extend `Feedback`

**Files:**
- Modify: `src/admin/types.ts`

- [ ] **Step 1: Edit `src/admin/types.ts`**

Replace the entire file with:

```ts
import type { Timestamp } from 'firebase/firestore'

export type FeedbackCategory = 'bug' | 'feature' | 'other' | 'question'
export type FeedbackStatus = 'new' | 'triaged'

export interface Attachment {
  kind: 'image' | 'csv'
  filename: string
  sizeBytes: number
  contentType: 'image/jpeg' | 'text/csv'
  downloadURL: string
}

export interface Feedback {
  id: string
  createdAt: Timestamp
  category: FeedbackCategory
  body: string
  status: FeedbackStatus
  subject?: string
  contactEmail?: string
  appVersion: string
  buildNumber: string
  iosVersion: string
  deviceModel: string
  locale: string
  flightCount: number
  pendingSyncCount: number
  conflictCount: number
  iCloudState: string
  originScreen: string
  logs?: string
  linearIssueUrl?: string
  triageNote?: string
  attachments?: Attachment[]
  attachmentUploadFailures?: number
  attachmentsArchivedToLinear?: boolean
}
```

- [ ] **Step 2: Verify build still passes**

Run: `npm run build`
Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/admin/types.ts
git commit -m "feat(admin): add Attachment type and extend Feedback for FL-63

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add Firebase Storage rules

**Files:**
- Create: `storage.rules`
- Modify: `firebase.json`

- [ ] **Step 1: Create `storage.rules`**

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

- [ ] **Step 2: Modify `firebase.json` to add storage block**

Read current contents, then add `"storage"` key. New full content:

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local"
      ],
      "predeploy": [
        "npm --prefix \"$RESOURCE_DIR\" run build"
      ]
    }
  ],
  "storage": {
    "rules": "storage.rules"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add storage.rules firebase.json
git commit -m "feat(storage): add Firebase Storage rules for feedback attachments

Allows authenticated create (size + content-type gated) and admin-only
delete on feedback-attachments/{feedbackId}/{filename}. Public read so
downloadURLs work in the admin UI and Worker.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Extract Linear helpers into `worker/lib/linear.ts`

Pure refactor. The existing `linear-create-issue.ts` has grown enough that extraction makes the upcoming attachment-upload code readable.

**Files:**
- Create: `worker/lib/linear.ts`
- Modify: `worker/handlers/linear-create-issue.ts`

- [ ] **Step 1: Create `worker/lib/linear.ts`**

```ts
const LINEAR_API = 'https://api.linear.app/graphql'

let cachedTeamId: string | null = null
const cachedLabelIds = new Map<string, string>()

export async function linearGraphQL(
  apiKey: string,
  query: string,
  variables?: object,
): Promise<Record<string, unknown>> {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Linear HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  const data = (await res.json()) as { data?: unknown; errors?: { message: string }[] }
  if (data.errors?.length) {
    throw new Error(`Linear: ${data.errors.map((e) => e.message).join('; ')}`)
  }
  return data.data as Record<string, unknown>
}

export async function resolveTeamId(apiKey: string, teamName: string): Promise<string> {
  if (cachedTeamId) return cachedTeamId
  const data = await linearGraphQL(
    apiKey,
    `query { teams(first: 100) { nodes { id name } } }`,
  )
  const nodes = (data.teams as { nodes: { id: string; name: string }[] }).nodes
  const team = nodes.find((t) => t.name === teamName)
  if (!team) {
    const available = nodes.map((t) => t.name).join(', ') || '(none)'
    throw new Error(`Team named "${teamName}" not found. Visible teams: ${available}`)
  }
  cachedTeamId = team.id
  return team.id
}

export async function resolveLabelIds(
  apiKey: string,
  teamId: string,
  names: string[],
): Promise<string[]> {
  const lower = names.map((n) => n.toLowerCase())
  const missing = lower.some((n) => !cachedLabelIds.has(n))
  if (missing) {
    const data = await linearGraphQL(
      apiKey,
      `query($teamId: String!) {
         team(id: $teamId) { labels { nodes { id name } } }
       }`,
      { teamId },
    )
    const labelNodes = (data.team as { labels: { nodes: { id: string; name: string }[] } })
      .labels.nodes
    for (const node of labelNodes) {
      cachedLabelIds.set(node.name.toLowerCase(), node.id)
    }
  }
  const ids: string[] = []
  for (const n of lower) {
    const id = cachedLabelIds.get(n)
    if (id) ids.push(id)
  }
  return ids
}

export interface CreatedIssue {
  id: string
  url: string
  identifier: string
}

export async function createIssue(
  apiKey: string,
  input: { teamId: string; title: string; description: string; labelIds: string[] },
): Promise<CreatedIssue> {
  const data = (await linearGraphQL(
    apiKey,
    `mutation($input: IssueCreateInput!) {
       issueCreate(input: $input) {
         success
         issue { id url identifier }
       }
     }`,
    { input },
  )) as {
    issueCreate?: {
      success: boolean
      issue?: CreatedIssue
    }
  }
  if (!data.issueCreate?.success || !data.issueCreate.issue) {
    throw new Error('issueCreate returned success=false')
  }
  return data.issueCreate.issue
}
```

- [ ] **Step 2: Rewrite `worker/handlers/linear-create-issue.ts` to use the new lib**

Full new content:

```ts
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { linearGraphQL, resolveTeamId, resolveLabelIds, createIssue } from '../lib/linear'

interface Env {
  LINEAR_API_KEY: string
}

interface RequestContext {
  request: Request
  env: Env
}

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

const ADMIN_EMAIL = 'blueman9@gmail.com'
const FIREBASE_PROJECT_ID = 'flightopslog'
const LINEAR_TEAM_NAME = 'FlightOpsLog'

interface RequestBody {
  title: string
  description: string
  labels?: string[]
}

function jsonResponse(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  if (!env.LINEAR_API_KEY) {
    return jsonResponse(500, { error: 'misconfigured' })
  }

  const auth = request.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'unauthorized' })
  }
  const token = auth.slice('Bearer '.length)

  let payload: { email?: string; email_verified?: boolean }
  try {
    const result = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    })
    payload = result.payload as typeof payload
  } catch {
    return jsonResponse(401, { error: 'unauthorized' })
  }

  if (payload.email !== ADMIN_EMAIL || payload.email_verified !== true) {
    return jsonResponse(403, { error: 'forbidden' })
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonResponse(400, { error: 'invalid_request', detail: 'body is not JSON' })
  }

  if (typeof body.title !== 'string' || body.title.length === 0 || body.title.length > 300) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'title invalid' })
  }
  if (typeof body.description !== 'string' || body.description.length > 50000) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'description invalid' })
  }
  const labelNames = Array.isArray(body.labels) ? body.labels : ['feedback']
  if (
    labelNames.length > 10 ||
    labelNames.some((l) => typeof l !== 'string' || l.length === 0 || l.length > 50)
  ) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'labels invalid' })
  }

  let teamId: string
  try {
    teamId = await resolveTeamId(env.LINEAR_API_KEY, LINEAR_TEAM_NAME)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'lookup failed'
    return jsonResponse(502, { error: 'linear_lookup_failed', detail })
  }

  let labelIds: string[]
  try {
    labelIds = await resolveLabelIds(env.LINEAR_API_KEY, teamId, labelNames)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'lookup failed'
    return jsonResponse(502, { error: 'linear_lookup_failed', detail })
  }

  let issue
  try {
    issue = await createIssue(env.LINEAR_API_KEY, {
      teamId,
      title: body.title,
      description: body.description,
      labelIds,
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'create failed'
    return jsonResponse(502, { error: 'linear_create_failed', detail })
  }

  // Mark unused for now to silence lint; will be referenced after Task 5.
  void linearGraphQL

  return jsonResponse(200, { id: issue.id, url: issue.url, identifier: issue.identifier })
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: clean build, no errors. ESLint may complain about unused `linearGraphQL` import — if so, remove the `void linearGraphQL` line and the import; both will be re-added in Task 5.

If unused-import is a build-failing error in this project, drop the import in this task and re-add it in Task 5 instead.

- [ ] **Step 4: Commit**

```bash
git add worker/lib/linear.ts worker/handlers/linear-create-issue.ts
git commit -m "refactor(worker): extract Linear GraphQL helpers to lib/linear.ts

Pure refactor in preparation for FL-63 attachment upload. Existing
linear-create-issue endpoint behavior is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add `worker/lib/firebase-rest.ts` helper

**Files:**
- Create: `worker/lib/firebase-rest.ts`

- [ ] **Step 1: Create the file**

```ts
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1'
const STORAGE_BASE = 'https://firebasestorage.googleapis.com/v0'

export interface FirebaseConfig {
  projectId: string
  storageBucket: string
}

export class FirebaseRestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function authHeaders(idToken: string): HeadersInit {
  return { authorization: `Bearer ${idToken}` }
}

// Convert a Firestore REST document representation into a plain JS object.
// Handles the subset of types we use on the feedback collection.
function decodeFirestoreValue(v: unknown): unknown {
  if (typeof v !== 'object' || v === null) return undefined
  const obj = v as Record<string, unknown>
  if ('stringValue' in obj) return obj.stringValue
  if ('booleanValue' in obj) return obj.booleanValue
  if ('integerValue' in obj) return Number(obj.integerValue)
  if ('doubleValue' in obj) return obj.doubleValue
  if ('nullValue' in obj) return null
  if ('timestampValue' in obj) return obj.timestampValue
  if ('mapValue' in obj) {
    const fields = (obj.mapValue as { fields?: Record<string, unknown> }).fields ?? {}
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(fields)) out[k] = decodeFirestoreValue(val)
    return out
  }
  if ('arrayValue' in obj) {
    const values = (obj.arrayValue as { values?: unknown[] }).values ?? []
    return values.map(decodeFirestoreValue)
  }
  return undefined
}

export async function firestoreGetDoc(
  cfg: FirebaseConfig,
  idToken: string,
  collection: string,
  docId: string,
): Promise<Record<string, unknown> | null> {
  const url = `${FIRESTORE_BASE}/projects/${cfg.projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}`
  const res = await fetch(url, { headers: authHeaders(idToken) })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new FirebaseRestError(res.status, `firestore get: ${text.slice(0, 300)}`)
  }
  const body = (await res.json()) as { fields?: Record<string, unknown> }
  const fields = body.fields ?? {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) out[k] = decodeFirestoreValue(v)
  return out
}

// Clear a single field on a doc (sets it to absent via empty-document PATCH + updateMask).
export async function firestoreClearField(
  cfg: FirebaseConfig,
  idToken: string,
  collection: string,
  docId: string,
  fieldPath: string,
): Promise<void> {
  const url = `${FIRESTORE_BASE}/projects/${cfg.projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}?updateMask.fieldPaths=${encodeURIComponent(fieldPath)}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...authHeaders(idToken), 'content-type': 'application/json' },
    body: JSON.stringify({ fields: {} }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new FirebaseRestError(res.status, `firestore patch: ${text.slice(0, 300)}`)
  }
}

// Delete a Storage object. Treats 404 as success (idempotent).
export async function storageDeleteObject(
  cfg: FirebaseConfig,
  idToken: string,
  objectPath: string,
): Promise<void> {
  const url = `${STORAGE_BASE}/b/${cfg.storageBucket}/o/${encodeURIComponent(objectPath)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(idToken),
  })
  if (res.status === 404) return
  if (!res.ok) {
    const text = await res.text()
    throw new FirebaseRestError(res.status, `storage delete: ${text.slice(0, 300)}`)
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add worker/lib/firebase-rest.ts
git commit -m "feat(worker): add Firebase REST helpers for Firestore + Storage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Add Linear file-upload helper

Linear's `fileUpload` mutation returns a presigned upload URL plus headers we must include on the PUT. After upload, `attachmentCreate` links the asset URL to the issue.

**Files:**
- Modify: `worker/lib/linear.ts`

- [ ] **Step 1: Append to `worker/lib/linear.ts`**

Add after `createIssue`:

```ts
interface FileUploadResponse {
  fileUpload: {
    success: boolean
    uploadFile: {
      uploadUrl: string
      assetUrl: string
      headers: { key: string; value: string }[]
    }
  }
}

export interface AttachmentInput {
  filename: string
  contentType: string
  sizeBytes: number
  downloadURL: string
}

// Upload bytes from a public URL to Linear's storage and attach to the issue.
// Throws on any failure; caller handles all-or-nothing rollback semantics.
export async function uploadAttachmentToLinear(
  apiKey: string,
  issueId: string,
  attachment: AttachmentInput,
): Promise<void> {
  // 1. Fetch source bytes.
  const srcRes = await fetch(attachment.downloadURL)
  if (!srcRes.ok) {
    throw new Error(`source fetch ${srcRes.status} for ${attachment.filename}`)
  }
  const bytes = await srcRes.arrayBuffer()

  // 2. Request a presigned upload URL from Linear.
  const upload = (await linearGraphQL(
    apiKey,
    `mutation($filename: String!, $contentType: String!, $size: Int!) {
       fileUpload(filename: $filename, contentType: $contentType, size: $size) {
         success
         uploadFile {
           uploadUrl
           assetUrl
           headers { key value }
         }
       }
     }`,
    {
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: bytes.byteLength,
    },
  )) as FileUploadResponse
  if (!upload.fileUpload?.success || !upload.fileUpload.uploadFile) {
    throw new Error(`fileUpload returned success=false for ${attachment.filename}`)
  }
  const { uploadUrl, assetUrl, headers: requiredHeaders } = upload.fileUpload.uploadFile

  // 3. PUT bytes to the presigned URL with the headers Linear requires.
  const putHeaders = new Headers()
  for (const h of requiredHeaders) putHeaders.set(h.key, h.value)
  putHeaders.set('content-type', attachment.contentType)
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: putHeaders,
    body: bytes,
  })
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '')
    throw new Error(`PUT ${putRes.status} for ${attachment.filename}: ${text.slice(0, 200)}`)
  }

  // 4. Link the uploaded asset to the issue.
  const attached = (await linearGraphQL(
    apiKey,
    `mutation($input: AttachmentCreateInput!) {
       attachmentCreate(input: $input) { success }
     }`,
    {
      input: { issueId, url: assetUrl, title: attachment.filename },
    },
  )) as { attachmentCreate?: { success: boolean } }
  if (!attached.attachmentCreate?.success) {
    throw new Error(`attachmentCreate returned success=false for ${attachment.filename}`)
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add worker/lib/linear.ts
git commit -m "feat(worker): add Linear file upload + attachment helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Extend `linear-create-issue` with attachment upload

All-or-nothing: if any attachment upload fails, return 502 with the orphan issue URL.

**Files:**
- Modify: `worker/handlers/linear-create-issue.ts`

- [ ] **Step 1: Add Attachment input shape and extend handler**

Replace the file with:

```ts
import { jwtVerify, createRemoteJWKSet } from 'jose'
import {
  resolveTeamId,
  resolveLabelIds,
  createIssue,
  uploadAttachmentToLinear,
  type AttachmentInput,
} from '../lib/linear'

interface Env {
  LINEAR_API_KEY: string
}

interface RequestContext {
  request: Request
  env: Env
}

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

const ADMIN_EMAIL = 'blueman9@gmail.com'
const FIREBASE_PROJECT_ID = 'flightopslog'
const LINEAR_TEAM_NAME = 'FlightOpsLog'
const MAX_ATTACHMENTS = 4

interface AttachmentBody {
  filename: string
  contentType: string
  sizeBytes: number
  downloadURL: string
}

interface RequestBody {
  title: string
  description: string
  labels?: string[]
  attachments?: AttachmentBody[]
}

function jsonResponse(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function isValidAttachment(a: unknown): a is AttachmentBody {
  if (typeof a !== 'object' || a === null) return false
  const x = a as Record<string, unknown>
  return (
    typeof x.filename === 'string' && x.filename.length > 0 && x.filename.length < 256 &&
    typeof x.contentType === 'string' &&
    (x.contentType === 'image/jpeg' || x.contentType === 'text/csv') &&
    typeof x.sizeBytes === 'number' && x.sizeBytes >= 0 && x.sizeBytes < 10 * 1024 * 1024 &&
    typeof x.downloadURL === 'string' && x.downloadURL.startsWith('https://')
  )
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  if (!env.LINEAR_API_KEY) {
    return jsonResponse(500, { error: 'misconfigured' })
  }

  const auth = request.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'unauthorized' })
  }
  const token = auth.slice('Bearer '.length)

  let payload: { email?: string; email_verified?: boolean }
  try {
    const result = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    })
    payload = result.payload as typeof payload
  } catch {
    return jsonResponse(401, { error: 'unauthorized' })
  }

  if (payload.email !== ADMIN_EMAIL || payload.email_verified !== true) {
    return jsonResponse(403, { error: 'forbidden' })
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonResponse(400, { error: 'invalid_request', detail: 'body is not JSON' })
  }

  if (typeof body.title !== 'string' || body.title.length === 0 || body.title.length > 300) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'title invalid' })
  }
  if (typeof body.description !== 'string' || body.description.length > 50000) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'description invalid' })
  }
  const labelNames = Array.isArray(body.labels) ? body.labels : ['feedback']
  if (
    labelNames.length > 10 ||
    labelNames.some((l) => typeof l !== 'string' || l.length === 0 || l.length > 50)
  ) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'labels invalid' })
  }

  const attachments: AttachmentBody[] = Array.isArray(body.attachments) ? body.attachments : []
  if (attachments.length > MAX_ATTACHMENTS) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'too many attachments' })
  }
  if (attachments.some((a) => !isValidAttachment(a))) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'attachment invalid' })
  }

  let teamId: string
  try {
    teamId = await resolveTeamId(env.LINEAR_API_KEY, LINEAR_TEAM_NAME)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'lookup failed'
    return jsonResponse(502, { error: 'linear_lookup_failed', detail })
  }

  let labelIds: string[]
  try {
    labelIds = await resolveLabelIds(env.LINEAR_API_KEY, teamId, labelNames)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'lookup failed'
    return jsonResponse(502, { error: 'linear_lookup_failed', detail })
  }

  let issue
  try {
    issue = await createIssue(env.LINEAR_API_KEY, {
      teamId,
      title: body.title,
      description: body.description,
      labelIds,
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'create failed'
    return jsonResponse(502, { error: 'linear_create_failed', detail })
  }

  if (attachments.length > 0) {
    for (const a of attachments) {
      try {
        const input: AttachmentInput = {
          filename: a.filename,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          downloadURL: a.downloadURL,
        }
        await uploadAttachmentToLinear(env.LINEAR_API_KEY, issue.id, input)
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'upload failed'
        return jsonResponse(502, {
          error: 'attachment_upload_failed',
          issueUrl: issue.url,
          identifier: issue.identifier,
          detail,
        })
      }
    }
  }

  return jsonResponse(200, {
    id: issue.id,
    url: issue.url,
    identifier: issue.identifier,
    attachmentsArchivedToLinear: attachments.length > 0,
  })
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add worker/handlers/linear-create-issue.ts
git commit -m "feat(worker): upload feedback attachments to Linear during issue create

All-or-nothing: any per-file failure returns 502 with the orphan issue
URL so the admin can manually clean up before retrying. Marks
attachmentsArchivedToLinear=true on full success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: New `cleanup-attachments` Worker endpoint

**Files:**
- Create: `worker/handlers/cleanup-attachments.ts`
- Modify: `worker/index.ts`

- [ ] **Step 1: Create handler**

```ts
import { jwtVerify, createRemoteJWKSet } from 'jose'
import {
  firestoreGetDoc,
  firestoreClearField,
  storageDeleteObject,
  FirebaseRestError,
  type FirebaseConfig,
} from '../lib/firebase-rest'

interface RequestContext {
  request: Request
}

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

const ADMIN_EMAIL = 'blueman9@gmail.com'
const FIREBASE_PROJECT_ID = 'flightopslog'
const STORAGE_BUCKET = 'flightopslog.firebasestorage.app'
const MAX_BATCH = 100

const cfg: FirebaseConfig = {
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: STORAGE_BUCKET,
}

interface RequestBody {
  feedbackIds?: unknown
}

type ResultStatus = 'cleaned' | 'skipped' | 'partial' | 'failed'

interface PerResult {
  feedbackId: string
  status: ResultStatus
  detail?: string
}

function jsonResponse(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

interface DocAttachment {
  filename?: unknown
}

function isEligible(doc: Record<string, unknown>): { ok: true } | { ok: false; reason: string } {
  if (doc.status !== 'triaged') return { ok: false, reason: 'not triaged' }
  const atts = doc.attachments
  if (!Array.isArray(atts) || atts.length === 0) return { ok: false, reason: 'no attachments' }
  const archived = doc.attachmentsArchivedToLinear === true
  const hasLinear = typeof doc.linearIssueUrl === 'string' && (doc.linearIssueUrl as string).length > 0
  if (hasLinear && !archived) return { ok: false, reason: 'linear issue exists but not archived' }
  return { ok: true }
}

async function cleanupOne(
  idToken: string,
  feedbackId: string,
): Promise<PerResult> {
  let doc: Record<string, unknown> | null
  try {
    doc = await firestoreGetDoc(cfg, idToken, 'feedback', feedbackId)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'firestore get failed'
    return { feedbackId, status: 'failed', detail }
  }
  if (!doc) {
    return { feedbackId, status: 'skipped', detail: 'doc not found' }
  }

  const elig = isEligible(doc)
  if (!elig.ok) {
    return { feedbackId, status: 'skipped', detail: elig.reason }
  }

  const atts = doc.attachments as DocAttachment[]
  let storageOk = true
  for (const a of atts) {
    if (typeof a.filename !== 'string' || a.filename.length === 0) continue
    const path = `feedback-attachments/${feedbackId}/${a.filename}`
    try {
      await storageDeleteObject(cfg, idToken, path)
    } catch (err) {
      storageOk = false
      const detail = err instanceof FirebaseRestError
        ? `storage ${err.status}: ${err.message}`
        : err instanceof Error ? err.message : 'storage delete failed'
      // Don't return early — try the rest, but report failure overall.
      console.warn(`cleanup ${feedbackId} ${path}: ${detail}`)
    }
  }

  if (!storageOk) {
    return { feedbackId, status: 'failed', detail: 'one or more storage deletes failed' }
  }

  try {
    await firestoreClearField(cfg, idToken, 'feedback', feedbackId, 'attachments')
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'firestore patch failed'
    return { feedbackId, status: 'partial', detail }
  }

  return { feedbackId, status: 'cleaned' }
}

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const auth = request.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'unauthorized' })
  }
  const token = auth.slice('Bearer '.length)

  let payload: { email?: string; email_verified?: boolean }
  try {
    const result = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    })
    payload = result.payload as typeof payload
  } catch {
    return jsonResponse(401, { error: 'unauthorized' })
  }

  if (payload.email !== ADMIN_EMAIL || payload.email_verified !== true) {
    return jsonResponse(403, { error: 'forbidden' })
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonResponse(400, { error: 'invalid_request', detail: 'body is not JSON' })
  }

  const ids = body.feedbackIds
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BATCH) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'feedbackIds invalid' })
  }
  if (ids.some((x) => typeof x !== 'string' || x.length === 0 || x.length > 200)) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'feedbackIds invalid' })
  }

  const results: PerResult[] = []
  for (const id of ids as string[]) {
    results.push(await cleanupOne(token, id))
  }

  const summary = {
    cleaned: results.filter((r) => r.status === 'cleaned').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    partial: results.filter((r) => r.status === 'partial').length,
    failed: results.filter((r) => r.status === 'failed').length,
  }

  return jsonResponse(200, { results, summary })
}
```

- [ ] **Step 2: Modify `worker/index.ts` to route the new endpoint**

Replace contents:

```ts
import { onRequestPost as linearCreateIssue } from './handlers/linear-create-issue'
import { onRequestPost as cleanupAttachments } from './handlers/cleanup-attachments'

declare global {
  interface Env {
    LINEAR_API_KEY: string
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/linear-create-issue' && request.method === 'POST') {
      return linearCreateIssue({ request, env })
    }
    if (url.pathname === '/api/cleanup-attachments' && request.method === 'POST') {
      return cleanupAttachments({ request })
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Verify the storage bucket name**

The `STORAGE_BUCKET` constant is set to `flightopslog.firebasestorage.app`. Modern Firebase projects use this domain; older projects use `<projectId>.appspot.com`. Verify by reading the iOS app's Firebase config or checking the Firebase console. If the iOS app uploads to `flightopslog.appspot.com` instead, edit the constant before continuing.

Use the Firebase MCP `firebase_get_sdk_config` for project `flightopslog` (platform: ios) and check `storageBucket`. Adjust the constant if needed and recommit.

- [ ] **Step 5: Commit**

```bash
git add worker/handlers/cleanup-attachments.ts worker/index.ts
git commit -m "feat(worker): add cleanup-attachments endpoint for FL-63

Sweeps Storage objects + clears attachments field for triaged feedback
that's already archived to Linear (or was discarded). Idempotent
(404-as-success). All deletes attempted per item; per-item statuses
returned to admin.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Add `AttachmentsBlock` component

**Files:**
- Create: `src/admin/AttachmentsBlock.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { Attachment } from './types'

interface Props {
  attachments: Attachment[]
  archivedToLinear: boolean
}

export default function AttachmentsBlock({ attachments, archivedToLinear }: Props) {
  const images = attachments.filter((a) => a.kind === 'image')
  const csvs = attachments.filter((a) => a.kind === 'csv')

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-secondary-text uppercase tracking-wide">
        Attachments
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((a) => (
            <a
              key={a.filename}
              href={a.downloadURL}
              target="_blank"
              rel="noreferrer"
              className="block"
              title={`${a.filename} — ${formatSize(a.sizeBytes)}`}
            >
              <img
                src={a.downloadURL}
                alt={a.filename}
                loading="lazy"
                className="w-24 h-24 object-cover rounded-md border border-secondary-text/20"
              />
              <div className="mt-1 text-xs text-secondary-text max-w-24 truncate">
                {formatSize(a.sizeBytes)}
              </div>
            </a>
          ))}
        </div>
      )}

      {csvs.map((a) => (
        <a
          key={a.filename}
          href={a.downloadURL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm text-action hover:underline"
        >
          <span aria-hidden>📎</span>
          <span>{a.filename}</span>
          <span className="text-xs text-secondary-text">({formatSize(a.sizeBytes)})</span>
        </a>
      ))}

      {archivedToLinear && (
        <div className="text-xs text-secondary-text italic">
          Archived to Linear — eligible for storage cleanup.
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build (component is unused; import in next task).

- [ ] **Step 3: Commit**

```bash
git add src/admin/AttachmentsBlock.tsx
git commit -m "feat(admin): add AttachmentsBlock component for FL-63

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Wire `AttachmentsBlock` and badges into `FeedbackRow`

**Files:**
- Modify: `src/admin/FeedbackRow.tsx`

- [ ] **Step 1: Add badges to the collapsed-row button and the AttachmentsBlock to the expanded section**

In `src/admin/FeedbackRow.tsx`:

1. Add this import near the existing component imports at the top:

```tsx
import AttachmentsBlock from './AttachmentsBlock'
```

2. In the collapsed-row `<button>` (the one with `setExpanded(!expanded)`), add badges between the preview span and the contactEmail span. Replace this block:

```tsx
        <span className="flex-1 text-sm truncate">{preview}</span>
        {feedback.contactEmail && (
```

with:

```tsx
        <span className="flex-1 text-sm truncate">{preview}</span>
        {feedback.attachments && feedback.attachments.length > 0 && (
          <span className="text-xs text-secondary-text" title="Attachments">
            📎 {feedback.attachments.length}
          </span>
        )}
        {feedback.attachmentUploadFailures != null && feedback.attachmentUploadFailures > 0 && (
          <span
            className="text-xs px-2 py-0.5 rounded-full bg-error/10 text-error"
            title="Some attachments failed to upload from the iOS app"
          >
            ⚠ {feedback.attachmentUploadFailures} failed
          </span>
        )}
        {feedback.contactEmail && (
```

3. In the `expanded` section, add the AttachmentsBlock between the body `<pre>` and `<TriageNoteEditor>`. Replace:

```tsx
          <pre className="whitespace-pre-wrap text-sm font-sans">{feedback.body}</pre>
          <TriageNoteEditor feedback={feedback} onChanged={onChanged} />
```

with:

```tsx
          <pre className="whitespace-pre-wrap text-sm font-sans">{feedback.body}</pre>
          {feedback.attachments && feedback.attachments.length > 0 && (
            <AttachmentsBlock
              attachments={feedback.attachments}
              archivedToLinear={feedback.attachmentsArchivedToLinear === true}
            />
          )}
          <TriageNoteEditor feedback={feedback} onChanged={onChanged} />
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`. Sign in to `/admin`. If a real feedback doc with attachments is available, verify the badge + thumbnails render. Otherwise skip.

- [ ] **Step 4: Commit**

```bash
git add src/admin/FeedbackRow.tsx
git commit -m "feat(admin): show attachment badges and previews on feedback rows

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Extend `linearClient.ts` with attachment payload + cleanup call

**Files:**
- Modify: `src/admin/linearClient.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import { auth } from './firebase'
import type { Attachment } from './types'

export interface CreateIssueInput {
  title: string
  description: string
  labels: string[]
  attachments?: Attachment[]
}

export interface CreatedIssue {
  id: string
  url: string
  identifier: string
  attachmentsArchivedToLinear: boolean
}

export class LinearError extends Error {
  status: number
  code: string
  // Some error codes carry an issue URL alongside (e.g. attachment_upload_failed).
  issueUrl?: string
  identifier?: string

  constructor(
    status: number,
    code: string,
    message: string,
    extras?: { issueUrl?: string; identifier?: string },
  ) {
    super(message)
    this.status = status
    this.code = code
    this.issueUrl = extras?.issueUrl
    this.identifier = extras?.identifier
  }
}

interface LinearResponse {
  error?: string
  detail?: string
  id?: string
  url?: string
  identifier?: string
  attachmentsArchivedToLinear?: boolean
  issueUrl?: string
}

async function bearerToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new LinearError(401, 'unauthorized', 'Not signed in')
  return user.getIdToken()
}

export async function createLinearIssue(input: CreateIssueInput): Promise<CreatedIssue> {
  const token = await bearerToken()

  let res: Response
  try {
    res = await fetch('/api/linear-create-issue', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error'
    throw new LinearError(0, 'network', msg)
  }

  let body: LinearResponse | null = null
  try {
    body = (await res.json()) as LinearResponse
  } catch {
    /* leave body null */
  }

  if (!res.ok) {
    const code = body?.error ?? 'unknown'
    const detail = body?.detail ?? ''
    throw new LinearError(res.status, code, detail || code, {
      issueUrl: body?.issueUrl,
      identifier: body?.identifier,
    })
  }

  if (body === null || !body.id || !body.url || !body.identifier) {
    throw new LinearError(502, 'malformed_response', 'Linear response missing fields')
  }
  return {
    id: body.id,
    url: body.url,
    identifier: body.identifier,
    attachmentsArchivedToLinear: body.attachmentsArchivedToLinear === true,
  }
}

export interface CleanupResult {
  feedbackId: string
  status: 'cleaned' | 'skipped' | 'partial' | 'failed'
  detail?: string
}

export interface CleanupResponse {
  results: CleanupResult[]
  summary: { cleaned: number; skipped: number; partial: number; failed: number }
}

export async function cleanupAttachments(feedbackIds: string[]): Promise<CleanupResponse> {
  const token = await bearerToken()
  let res: Response
  try {
    res = await fetch('/api/cleanup-attachments', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ feedbackIds }),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error'
    throw new LinearError(0, 'network', msg)
  }

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* leave body null */
  }

  if (!res.ok) {
    const obj = (body && typeof body === 'object' ? body : {}) as {
      error?: string
      detail?: string
    }
    throw new LinearError(res.status, obj.error ?? 'unknown', obj.detail ?? 'cleanup failed')
  }

  return body as CleanupResponse
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/admin/linearClient.ts
git commit -m "feat(admin): pass attachments through and add cleanupAttachments call

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Update `ConvertToLinearModal` for attachments + partial-failure error

**Files:**
- Modify: `src/admin/ConvertToLinearModal.tsx`

- [ ] **Step 1: Make four changes**

1. Pass `attachments` through in the `submit` function. Replace the `try`/`catch` issue-create block. Find:

```tsx
    let url: string
    try {
      const issue = await createLinearIssue({ title, description, labels })
      url = issue.url
    } catch (err: unknown) {
```

Replace with:

```tsx
    let url: string
    let archivedToLinear = false
    try {
      const issue = await createLinearIssue({
        title,
        description,
        labels,
        attachments: feedback.attachments,
      })
      url = issue.url
      archivedToLinear = issue.attachmentsArchivedToLinear
    } catch (err: unknown) {
```

2. Add `attachment_upload_failed` to the error mapping inside the same `catch`. Find:

```tsx
        if (e.status === 502 && e.code === 'linear_lookup_failed')
          return `Linear lookup failed: ${e.message}`
        if (e.status === 502) return e.message
```

Replace with:

```tsx
        if (e.status === 502 && e.code === 'linear_lookup_failed')
          return `Linear lookup failed: ${e.message}`
        if (e.status === 502 && e.code === 'attachment_upload_failed') {
          const link = e.issueUrl ? ` (${e.identifier ?? 'issue'}: ${e.issueUrl})` : ''
          return `Issue was created but attachments failed to upload${link}. Delete the Linear issue manually if you want to retry.`
        }
        if (e.status === 502) return e.message
```

3. After successful issue create, write `attachmentsArchivedToLinear` onto the doc when applicable. Find:

```tsx
    try {
      await updateDoc(doc(db, 'feedback', feedback.id), {
        status: 'triaged',
        linearIssueUrl: url,
      })
      onCreated(feedback.id, url)
    } catch {
      onPartialFailure(feedback.id, url)
    }
```

Replace with:

```tsx
    try {
      const update: Record<string, unknown> = {
        status: 'triaged',
        linearIssueUrl: url,
      }
      if (archivedToLinear) update.attachmentsArchivedToLinear = true
      await updateDoc(doc(db, 'feedback', feedback.id), update)
      onCreated(feedback.id, url, archivedToLinear)
    } catch {
      onPartialFailure(feedback.id, url, archivedToLinear)
    }
```

4. Update the `Props` interface and add an attachment-count line above the labels section. Find:

```tsx
interface Props {
  feedback: Feedback
  onClose: () => void
  onCreated: (feedbackId: string, linearIssueUrl: string) => void
  onPartialFailure: (feedbackId: string, linearIssueUrl: string) => void
}
```

Replace with:

```tsx
interface Props {
  feedback: Feedback
  onClose: () => void
  onCreated: (feedbackId: string, linearIssueUrl: string, archivedToLinear: boolean) => void
  onPartialFailure: (feedbackId: string, linearIssueUrl: string, archivedToLinear: boolean) => void
}
```

Then add this line just above the labels block — find:

```tsx
          <div>
            <span className="block text-sm font-medium mb-2">Labels</span>
```

Replace with:

```tsx
          {feedback.attachments && feedback.attachments.length > 0 && (
            <div className="text-sm text-secondary-text">
              📎 {feedback.attachments.length} attachment(s) will be uploaded to Linear.
            </div>
          )}
          <div>
            <span className="block text-sm font-medium mb-2">Labels</span>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build will FAIL because `FeedbackList.tsx`'s `onCreated`/`onPartialFailure` handlers don't accept the third arg yet. Continue to Task 12 — the next task fixes the call site. (If you want this task to leave the tree green, run the next task before committing.)

Either: defer this commit until after Task 12, OR commit now knowing the build is red until Task 12 lands. Recommended: bundle Tasks 11 + 12 into one commit. Skip the commit step here.

- [ ] **Step 3: (Skip commit; bundled with Task 12)**

---

## Task 12: Add cleanup sweep button to `FeedbackList`

**Files:**
- Modify: `src/admin/FeedbackList.tsx`
- Create: `src/admin/CleanupModal.tsx`

- [ ] **Step 1: Create `src/admin/CleanupModal.tsx`**

```tsx
import { useEffect } from 'react'
import type { Feedback } from './types'

interface Props {
  eligible: Feedback[]
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function CleanupModal({ eligible, busy, onConfirm, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const fileCount = eligible.reduce((sum, f) => sum + (f.attachments?.length ?? 0), 0)
  const byteSum = eligible.reduce(
    (sum, f) => sum + (f.attachments?.reduce((s, a) => s + a.sizeBytes, 0) ?? 0),
    0,
  )
  const sizeStr =
    byteSum < 1024 * 1024
      ? `${Math.round(byteSum / 1024)} KB`
      : `${(byteSum / 1024 / 1024).toFixed(1)} MB`

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-md">
        <div className="p-6 border-b border-secondary-text/20">
          <h2 className="text-lg font-bold">Clean up Storage</h2>
        </div>
        <div className="p-6 space-y-3 text-sm">
          <p>
            About to delete <strong>{fileCount}</strong> attachment(s) across{' '}
            <strong>{eligible.length}</strong> feedback item(s), freeing ~<strong>{sizeStr}</strong>.
          </p>
          <p className="text-secondary-text text-xs">
            Eligible items are triaged and either already archived to Linear, or were discarded
            without filing. This cannot be undone.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-secondary-text/20 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-secondary-text hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 bg-error text-white rounded-lg disabled:opacity-50"
          >
            {busy ? 'Cleaning…' : 'Confirm cleanup'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Modify `src/admin/FeedbackList.tsx`**

Replace the file contents with:

```tsx
import { useEffect, useState, useCallback, useMemo } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import type { Feedback } from './types'
import FeedbackRow from './FeedbackRow'
import ConvertToLinearModal from './ConvertToLinearModal'
import CleanupModal from './CleanupModal'
import { cleanupAttachments } from './linearClient'

export default function FeedbackList() {
  const [items, setItems] = useState<Feedback[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [convertTarget, setConvertTarget] = useState<Feedback | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const snap = await getDocs(
        query(collection(db, 'feedback'), orderBy('createdAt', 'desc')),
      )
      const docs: Feedback[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Feedback, 'id'>),
      }))
      setItems(docs)
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      setError(
        code === 'permission-denied'
          ? 'Firestore denied this read. Rules may not be deployed yet.'
          : "Couldn't reach Firestore.",
      )
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function patchItem(id: string, patch: Partial<Feedback>) {
    setItems((prev) => (prev ? prev.map((f) => (f.id === id ? { ...f, ...patch } : f)) : prev))
  }

  function removeItem(id: string) {
    setItems((prev) => (prev ? prev.filter((f) => f.id !== id) : prev))
  }

  function onCreated(feedbackId: string, url: string, archived: boolean) {
    const patch: Partial<Feedback> = { status: 'triaged', linearIssueUrl: url }
    if (archived) patch.attachmentsArchivedToLinear = true
    patchItem(feedbackId, patch)
    setConvertTarget(null)
  }

  function onPartialFailure(feedbackId: string, url: string, archived: boolean) {
    const patch: Partial<Feedback> = { linearIssueUrl: url }
    if (archived) patch.attachmentsArchivedToLinear = true
    patchItem(feedbackId, patch)
    setConvertTarget(null)
    setToast(
      `Issue created at ${url}, but couldn't mark this feedback as triaged. Click 'Mark triaged' to fix it.`,
    )
  }

  const filtered = items?.filter((f) => showAll || f.status !== 'triaged') ?? []

  const eligibleForCleanup = useMemo(() => {
    if (!items) return []
    return items.filter((f) => {
      if (f.status !== 'triaged') return false
      if (!f.attachments || f.attachments.length === 0) return false
      const hasLinear = typeof f.linearIssueUrl === 'string' && f.linearIssueUrl.length > 0
      const archived = f.attachmentsArchivedToLinear === true
      // Eligible if archived to Linear, OR if discarded (triaged with no Linear issue).
      return archived || !hasLinear
    })
  }, [items])

  async function runCleanup() {
    setCleanupBusy(true)
    try {
      const ids = eligibleForCleanup.map((f) => f.id)
      const resp = await cleanupAttachments(ids)
      // Clear attachments locally for cleaned items.
      const cleanedSet = new Set(
        resp.results.filter((r) => r.status === 'cleaned').map((r) => r.feedbackId),
      )
      setItems((prev) =>
        prev
          ? prev.map((f) =>
              cleanedSet.has(f.id) ? { ...f, attachments: undefined } : f,
            )
          : prev,
      )
      const { cleaned, skipped, partial, failed } = resp.summary
      setToast(
        `Cleaned ${cleaned}. Skipped ${skipped}. Partial ${partial}. Failed ${failed}.`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cleanup failed.'
      setToast(`Cleanup failed: ${msg}`)
    } finally {
      setCleanupBusy(false)
      setCleanupOpen(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-bold">Feedback</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show triaged
        </label>
        <span className="flex-1" />
        <button
          onClick={() => setCleanupOpen(true)}
          disabled={eligibleForCleanup.length === 0 || cleanupBusy}
          className="text-sm text-action hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
        >
          Clean up Storage ({eligibleForCleanup.length})
        </button>
        <button
          onClick={() => void load()}
          disabled={refreshing}
          className="text-sm text-action hover:underline disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-error/10 text-error rounded-lg px-4 py-2 text-sm">{error}</div>
      )}

      {toast && (
        <div className="bg-warning/10 text-primary border border-warning/40 rounded-lg px-4 py-2 text-sm flex items-start gap-3">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-secondary-text">
            ✕
          </button>
        </div>
      )}

      {items === null && !error && <p className="text-secondary-text text-sm">Loading…</p>}

      {items !== null && filtered.length === 0 && !error && (
        <p className="text-secondary-text text-sm">No feedback to triage.</p>
      )}

      <div className="space-y-3">
        {filtered.map((f) => (
          <FeedbackRow
            key={f.id}
            feedback={f}
            onChanged={patchItem}
            onDeleted={removeItem}
            onConvert={setConvertTarget}
          />
        ))}
      </div>

      {convertTarget && (
        <ConvertToLinearModal
          feedback={convertTarget}
          onClose={() => setConvertTarget(null)}
          onCreated={onCreated}
          onPartialFailure={onPartialFailure}
        />
      )}

      {cleanupOpen && (
        <CleanupModal
          eligible={eligibleForCleanup}
          busy={cleanupBusy}
          onConfirm={() => void runCleanup()}
          onClose={() => setCleanupOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Commit (bundles Task 11 + 12)**

```bash
git add src/admin/ConvertToLinearModal.tsx src/admin/FeedbackList.tsx src/admin/CleanupModal.tsx
git commit -m "feat(admin): wire attachment upload through convert + add cleanup sweep

- ConvertToLinearModal passes attachments through and surfaces the
  attachment_upload_failed orphan-issue error.
- FeedbackList shows a 'Clean up Storage (N)' button that sweeps
  eligible triaged feedback via the new Worker endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Document storage rules deploy in README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Find the existing admin/firebase deploy section in README and add storage**

Open `README.md`. Find the section that documents how functions / Firestore rules deploy (likely under an "Admin dashboard" or "Firebase" heading). Add a new bullet or subsection for storage rules.

If the section doesn't exist or its exact wording is unclear, add this block at the end of the README under a `## Firebase deploys` heading (create the heading if absent):

```markdown
## Firebase deploys

The website depends on Firebase rules and functions deployed from this repo:

- **Firestore rules** — `firestore.rules` (deploy from this repo or wherever they currently live).
- **Storage rules** — `storage.rules`. Deploy with:

  ```bash
  firebase deploy --only storage
  ```

  Run this whenever `storage.rules` changes. The rules allow authenticated
  create on `feedback-attachments/{id}/{filename}` (size + content-type gated)
  and admin-email-only delete; everything else is denied.

- **Cloud Functions** — `functions/`. Deploy with `firebase deploy --only functions`.
```

If a deploy section already exists, integrate the storage bullet into it without duplicating other content.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): document Firebase Storage rules deploy

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Deploy storage rules + Worker (manual + MCP-assisted)

This task requires actions outside the local repo. Execute via Firebase CLI for storage and Cloudflare Worker deploy for the API.

- [ ] **Step 1: Verify the Firebase Storage bucket name matches Task 7**

Use the Firebase MCP `firebase_get_sdk_config` for project `flightopslog` and confirm the `storageBucket` field. If different from `flightopslog.firebasestorage.app`, update `STORAGE_BUCKET` in `worker/handlers/cleanup-attachments.ts` and recommit before deploying.

- [ ] **Step 2: Verify iOS upload auth model**

Read the iOS spec referenced in the website spec to confirm how iOS authenticates uploads. If iOS uploads anonymously (without `auth.signInAnonymously` or similar), the `request.auth != null` clause on `allow create` in `storage.rules` must be removed. Update and recommit if needed.

- [ ] **Step 3: Diff and update Firestore rules**

The deployed Firestore rules must accept `attachmentsArchivedToLinear` as an admin-update field. Check the deployed rules (Firebase console or wherever the source lives) and add this field to the existing admin-write allow-list pattern. The existing `triageNote`, `status`, `linearIssueUrl` fields are already permitted; mirror that handling for `attachmentsArchivedToLinear`. Per memory `feedback_firestore_rules_admin_fields.md`, both `hasOnly()` tolerance AND `!('field' in data)` enforcement may be needed.

- [ ] **Step 4: Deploy Storage rules**

```bash
firebase deploy --only storage --project flightopslog
```

Expected: success, prints the rules version. If `firebase` CLI isn't installed locally, run `npx firebase-tools deploy --only storage --project flightopslog`.

- [ ] **Step 5: Deploy Worker**

```bash
npm run build
npx wrangler deploy
```

Expected: deploy succeeds, prints the Worker URL. Linear API key secret is already in place (existing endpoint depends on it).

- [ ] **Step 6: Smoke test end-to-end**

1. Submit a new feedback from a TestFlight build with at least one image attachment.
2. Open `/admin`, expand the row, verify the thumbnail renders.
3. Click Convert to Linear. Verify the issue is created and the attachment shows up on the Linear issue.
4. Confirm the Firestore doc gains `attachmentsArchivedToLinear: true` and `status: triaged`.
5. Toggle "Show triaged". Confirm the cleanup button shows a count of 1.
6. Click Clean up Storage, confirm. Verify toast shows "Cleaned 1".
7. Refresh the page; expand the triaged row; confirm the attachment thumbnails are gone (attachments field cleared).
8. Verify in the Firebase console that the Storage object is deleted.

- [ ] **Step 7: Add lessons if anything went sideways**

If anything required diagnosis during the smoke test, capture it in `tasks/lessons.md` per the project workflow rule.

---

## Self-review notes

- All spec sections (data model, both Worker endpoints, UI changes, Storage rules, error handling) have corresponding tasks.
- The unused-import edge case in Task 3 → Task 5 is called out and reconciled.
- Task 11 builds red on its own; bundled into Task 12's commit explicitly.
- The storage bucket name is a known configuration value verified at deploy time (Task 14, Step 1).
- iOS auth model is a known unknown verified at deploy time (Task 14, Step 2).
- Firestore rules update is an external dependency flagged in Task 14, Step 3.
- No automated tests added; consistent with project state.
