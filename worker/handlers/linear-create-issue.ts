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
