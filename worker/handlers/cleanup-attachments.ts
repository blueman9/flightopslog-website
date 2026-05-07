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
  const hasLinear =
    typeof doc.linearIssueUrl === 'string' && (doc.linearIssueUrl as string).length > 0
  if (hasLinear && !archived) return { ok: false, reason: 'linear issue exists but not archived' }
  return { ok: true }
}

async function cleanupOne(idToken: string, feedbackId: string): Promise<PerResult> {
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
      const detail =
        err instanceof FirebaseRestError
          ? `storage ${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'storage delete failed'
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
