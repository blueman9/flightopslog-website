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
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

interface LinearResponse {
  error?: string
  detail?: string
  id?: string
  url?: string
  identifier?: string
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

  let body: LinearResponse | null = null
  try {
    body = (await res.json()) as LinearResponse
  } catch {
    /* leave body null */
  }

  if (!res.ok) {
    const code = body?.error ?? 'unknown'
    const detail = body?.detail ?? ''
    throw new LinearError(res.status, code, detail || code)
  }

  if (body === null || !body.id || !body.url || !body.identifier) {
    throw new LinearError(502, 'malformed_response', 'Linear response missing fields')
  }
  return { id: body.id, url: body.url, identifier: body.identifier }
}
