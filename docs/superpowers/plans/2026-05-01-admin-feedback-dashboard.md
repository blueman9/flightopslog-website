# Admin Feedback Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private `/admin` route on flightopslog.com to triage in-app feedback from the iOS FlightOps Log app, gated to `blueman9@gmail.com`, with mark-triaged / delete / convert-to-Linear actions.

**Architecture:** Lazy-loaded admin SPA inside the existing Vite/React project. One Cloudflare Pages Function (`/api/linear-create-issue`) holds the Linear API key as a Workers secret, verifies a Firebase ID token via `jose` JWKS, and proxies to Linear's GraphQL API. Firestore reads/updates/deletes happen directly from the browser, gated by security rules in the iOS app repo (rules diff produced as a deliverable, applied separately).

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind v4 (existing); `firebase` Web SDK (Auth + Firestore); `jose` for JWT verification in the Pages Function.

**Testing:** No automated tests for v1 — surface is too small and the repo has no test setup. Each task lists a manual verification step where applicable. Final task runs the verification checklist from the spec.

**Spec:** `docs/superpowers/specs/2026-05-01-admin-feedback-dashboard-design.md`

---

## Task 1: Add SPA fallback and admin noindex to `public/`

**Files:**
- Create: `public/_redirects`
- Create: `public/robots.txt`

- [ ] **Step 1: Create `public/_redirects`**

```
/* /index.html 200
```

- [ ] **Step 2: Create `public/robots.txt`**

```
User-agent: *
Disallow: /admin
```

- [ ] **Step 3: Commit**

```bash
git add public/_redirects public/robots.txt
git commit -m "chore: add SPA fallback and disallow /admin from crawlers"
```

---

## Task 2: Add `firebase` and `jose` dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (regenerated)

- [ ] **Step 1: Confirm npm version**

Run: `npm --version`
Expected: a version starting with `10.` (per the project memory note, Cloudflare Pages requires npm 10 lockfiles).
If it shows `11.x` or higher, use `npx npm@10 install …` for every install command in this task.

- [ ] **Step 2: Install runtime deps**

Run: `npm install firebase jose`
(or `npx npm@10 install firebase jose` if your local npm is 11+)

Expected: `package.json` gains `firebase` and `jose` under `dependencies`; `package-lock.json` regenerates.

- [ ] **Step 3: Verify the build still passes**

Run: `npm run build`
Expected: clean build, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add firebase and jose dependencies"
```

---

## Task 3: Create `.env.example`

**Files:**
- Create: `.env.example`

(`.gitignore` already covers `*.local`, so `.env.local` is ignored without a change.)

- [ ] **Step 1: Create the example file**

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=flightopslog.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=flightopslog
VITE_FIREBASE_APP_ID=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: document admin Firebase env vars"
```

---

## Task 4: Implement the Cloudflare Pages Function

**Files:**
- Create: `functions/api/linear-create-issue.ts`

- [ ] **Step 1: Create the function file**

```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose'

interface Env {
  LINEAR_API_KEY: string
}

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

const ADMIN_EMAIL = 'blueman9@gmail.com'
const FIREBASE_PROJECT_ID = 'flightopslog'
const LINEAR_TEAM_KEY = 'FlightOpsLog'
const LINEAR_API = 'https://api.linear.app/graphql'

let cachedTeamId: string | null = null
const cachedLabelIds = new Map<string, string>()

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

async function linearGraphQL(apiKey: string, query: string, variables?: object) {
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

async function resolveTeamId(apiKey: string): Promise<string> {
  if (cachedTeamId) return cachedTeamId
  const data = await linearGraphQL(
    apiKey,
    `query($key: String!) {
       teams(filter: { key: { eq: $key } }) { nodes { id key } }
     }`,
    { key: LINEAR_TEAM_KEY },
  )
  const nodes = (data.teams as { nodes: { id: string; key: string }[] }).nodes
  const id = nodes[0]?.id
  if (!id) throw new Error(`Team key "${LINEAR_TEAM_KEY}" not found in Linear`)
  cachedTeamId = id
  return id
}

async function resolveLabelIds(apiKey: string, teamId: string, names: string[]): Promise<string[]> {
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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
    teamId = await resolveTeamId(env.LINEAR_API_KEY)
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

  let created: { issueCreate?: { success: boolean; issue?: { id: string; url: string; identifier: string } } }
  try {
    created = (await linearGraphQL(
      env.LINEAR_API_KEY,
      `mutation($input: IssueCreateInput!) {
         issueCreate(input: $input) {
           success
           issue { id url identifier }
         }
       }`,
      {
        input: {
          teamId,
          title: body.title,
          description: body.description,
          labelIds,
        },
      },
    )) as typeof created
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'create failed'
    return jsonResponse(502, { error: 'linear_create_failed', detail })
  }

  if (!created.issueCreate?.success || !created.issueCreate.issue) {
    return jsonResponse(502, { error: 'linear_create_failed', detail: 'issueCreate returned success=false' })
  }
  const { id, url, identifier } = created.issueCreate.issue
  return jsonResponse(200, { id, url, identifier })
}
```

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build`
Expected: clean. (Pages Functions aren't part of the Vite build, but TS in `functions/` shouldn't break anything else either.)

- [ ] **Step 3: Commit**

```bash
git add functions/api/linear-create-issue.ts
git commit -m "feat: add Linear-create-issue Pages Function with Firebase token verify"
```

---

## Task 5: Add admin Firebase init and shared types

**Files:**
- Create: `src/admin/firebase.ts`
- Create: `src/admin/types.ts`

- [ ] **Step 1: Create `src/admin/firebase.ts`**

```typescript
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
}

const app = initializeApp(config)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
```

- [ ] **Step 2: Create `src/admin/types.ts`**

```typescript
import type { Timestamp } from 'firebase/firestore'

export type FeedbackCategory = 'bug' | 'feature' | 'other' | 'question'
export type FeedbackStatus = 'new' | 'triaged'

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
}
```

- [ ] **Step 3: Commit**

```bash
git add src/admin/firebase.ts src/admin/types.ts
git commit -m "feat: scaffold admin Firebase init and Feedback types"
```

---

## Task 6: Sign-in component

**Files:**
- Create: `src/admin/SignIn.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react'
import { signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from './firebase'

export default function SignIn() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setError(null)
    setBusy(true)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      if (code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled. Try again.')
      } else if (code === 'auth/popup-blocked') {
        setError('Your browser blocked the sign-in popup. Allow popups for flightopslog.com.')
      } else if (code === 'auth/network-request-failed') {
        setError("Couldn't reach Google. Check your connection.")
      } else {
        setError(err instanceof Error ? err.message : 'Sign-in failed.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface text-primary px-4">
      <div className="bg-card rounded-xl p-8 shadow-sm max-w-sm w-full">
        <h1 className="text-xl font-bold mb-4 text-center">Admin sign-in</h1>
        <button
          onClick={onClick}
          disabled={busy}
          className="w-full bg-action text-white rounded-lg py-3 font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {error && <p className="mt-4 text-sm text-error">{error}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/SignIn.tsx
git commit -m "feat: add admin SignIn component"
```

---

## Task 7: Linear client (browser-side)

**Files:**
- Create: `src/admin/linearClient.ts`

- [ ] **Step 1: Create the file**

```typescript
import { auth } from './firebase'

export interface CreateIssueInput {
  title: string
  description: string
  labels: string[]
}

export interface CreatedIssue {
  id: string
  url: string
  identifier: string
}

export class LinearError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export async function createLinearIssue(input: CreateIssueInput): Promise<CreatedIssue> {
  const user = auth.currentUser
  if (!user) throw new LinearError(401, 'unauthorized', 'Not signed in')
  const token = await user.getIdToken()

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

  let body: { error?: string; detail?: string; id?: string; url?: string; identifier?: string } | null = null
  try {
    body = (await res.json()) as typeof body
  } catch {
    /* leave body null */
  }

  if (!res.ok) {
    const code = body?.error ?? 'unknown'
    const detail = body?.detail ?? ''
    throw new LinearError(res.status, code, detail || code)
  }

  if (!body?.id || !body.url || !body.identifier) {
    throw new LinearError(502, 'malformed_response', 'Linear response missing fields')
  }
  return { id: body.id, url: body.url, identifier: body.identifier }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/linearClient.ts
git commit -m "feat: add browser-side Linear client wrapping the Pages Function"
```

---

## Task 8: Feedback row component

**Files:**
- Create: `src/admin/FeedbackRow.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState, useEffect, useRef } from 'react'
import { doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Feedback } from './types'

interface Props {
  feedback: Feedback
  onChanged: (id: string, patch: Partial<Feedback>) => void
  onDeleted: (id: string) => void
  onConvert: (feedback: Feedback) => void
}

export default function FeedbackRow({ feedback, onChanged, onDeleted, onConvert }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState<null | 'triage' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    },
    [],
  )

  async function markTriaged() {
    setError(null)
    setBusy('triage')
    try {
      await updateDoc(doc(db, 'feedback', feedback.id), { status: 'triaged' })
      onChanged(feedback.id, { status: 'triaged' })
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      setError(
        code === 'permission-denied'
          ? 'Permission denied. Rules may need redeploying.'
          : "Couldn't save. Try again.",
      )
    } finally {
      setBusy(null)
    }
  }

  function clickDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      confirmTimer.current = window.setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmDelete(false)
    void doDelete()
  }

  async function doDelete() {
    setError(null)
    setBusy('delete')
    try {
      await deleteDoc(doc(db, 'feedback', feedback.id))
      onDeleted(feedback.id)
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      setError(
        code === 'permission-denied'
          ? 'Permission denied. Rules may need redeploying.'
          : "Couldn't delete. Try again.",
      )
      setBusy(null)
    }
  }

  const ago = formatRelative(feedback.createdAt.toDate())
  const preview = feedback.subject ?? truncate(feedback.body, 120)

  return (
    <div className="bg-card rounded-xl shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        <span className="text-xs text-secondary-text w-20 flex-shrink-0">{ago}</span>
        <CategoryPill category={feedback.category} />
        <StatusPill status={feedback.status} />
        <span className="flex-1 text-sm truncate">{preview}</span>
        {feedback.contactEmail && (
          <span className="text-xs text-secondary-text hidden sm:inline">
            {feedback.contactEmail}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-secondary-text/20 px-4 py-3 space-y-3">
          <pre className="whitespace-pre-wrap text-sm font-sans">{feedback.body}</pre>
          <DiagnosticsBlock feedback={feedback} />
          {feedback.logs && (
            <details className="text-xs">
              <summary className="cursor-pointer text-action">View logs</summary>
              <pre className="mt-2 bg-surface rounded p-2 overflow-auto max-h-96">
                {feedback.logs}
              </pre>
            </details>
          )}
        </div>
      )}

      <div className="border-t border-secondary-text/20 px-4 py-2 flex items-center gap-3 text-sm">
        {feedback.linearIssueUrl ? (
          <a
            href={feedback.linearIssueUrl}
            target="_blank"
            rel="noreferrer"
            className="text-action hover:underline"
          >
            ↗ Linear issue
          </a>
        ) : (
          <button
            onClick={() => onConvert(feedback)}
            disabled={busy !== null}
            className="text-action hover:underline disabled:opacity-50"
          >
            Convert to Linear
          </button>
        )}
        {feedback.status !== 'triaged' && (
          <button
            onClick={markTriaged}
            disabled={busy !== null}
            className="text-action hover:underline disabled:opacity-50"
          >
            {busy === 'triage' ? 'Saving…' : 'Mark triaged'}
          </button>
        )}
        <span className="flex-1" />
        <button
          onClick={clickDelete}
          disabled={busy !== null}
          className={`hover:underline disabled:opacity-50 ${
            confirmDelete ? 'text-error font-semibold' : 'text-secondary-text'
          }`}
        >
          {busy === 'delete' ? 'Deleting…' : confirmDelete ? 'Confirm delete?' : 'Delete'}
        </button>
      </div>

      {error && (
        <div className="border-t border-error/20 px-4 py-2 text-xs text-error">{error}</div>
      )}
    </div>
  )
}

function CategoryPill({ category }: { category: Feedback['category'] }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent capitalize">
      {category}
    </span>
  )
}

function StatusPill({ status }: { status: Feedback['status'] }) {
  const cls = status === 'triaged' ? 'bg-success/10 text-success' : 'bg-action/10 text-action'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${cls}`}>{status}</span>
  )
}

function DiagnosticsBlock({ feedback }: { feedback: Feedback }) {
  const rows: Array<[string, string | number]> = [
    ['App version', `${feedback.appVersion} (${feedback.buildNumber})`],
    ['iOS', `${feedback.iosVersion} — ${feedback.deviceModel}`],
    ['Locale', feedback.locale],
    ['Origin screen', feedback.originScreen],
    ['iCloud', feedback.iCloudState],
    [
      'Counts',
      `${feedback.flightCount} flights, ${feedback.pendingSyncCount} pending sync, ${feedback.conflictCount} conflicts`,
    ],
  ]
  if (feedback.contactEmail) rows.push(['Contact', feedback.contactEmail])
  rows.push(['Feedback ID', feedback.id])

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-secondary-text">{k}</dt>
          <dd className="font-mono break-all">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}

function formatRelative(d: Date): string {
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/FeedbackRow.tsx
git commit -m "feat: add FeedbackRow with expand-on-click and triage/delete actions"
```

---

## Task 9: Convert-to-Linear modal

**Files:**
- Create: `src/admin/ConvertToLinearModal.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState, useEffect } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Feedback } from './types'
import { createLinearIssue, LinearError } from './linearClient'

interface Props {
  feedback: Feedback
  onClose: () => void
  onCreated: (feedbackId: string, linearIssueUrl: string) => void
  onPartialFailure: (feedbackId: string, linearIssueUrl: string) => void
}

export default function ConvertToLinearModal({
  feedback,
  onClose,
  onCreated,
  onPartialFailure,
}: Props) {
  const [title, setTitle] = useState(deriveTitle(feedback))
  const [description, setDescription] = useState(deriveDescription(feedback))
  const [labelFeedback, setLabelFeedback] = useState(true)
  const [labelBug, setLabelBug] = useState(feedback.category === 'bug')
  const [labelFeature, setLabelFeature] = useState(feedback.category === 'feature')
  const [labelQuestion, setLabelQuestion] = useState(feedback.category === 'question')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function submit() {
    setError(null)
    setBusy(true)
    const labels: string[] = []
    if (labelFeedback) labels.push('feedback')
    if (labelBug) labels.push('Bug')
    if (labelFeature) labels.push('Feature')
    if (labelQuestion) labels.push('question')

    let url: string
    try {
      const issue = await createLinearIssue({ title, description, labels })
      url = issue.url
    } catch (err: unknown) {
      const e = err as LinearError
      const msg = (() => {
        if (e.status === 401) return 'Authentication expired. Sign out and back in.'
        if (e.status === 403) return "This account isn't allowed to create Linear issues."
        if (e.status === 400) return `Invalid request: ${e.message}`
        if (e.status === 504) return "Couldn't reach Linear. Try again."
        if (e.status === 502 && e.code === 'linear_lookup_failed')
          return "Couldn't find the FlightOpsLog team in Linear."
        if (e.status === 502) return e.message
        if (e.status === 500) return "Server isn't configured. Set LINEAR_API_KEY in Pages."
        if (e.status === 0) return `Network error: ${e.message}`
        return e.message || 'Unknown error.'
      })()
      setError(msg)
      setBusy(false)
      return
    }

    try {
      await updateDoc(doc(db, 'feedback', feedback.id), {
        status: 'triaged',
        linearIssueUrl: url,
      })
      onCreated(feedback.id, url)
    } catch {
      onPartialFailure(feedback.id, url)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-secondary-text/20">
          <h2 className="text-lg font-bold">Convert to Linear issue</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              className="w-full bg-surface rounded-lg px-3 py-2 border border-secondary-text/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={50000}
              rows={12}
              className="w-full bg-surface rounded-lg px-3 py-2 border border-secondary-text/20 font-mono text-sm"
            />
          </div>
          <div>
            <span className="block text-sm font-medium mb-2">Labels</span>
            <div className="flex flex-wrap gap-3 text-sm">
              <Checkbox checked={labelFeedback} onChange={setLabelFeedback} label="feedback" />
              <Checkbox checked={labelBug} onChange={setLabelBug} label="Bug" />
              <Checkbox checked={labelFeature} onChange={setLabelFeature} label="Feature" />
              <Checkbox
                checked={labelQuestion}
                onChange={setLabelQuestion}
                label="question"
              />
            </div>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
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
            onClick={submit}
            disabled={busy || !title.trim()}
            className="px-4 py-2 bg-action text-white rounded-lg disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create issue'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function deriveTitle(f: Feedback): string {
  if (f.subject) return f.subject
  const head = f.body.split('\n')[0].trim()
  const truncated = head.length > 80 ? head.slice(0, 80).trimEnd() + '…' : head
  return `[${f.category}] ${truncated}`
}

function deriveDescription(f: Feedback): string {
  const lines = [f.body, '', '---']
  lines.push(`App version: ${f.appVersion} (${f.buildNumber})`)
  lines.push(`iOS: ${f.iosVersion} — ${f.deviceModel}`)
  lines.push(`Locale: ${f.locale}`)
  lines.push(`Origin screen: ${f.originScreen}`)
  lines.push(`iCloud: ${f.iCloudState}`)
  lines.push(
    `Counts: ${f.flightCount} flights, ${f.pendingSyncCount} pending sync, ${f.conflictCount} conflicts`,
  )
  if (f.contactEmail) lines.push(`Contact: ${f.contactEmail}`)
  lines.push(`Feedback ID: ${f.id}`)
  return lines.join('\n')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/ConvertToLinearModal.tsx
git commit -m "feat: add ConvertToLinearModal with editable defaults and partial-failure handling"
```

---

## Task 10: Feedback list with filter, refresh, toast

**Files:**
- Create: `src/admin/FeedbackList.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import type { Feedback } from './types'
import FeedbackRow from './FeedbackRow'
import ConvertToLinearModal from './ConvertToLinearModal'

export default function FeedbackList() {
  const [items, setItems] = useState<Feedback[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [convertTarget, setConvertTarget] = useState<Feedback | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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

  function onCreated(feedbackId: string, url: string) {
    patchItem(feedbackId, { status: 'triaged', linearIssueUrl: url })
    setConvertTarget(null)
  }

  function onPartialFailure(feedbackId: string, url: string) {
    patchItem(feedbackId, { linearIssueUrl: url })
    setConvertTarget(null)
    setToast(
      `Issue created at ${url}, but couldn't mark this feedback as triaged. Click 'Mark triaged' to fix it.`,
    )
  }

  const filtered = items?.filter((f) => showAll || f.status !== 'triaged') ?? []

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
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/FeedbackList.tsx
git commit -m "feat: add FeedbackList with filter, refresh, and convert-modal wiring"
```

---

## Task 11: Admin shell with auth gating

**Files:**
- Create: `src/admin/AdminApp.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { auth } from './firebase'
import SignIn from './SignIn'
import FeedbackList from './FeedbackList'

const ADMIN_EMAIL = 'blueman9@gmail.com'

type AuthState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; user: User }

export default function AdminApp() {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setState(user ? { kind: 'signed-in', user } : { kind: 'signed-out' })
    })
  }, [])

  if (state.kind === 'loading') {
    return <div className="min-h-screen bg-surface" />
  }
  if (state.kind === 'signed-out') {
    return <SignIn />
  }

  const { user } = state
  if (user.email !== ADMIN_EMAIL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-primary px-4">
        <div className="bg-card rounded-xl p-8 shadow-sm max-w-md w-full text-center">
          <h1 className="text-xl font-bold mb-2">Not authorized</h1>
          <p className="text-secondary-text mb-6">
            <code className="text-sm">{user.email ?? '(no email)'}</code> isn't allowed here.
          </p>
          <button
            onClick={() => void signOut(auth)}
            className="bg-action text-white rounded-lg px-4 py-2"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface text-primary">
      <header className="border-b border-secondary-text/20 px-6 py-3 flex items-center justify-between">
        <span className="font-bold">FlightOps Log Admin</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-secondary-text">{user.email}</span>
          <button onClick={() => void signOut(auth)} className="text-action hover:underline">
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6">
        <FeedbackList />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/AdminApp.tsx
git commit -m "feat: add AdminApp shell with auth state and admin-email gating"
```

---

## Task 12: Wire `/admin` route in `src/main.tsx`

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import PrivacyPolicy from './pages/PrivacyPolicy.tsx'
import Support from './pages/Support.tsx'
import ImportTemplate from './pages/ImportTemplate.tsx'
import TestFlight from './pages/TestFlight.tsx'

const AdminApp = lazy(() => import('./admin/AdminApp.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/support" element={<Support />} />
        <Route path="/import-template" element={<ImportTemplate />} />
        <Route path="/testflight" element={<TestFlight />} />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<div className="min-h-screen bg-surface" />}>
              <AdminApp />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 2: Verify the build passes and the admin chunk is split**

Run: `npm run build`
Expected:
- Clean build, no errors.
- `dist/assets/` contains a separate JS chunk for the admin bundle (something like `AdminApp-<hash>.js`) plus a Firebase chunk; the entry/index chunk does not include Firebase.

If the entry chunk includes Firebase, the lazy import isn't taking — re-check that `AdminApp` is only imported via `lazy(() => import(...))` and not also statically imported anywhere.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: wire lazy /admin route"
```

---

## Task 13: Add admin section to README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

Run: `cat README.md`

- [ ] **Step 2: Append a new section at the end of the file**

Append this section to `README.md` (preserving existing content above it):

```markdown
## Admin Dashboard (`/admin`)

A private feedback-triage dashboard at `flightopslog.com/admin`, locked to a single Google account (`blueman9@gmail.com`). Lists `feedback/*` docs from Firestore and supports mark-triaged, delete, and convert-to-Linear actions.

### How it works

- The route is lazy-loaded (`React.lazy`) so the marketing bundle ships zero Firebase code.
- Sign-in uses Firebase Auth's Google provider client-side; the email is checked in three places: the SPA, Firestore security rules, and the Cloudflare Pages Function.
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
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add admin dashboard section to README"
```

---

## Task 14: Final build and verification checklist

- [ ] **Step 1: Run a clean build**

Run: `rm -rf dist && npm run build`
Expected:
- No TS errors, no warnings.
- `dist/_redirects` and `dist/robots.txt` exist (Vite copies `public/*` verbatim).
- Vite output mentions a separate `AdminApp` chunk in `dist/assets/`.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Bundle check**

Run: `ls -la dist/assets/`
Expected: at least one chunk file containing the admin code (filename includes `AdminApp` or similar) and a separate chunk for Firebase. If you grep for `firebase` in the entry chunk and it is present, lazy-loading is broken.

Run: `grep -l "firebase" dist/assets/*.js | head` and confirm the matching files are NOT the entry chunk (the one referenced from `dist/index.html`).

- [ ] **Step 4: Note items the agent cannot verify in isolation**

Document in the task summary that the following require live Firebase config + a deployed Pages Function and must be verified by the user (matching the spec's verification checklist):

- Sign-in with Google as `blueman9@gmail.com`.
- Sign-in with a non-admin Google account → "Not authorized" pane.
- List load, mark-triaged, delete, and convert-to-Linear flows end-to-end.
- Hard-refresh on `/admin` works (proves `_redirects`).
- `/admin` is `noindex` (proves `robots.txt`).
- `LINEAR_API_KEY` unset / garbage / network-cut edge cases.

- [ ] **Step 5: Commit (only if Step 1 produced any rebuilt artefacts that need tracking — usually nothing to commit)**

If `git status` shows changes, investigate; the build dir is in `.gitignore`, so this should be a no-op.

---

## Task 15: Surface the Firestore rules diff handoff

This task produces no code; it is the user-facing handoff prompt.

- [ ] **Step 1: Print the rules diff to the user, sourced verbatim from the spec section "Firestore security rules diff"**

The diff is in `docs/superpowers/specs/2026-05-01-admin-feedback-dashboard-design.md`. Quote the entire diff block plus the surrounding "Notes" and "Apply timing" paragraphs. Tell the user:

- This is the snippet to apply in the iOS app repo's `firestore.rules`.
- Apply it before exercising the `/admin` route, or first list-load will hit `permission-denied`.
- The plan does not deploy the rules from the website repo.

---

## Self-review

Spec coverage check (each spec section → which task implements it):

- **Architecture / lazy admin route / `_redirects` / robots.txt:** Tasks 1, 12.
- **Packages (`firebase`, `jose`):** Task 2.
- **Components (`firebase.ts`, `types.ts`, `SignIn.tsx`, `AdminApp.tsx`, `FeedbackList.tsx`, `FeedbackRow.tsx`, `ConvertToLinearModal.tsx`, `linearClient.ts`):** Tasks 5, 6, 7, 8, 9, 10, 11.
- **Pages Function (`functions/api/linear-create-issue.ts`):** Task 4.
- **Data flows (sign-in, list, triage/delete, convert):** Tasks 6 + 11 (sign-in), Task 10 (list), Task 8 (triage/delete), Task 9 (convert + partial-failure).
- **Error handling tables:** Implemented across Tasks 6, 7, 8, 9, 10 (auth errors, Firestore errors, Linear errors, partial-failure toast).
- **Firestore rules diff:** Task 15 (handoff).
- **Testing & verification checklist:** Task 14 (build + bundle check); the live checklist runs against deployed Firebase + Pages Function and is the user's responsibility.
- **Deployment (env vars, secret, authorized domains, rules timing):** Task 13 (README) + Task 15 (rules handoff).
- **Open questions / future work:** Captured in spec, no implementation needed.

Naming consistency check:

- `createLinearIssue` (linearClient.ts) — used in ConvertToLinearModal.tsx ✓
- `LinearError` — used in ConvertToLinearModal.tsx ✓
- `Feedback` type, `FeedbackCategory`, `FeedbackStatus` — used consistently across types.ts, FeedbackRow.tsx, FeedbackList.tsx, ConvertToLinearModal.tsx ✓
- `onChanged` / `onDeleted` / `onConvert` props on FeedbackRow — defined in FeedbackList.tsx ✓
- `onCreated` / `onPartialFailure` props on ConvertToLinearModal — defined in FeedbackList.tsx ✓
- Pages Function exports `onRequestPost` — Cloudflare Pages convention ✓
- `ADMIN_EMAIL` constant defined in two places (Function + AdminApp); intentional duplication so server-side enforcement isn't dependent on client constant ✓

No placeholders found.
