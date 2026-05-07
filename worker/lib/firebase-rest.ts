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
