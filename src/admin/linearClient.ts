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
